"""Telegram bot integration — routes messages to agents and triggers workflows."""
import os
import json
import asyncio
import time
from typing import Optional
from telegram import BotCommand, Update
from telegram.constants import ChatAction
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from db.database import SessionLocal
from db.models import Agent, Workflow, WorkflowExecution, Message, TelegramSession, new_id, utcnow
from services.pipeline import send_through_pipeline
from services.goose_manager import goose_manager
from services.event_bus import event_bus


class TelegramBot:
    def __init__(self):
        self.app: Optional[Application] = None
        self.running = False
        self._agent_map: dict[int, str] = {}  # chat_id → agent_id
        self._workflow_executions: dict[int, str] = {}  # chat_id → execution_id

    async def start(self, token: str):
        if self.running:
            return

        self.app = Application.builder().token(token).build()

        self.app.add_handler(CommandHandler('start', self._cmd_start))
        self.app.add_handler(CommandHandler('help', self._cmd_start))
        self.app.add_handler(CommandHandler('reset', self._cmd_reset))
        self.app.add_handler(CommandHandler('status', self._cmd_status))
        self.app.add_handler(CommandHandler('agents', self._cmd_agents))
        self.app.add_handler(CommandHandler('use', self._cmd_use))
        self.app.add_handler(CommandHandler('workflows', self._cmd_workflows))
        self.app.add_handler(CommandHandler('run', self._cmd_run))
        self.app.add_handler(CommandHandler('stop', self._cmd_stop))
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_message))

        await self.app.initialize()
        await self.app.start()

        await self.app.bot.set_my_commands([
            BotCommand('start', 'Welcome message'),
            BotCommand('help', 'Show all commands'),
            BotCommand('agents', 'List available agents'),
            BotCommand('use', 'Select an agent — /use <name>'),
            BotCommand('workflows', 'List available workflows'),
            BotCommand('run', 'Run a workflow — /run <name> | <task>'),
            BotCommand('stop', 'Stop running workflow'),
            BotCommand('status', 'Current agent/workflow status'),
            BotCommand('reset', 'Disconnect from current agent'),
        ])

        await self.app.updater.start_polling()
        self.running = True

        # Restore persisted chat→agent bindings
        self._load_sessions()

    async def stop(self):
        if self.app and self.running:
            await self.app.updater.stop()
            await self.app.stop()
            await self.app.shutdown()
            self.running = False

    def _load_sessions(self):
        db = SessionLocal()
        try:
            sessions = db.query(TelegramSession).all()
            for s in sessions:
                agent = db.query(Agent).filter(Agent.id == s.agent_id).first()
                if not agent:
                    # Agent was deleted — clean up stale session
                    db.query(TelegramSession).filter(TelegramSession.chat_id == s.chat_id).delete()
                    continue
                self._agent_map[s.chat_id] = s.agent_id
                goose_manager.register_agent(
                    agent.id, agent.name, agent.provider,
                    agent.model, json.loads(agent.tools),
                )
            db.commit()
        finally:
            db.close()

    def _save_session(self, chat_id: int, agent_id: str):
        db = SessionLocal()
        try:
            existing = db.query(TelegramSession).filter(TelegramSession.chat_id == chat_id).first()
            if existing:
                existing.agent_id = agent_id
            else:
                db.add(TelegramSession(chat_id=chat_id, agent_id=agent_id))
            db.commit()
        finally:
            db.close()

    def _delete_session(self, chat_id: int):
        db = SessionLocal()
        try:
            db.query(TelegramSession).filter(TelegramSession.chat_id == chat_id).delete()
            db.commit()
        finally:
            db.close()

    async def _cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            '*Prism*\n'
            '\n'
            '*Agents*\n'
            '/agents — list agents\n'
            '/use `name` — connect to agent\n'
            '\n'
            '*Workflows*\n'
            '/workflows — list workflows\n'
            '/run `name` | `task` — run a workflow\n'
            '/stop — stop running workflow\n'
            '\n'
            '/status — check connection\n'
            '/reset — disconnect',
            parse_mode='Markdown',
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
            lines = [f'\u2022 `{a.name}` \u2014 {a.role}' for a in agents]
            await update.message.reply_text(
                '*Agents*\n\n' + '\n'.join(lines) + '\n\nConnect with /use `name`',
                parse_mode='Markdown',
            )
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
            self._save_session(update.effective_chat.id, agent.id)
            goose_manager.register_agent(agent.id, agent.name, agent.provider, agent.model, json.loads(agent.tools))
            await update.message.reply_text(f'Connected to {agent.name}. Send messages to chat.')
        finally:
            db.close()

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        chat_id = update.effective_chat.id
        parts = []

        # Agent status
        agent_id = self._agent_map.get(chat_id)
        if agent_id:
            status = goose_manager.get_status(agent_id)
            db = SessionLocal()
            try:
                agent = db.query(Agent).filter(Agent.id == agent_id).first()
                parts.append(f'*Agent:* `{agent.name if agent else agent_id}` ({status})')
            finally:
                db.close()

        # Workflow execution status
        exec_id = self._workflow_executions.get(chat_id)
        if exec_id:
            db = SessionLocal()
            try:
                exc = db.query(WorkflowExecution).filter(WorkflowExecution.id == exec_id).first()
                if exc:
                    ctx = json.loads(exc.context) if exc.context else {}
                    current = ctx.get('currentNode', 'none')
                    done = len(ctx.get('nodeResults', {}))
                    parts.append(f'*Workflow:* {exc.status} (node: {current}, {done} done)')
            finally:
                db.close()

        if not parts:
            await update.message.reply_text('No agent or workflow active. Use /use or /run.')
            return
        await update.message.reply_text('\n'.join(parts), parse_mode='Markdown')

    async def _cmd_reset(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        self._agent_map.pop(update.effective_chat.id, None)
        self._delete_session(update.effective_chat.id)
        self._workflow_executions.pop(update.effective_chat.id, None)
        await update.message.reply_text('Disconnected.')

    # ---- Workflow commands ----

    async def _cmd_workflows(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        db = SessionLocal()
        try:
            workflows = db.query(Workflow).filter(Workflow.is_template == False).all()
            templates = db.query(Workflow).filter(Workflow.is_template == True).all()

            lines = []
            if workflows:
                lines.append('*Your Workflows*')
                for w in workflows:
                    node_count = len(json.loads(w.nodes))
                    lines.append(f'\u2022 `{w.name}` \u2014 {node_count} nodes')

            if templates:
                lines.append('\n*Templates*')
                for t in templates:
                    lines.append(f'\u2022 `{t.name}` \u2014 {t.description or ""}')

            if not lines:
                await update.message.reply_text('No workflows found. Create one in the UI first.')
                return

            lines.append('\nRun with: /run `workflow name` | `your task`')
            await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')
        finally:
            db.close()

    async def _cmd_run(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not context.args:
            await update.message.reply_text(
                'Usage: /run `workflow name` | `task description`\n'
                'Example: /run Research Pipeline | compare React vs Vue for dashboards',
                parse_mode='Markdown',
            )
            return

        raw = ' '.join(context.args)

        # Split on | to separate workflow name from task
        if '|' in raw:
            wf_name, task_input = raw.split('|', 1)
            wf_name = wf_name.strip()
            task_input = task_input.strip()
        else:
            wf_name = raw.strip()
            task_input = ''

        db = SessionLocal()
        try:
            # Find workflow by name (case-insensitive)
            workflow = db.query(Workflow).filter(
                Workflow.name.ilike(f'%{wf_name}%'),
                Workflow.is_template == False,
            ).first()

            if not workflow:
                await update.message.reply_text(
                    f"Workflow '{wf_name}' not found.\nUse /workflows to see available ones."
                )
                return

            nodes = json.loads(workflow.nodes)
            edges = json.loads(workflow.edges)

            # Check all nodes are mapped
            unmapped = [n.get('data', {}).get('label', n['id']) for n in nodes if not n.get('data', {}).get('agentId')]
            if unmapped:
                await update.message.reply_text(
                    f"Can't run — these nodes have no agent assigned: {', '.join(unmapped)}\n"
                    'Map agents in the UI first.'
                )
                return

            if not task_input:
                await update.message.reply_text(
                    f"What should `{workflow.name}` do?\n"
                    'Reply with the task, or use: /run `name` | `task`',
                    parse_mode='Markdown',
                )
                return

            # Create execution
            execution_id = new_id()
            now = utcnow()
            execution = WorkflowExecution(
                id=execution_id, workflow_id=workflow.id,
                status='running', context=json.dumps({}),
                started_at=now,
            )
            db.add(execution)
            workflow.last_execution_id = execution_id
            db.commit()

            self._workflow_executions[update.effective_chat.id] = execution_id

            node_labels = [n.get('data', {}).get('label', n['id']) for n in nodes]
            pipeline_str = ' → '.join(node_labels)

            status_msg = await update.message.reply_text(
                f'*Running:* `{workflow.name}`\n'
                f'*Task:* {task_input[:200]}\n'
                f'*Pipeline:* {pipeline_str}\n\n'
                f'\u23f3 Starting...',
                parse_mode='Markdown',
            )

            await event_bus.emit('workflow:started', {
                'workflow_id': workflow.id, 'execution_id': execution_id,
            })

            # Run workflow in background and track progress
            asyncio.create_task(self._track_workflow(
                update.effective_chat.id, status_msg,
                execution_id, workflow.id, workflow.name,
                nodes, edges, task_input, node_labels,
            ))

        finally:
            db.close()

    async def _track_workflow(
        self, chat_id: int, status_msg, execution_id: str,
        workflow_id: str, workflow_name: str,
        nodes: list, edges: list, task_input: str,
        node_labels: list[str],
    ):
        """Run the workflow and send live updates to Telegram."""
        from graphs.sandbox import build_sandbox_graph, SandboxState
        import traceback

        db = SessionLocal()
        try:
            graph = build_sandbox_graph(nodes, edges)
            if not graph:
                await status_msg.edit_text(f'\u274c No valid nodes in workflow.')
                return

            compiled = graph.compile()
            initial_state: SandboxState = {
                'workflow_id': workflow_id,
                'execution_id': execution_id,
                'node_results': {},
                'current_node': None,
                'status': 'running',
                'error': None,
                'task_input': task_input,
            }

            # Start a background task to poll and update the telegram message
            poll_task = asyncio.create_task(self._poll_execution_status(
                status_msg, execution_id, workflow_name, task_input, node_labels,
            ))

            result = await compiled.ainvoke(initial_state)

            # Update execution as completed
            execution = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
            if execution:
                execution.status = 'completed'
                execution.context = json.dumps({
                    'nodeResults': result.get('node_results', {}),
                    'currentNode': None,
                    'status': 'completed',
                })
                execution.completed_at = utcnow()
                db.commit()

            poll_task.cancel()

            await event_bus.emit('workflow:completed', {
                'workflow_id': workflow_id, 'execution_id': execution_id,
            })

            # Send final results
            pipeline_str = ' → '.join(node_labels)
            await status_msg.edit_text(
                f'\u2705 *{workflow_name}* completed\n'
                f'*Pipeline:* {pipeline_str}\n',
                parse_mode='Markdown',
            )

            # Send each node result as a separate message
            node_results = result.get('node_results', {})
            for node_id, output in node_results.items():
                node = next((n for n in nodes if n['id'] == node_id), None)
                label = node.get('data', {}).get('label', node_id) if node else node_id
                # Truncate for telegram
                text = f'*{label}*\n\n{output[:3900]}'
                if len(output) > 3900:
                    text += '\n\n_(truncated — see full output in UI)_'
                try:
                    await self.app.bot.send_message(chat_id=chat_id, text=text, parse_mode='Markdown')
                except Exception:
                    # Markdown might fail, send plain
                    await self.app.bot.send_message(chat_id=chat_id, text=f'{label}\n\n{output[:3900]}')

        except Exception as e:
            traceback.print_exc()
            execution = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
            if execution:
                execution.status = 'failed'
                execution.context = json.dumps({
                    'nodeResults': {},
                    'currentNode': None,
                    'status': 'failed',
                    'error': str(e),
                })
                execution.completed_at = utcnow()
                db.commit()

            await event_bus.emit('workflow:failed', {
                'workflow_id': workflow_id, 'execution_id': execution_id, 'error': str(e),
            })

            try:
                await status_msg.edit_text(f'\u274c *{workflow_name}* failed\n\n`{str(e)[:500]}`', parse_mode='Markdown')
            except Exception:
                pass
        finally:
            self._workflow_executions.pop(chat_id, None)
            db.close()

    async def _poll_execution_status(
        self, status_msg, execution_id: str,
        workflow_name: str, task_input: str, node_labels: list[str],
    ):
        """Poll execution status and update the telegram message with progress."""
        pipeline_str = ' → '.join(node_labels)
        last_text = ''
        try:
            while True:
                await asyncio.sleep(5)
                db = SessionLocal()
                try:
                    exc = db.query(WorkflowExecution).filter(WorkflowExecution.id == execution_id).first()
                    if not exc or exc.status != 'running':
                        return
                    ctx = json.loads(exc.context) if exc.context else {}
                    current_node = ctx.get('currentNode', '')
                    done_nodes = list(ctx.get('nodeResults', {}).keys())

                    # Build progress bar
                    progress_parts = []
                    for label in node_labels:
                        node_id = f'node-{label.lower()}'
                        if any(node_id in d for d in done_nodes):
                            progress_parts.append(f'\u2705 {label}')
                        elif current_node and label.lower() in current_node.lower():
                            progress_parts.append(f'\u23f3 {label}...')
                        else:
                            progress_parts.append(f'\u2b1c {label}')

                    progress = '\n'.join(progress_parts)
                    text = (
                        f'*Running:* `{workflow_name}`\n'
                        f'*Task:* {task_input[:100]}\n\n'
                        f'{progress}'
                    )

                    if text != last_text:
                        try:
                            await status_msg.edit_text(text, parse_mode='Markdown')
                            last_text = text
                        except Exception:
                            pass
                finally:
                    db.close()
        except asyncio.CancelledError:
            pass

    async def _cmd_stop(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        chat_id = update.effective_chat.id
        exec_id = self._workflow_executions.get(chat_id)
        if not exec_id:
            await update.message.reply_text('No workflow running.')
            return

        db = SessionLocal()
        try:
            exc = db.query(WorkflowExecution).filter(WorkflowExecution.id == exec_id).first()
            if exc:
                exc.status = 'stopped'
                exc.completed_at = utcnow()
                db.commit()
            goose_manager.kill_all()
            self._workflow_executions.pop(chat_id, None)
            await update.message.reply_text('\u23f9 Workflow stopped.')
        finally:
            db.close()

    async def _on_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        agent_id = self._agent_map.get(update.effective_chat.id)
        if not agent_id:
            await update.message.reply_text('No agent selected. Use /agents and /use `name`.',
                                            parse_mode='Markdown')
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

            await event_bus.emit('agent:message', {
                'agent_id': agent_id, 'direction': 'incoming',
                'content': update.message.text[:200], 'channel': 'telegram',
            })

            # Show typing indicator
            await update.effective_chat.send_action(ChatAction.TYPING)

            # Send through pipeline, stream to Telegram
            response_text = ''
            sent_msg = None
            last_edit = 0
            edit_interval = 1.5  # seconds between edits to avoid rate limits

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

                    now = time.monotonic()
                    if now - last_edit >= edit_interval and response_text.strip():
                        # Keep refreshing typing indicator
                        await update.effective_chat.send_action(ChatAction.TYPING)

                        if not sent_msg:
                            sent_msg = await update.message.reply_text(response_text[:4000] + ' \u2588')
                        else:
                            try:
                                display = response_text[:4000] + ' \u2588'
                                await sent_msg.edit_text(display)
                            except Exception:
                                pass
                        last_edit = now

            # Final edit with complete text (remove cursor block)
            if sent_msg:
                try:
                    await sent_msg.edit_text(response_text[:4000])
                except Exception:
                    pass
                # Send remaining chunks if response > 4000 chars
                for i in range(4000, len(response_text), 4000):
                    await update.message.reply_text(response_text[i:i+4000])
            elif response_text.strip():
                for i in range(0, len(response_text), 4000):
                    await update.message.reply_text(response_text[i:i+4000])

            # Save response
            db.add(Message(
                id=new_id(), from_agent_id=agent_id, to_agent_id=None,
                content=response_text, type='text', channel='telegram',
                timestamp=utcnow(),
            ))
            db.commit()

            await event_bus.emit('agent:message', {
                'agent_id': agent_id, 'direction': 'outgoing',
                'content': response_text[:200], 'channel': 'telegram',
            })

        except Exception as e:
            await update.message.reply_text(f'Error: {str(e)}')
        finally:
            db.close()


telegram_bot = TelegramBot()
