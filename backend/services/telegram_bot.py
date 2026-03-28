"""Telegram bot integration — routes messages to agents via Goose."""
import os
import json
import asyncio
from typing import Optional
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from db.database import SessionLocal
from db.models import Agent, Message, new_id, utcnow
from services.pipeline import send_through_pipeline
from services.goose_manager import goose_manager
from services.event_bus import event_bus


class TelegramBot:
    def __init__(self):
        self.app: Optional[Application] = None
        self.running = False
        self._agent_map: dict[int, str] = {}  # chat_id → agent_id

    async def start(self, token: str):
        if self.running:
            return

        self.app = Application.builder().token(token).build()

        self.app.add_handler(CommandHandler('start', self._cmd_start))
        self.app.add_handler(CommandHandler('reset', self._cmd_reset))
        self.app.add_handler(CommandHandler('status', self._cmd_status))
        self.app.add_handler(CommandHandler('agents', self._cmd_agents))
        self.app.add_handler(CommandHandler('use', self._cmd_use))
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_message))

        await self.app.initialize()
        await self.app.start()
        await self.app.updater.start_polling()
        self.running = True

    async def stop(self):
        if self.app and self.running:
            await self.app.updater.stop()
            await self.app.stop()
            await self.app.shutdown()
            self.running = False

    async def _cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            'Welcome to Factory v4!\n\n'
            'Commands:\n'
            '/agents — list available agents\n'
            '/use <agent_name> — select an agent to chat with\n'
            '/status — current agent status\n'
            '/reset — disconnect from current agent'
        )

    async def _cmd_agents(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        db = SessionLocal()
        try:
            agents = db.query(Agent).filter(
                Agent.is_template == False,
                Agent.channels.contains('telegram'),
            ).all()
            if not agents:
                await update.message.reply_text('No agents configured for Telegram.')
                return
            lines = [f'• {a.name} ({a.role})' for a in agents]
            await update.message.reply_text('Available agents:\n' + '\n'.join(lines) + '\n\nUse /use <name> to select one.')
        finally:
            db.close()

    async def _cmd_use(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not context.args:
            await update.message.reply_text('Usage: /use <agent_name>')
            return
        name = ' '.join(context.args)
        db = SessionLocal()
        try:
            agent = db.query(Agent).filter(Agent.name == name).first()
            if not agent:
                await update.message.reply_text(f"Agent '{name}' not found.")
                return
            self._agent_map[update.effective_chat.id] = agent.id
            goose_manager.register_agent(agent.id, agent.name, agent.provider, agent.model, json.loads(agent.tools))
            await update.message.reply_text(f'Connected to {agent.name}. Send messages to chat.')
        finally:
            db.close()

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        agent_id = self._agent_map.get(update.effective_chat.id)
        if not agent_id:
            await update.message.reply_text('No agent selected. Use /use <name>.')
            return
        status = goose_manager.get_status(agent_id)
        await update.message.reply_text(f'Agent status: {status}')

    async def _cmd_reset(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        self._agent_map.pop(update.effective_chat.id, None)
        await update.message.reply_text('Disconnected from agent.')

    async def _on_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        agent_id = self._agent_map.get(update.effective_chat.id)
        if not agent_id:
            await update.message.reply_text('No agent selected. Use /agents and /use <name>.')
            return

        db = SessionLocal()
        try:
            agent = db.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                await update.message.reply_text('Agent not found.')
                return

            # Save incoming message
            db.add(Message(
                id=new_id(), from_agent_id=None, to_agent_id=agent_id,
                content=update.message.text, type='text', channel='telegram',
                timestamp=utcnow(),
            ))
            db.commit()

            # Send through pipeline
            response_text = ''
            agent_dict = {
                'system_prompt': agent.system_prompt,
                'skills': agent.skills,
                'memory': agent.memory,
                'guardrails': agent.guardrails,
            }
            async for chunk in send_through_pipeline(
                agent_id=agent_id, message=update.message.text,
                db=db, agent_data=agent_dict,
            ):
                if chunk.type == 'text':
                    response_text += chunk.content

            # Save response
            db.add(Message(
                id=new_id(), from_agent_id=agent_id, to_agent_id=None,
                content=response_text, type='text', channel='telegram',
                timestamp=utcnow(),
            ))
            db.commit()

            # Send in chunks (Telegram has 4096 char limit)
            for i in range(0, len(response_text), 4000):
                await update.message.reply_text(response_text[i:i+4000])

        except Exception as e:
            await update.message.reply_text(f'Error: {str(e)}')
        finally:
            db.close()


telegram_bot = TelegramBot()
