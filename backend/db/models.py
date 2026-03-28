# backend/db/models.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from db.database import Base


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Text, primary_key=True, default=new_id)
    name = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="assistant")
    system_prompt = Column(Text, nullable=False, default="You are a helpful AI agent.")
    model = Column(Text, nullable=False, default="claude-opus-4-20250514")
    provider = Column(Text, nullable=False, default="claude-code")
    tools = Column(Text, nullable=False, default="[]")
    channels = Column(Text, nullable=False, default="[]")
    schedule = Column(Text, nullable=True)
    scheduled_task = Column(Text, nullable=True)
    memory = Column(Text, nullable=False, default="{}")
    skills = Column(Text, nullable=False, default="[]")
    interaction_rules = Column(Text, nullable=False, default='{"mode":"auto"}')
    guardrails = Column(Text, nullable=False, default='{"cost_limit":1.0,"rate_limit":60,"blocked_actions":[]}')
    is_template = Column(Boolean, nullable=False, default=False)
    status = Column(Text, nullable=False, default="idle")
    created_at = Column(Text, nullable=False, default=utcnow)
    updated_at = Column(Text, nullable=False, default=utcnow)


class AgentTemplate(Base):
    __tablename__ = "agent_templates"

    id = Column(Text, primary_key=True, default=new_id)
    name = Column(Text, nullable=False)
    role = Column(Text, nullable=False)
    description = Column(Text, nullable=False, default="")
    system_prompt = Column(Text, nullable=False)
    skills = Column(Text, nullable=False, default="[]")
    tools = Column(Text, nullable=False, default="[]")
    category = Column(Text, nullable=False, default="custom")
    created_at = Column(Text, nullable=False, default=utcnow)


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Text, primary_key=True, default=new_id)
    name = Column(Text, nullable=False, unique=True)
    description = Column(Text, nullable=False, default="")
    type = Column(Text, nullable=False, default="prompt")
    content = Column(Text, nullable=False, default="")
    category = Column(Text, nullable=False, default="building")
    created_at = Column(Text, nullable=False, default=utcnow)
    updated_at = Column(Text, nullable=False, default=utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Text, primary_key=True, default=new_id)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=False, default="")
    brief = Column(Text, nullable=False, default="")
    target_dir = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="planning")
    complexity = Column(Text, nullable=False, default="medium")
    config = Column(Text, nullable=False, default="{}")
    plan_approved = Column(Boolean, nullable=False, default=False)
    langgraph_thread_id = Column(Text, nullable=True)
    created_at = Column(Text, nullable=False, default=utcnow)
    updated_at = Column(Text, nullable=False, default=utcnow)


class ProjectAgent(Base):
    __tablename__ = "project_agents"

    project_id = Column(Text, ForeignKey("projects.id"), primary_key=True)
    agent_id = Column(Text, ForeignKey("agents.id"), primary_key=True)
    role = Column(Text, nullable=False)


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(Text, primary_key=True, default=new_id)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=False, default="")
    nodes = Column(Text, nullable=False, default="[]")
    edges = Column(Text, nullable=False, default="[]")
    is_template = Column(Boolean, nullable=False, default=False)
    status = Column(Text, nullable=False, default="draft")
    created_at = Column(Text, nullable=False, default=utcnow)
    updated_at = Column(Text, nullable=False, default=utcnow)


class WorkflowExecution(Base):
    __tablename__ = "workflow_executions"

    id = Column(Text, primary_key=True, default=new_id)
    workflow_id = Column(Text, nullable=True)
    project_id = Column(Text, ForeignKey("projects.id"), nullable=True)
    status = Column(Text, nullable=False, default="running")
    context = Column(Text, nullable=False, default="{}")
    started_at = Column(Text, nullable=False, default=utcnow)
    completed_at = Column(Text, nullable=True)


class Message(Base):
    __tablename__ = "messages"

    id = Column(Text, primary_key=True, default=new_id)
    from_agent_id = Column(Text, nullable=True)
    to_agent_id = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    type = Column(Text, nullable=False, default="text")
    project_id = Column(Text, nullable=True)
    workflow_execution_id = Column(Text, nullable=True)
    channel = Column(Text, nullable=False, default="internal")
    metadata = Column(Text, nullable=False, default="{}")
    timestamp = Column(Text, nullable=False, default=utcnow)


class ApprovalGate(Base):
    __tablename__ = "approval_gates"

    id = Column(Text, primary_key=True, default=new_id)
    project_id = Column(Text, ForeignKey("projects.id"), nullable=False)
    workflow_execution_id = Column(Text, nullable=True)
    node_id = Column(Text, nullable=False)
    type = Column(Text, nullable=False, default="plan_approval")
    status = Column(Text, nullable=False, default="pending")
    payload = Column(Text, nullable=False, default="{}")
    feedback = Column(Text, nullable=True)
    resolved_at = Column(Text, nullable=True)
    created_at = Column(Text, nullable=False, default=utcnow)


class AgentUsage(Base):
    __tablename__ = "agent_usage"

    id = Column(Text, primary_key=True, default=new_id)
    agent_id = Column(Text, nullable=False)
    message_count = Column(Integer, nullable=False, default=0)
    approximate_tokens = Column(Integer, nullable=False, default=0)
    last_reset_at = Column(Text, nullable=False, default=utcnow)
    updated_at = Column(Text, nullable=False, default=utcnow)
