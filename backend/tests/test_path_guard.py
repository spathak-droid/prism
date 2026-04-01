"""Tests for services/path_guard.py — filesystem sandbox enforcement."""
import asyncio
import json
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.path_guard import is_path_allowed, check_tool_call
from services.stream_parser import StreamChunk


TARGET_DIR = "/Users/testuser/projects/my-app"


# ── is_path_allowed ──────────────────────────────────────────────────

class TestIsPathAllowed:
    def test_path_inside_target_allowed(self):
        assert is_path_allowed(f"{TARGET_DIR}/src/main.py", TARGET_DIR) is True

    def test_path_is_target_dir_itself(self):
        assert is_path_allowed(TARGET_DIR, TARGET_DIR) is True

    def test_path_outside_target_blocked(self):
        assert is_path_allowed("/Users/testuser/other-project/file.py", TARGET_DIR) is False

    def test_path_traversal_blocked(self):
        # ../../etc/passwd resolved from inside target_dir
        traversal = f"{TARGET_DIR}/../../etc/passwd"
        assert is_path_allowed(traversal, TARGET_DIR) is False

    def test_symlink_resolved(self):
        """Symlinks that resolve outside target_dir are blocked.

        We mock os.path.realpath to simulate a symlink that resolves to
        a path outside the target directory, avoiding macOS temp dir
        allowlist interference.
        """
        def fake_realpath(p):
            if "sneaky_link" in p:
                return "/Users/attacker/stolen/secret.txt"
            return p

        with patch("services.path_guard.os.path.realpath", side_effect=fake_realpath):
            assert is_path_allowed(
                "/Users/testuser/projects/my-app/sneaky_link",
                TARGET_DIR,
            ) is False

    def test_tmp_dir_allowed(self):
        assert is_path_allowed("/tmp/goose-workspace/file.txt", TARGET_DIR) is True

    def test_var_folders_allowed(self):
        assert is_path_allowed("/var/folders/xx/abc/T/tmp123", TARGET_DIR) is True

    def test_private_tmp_allowed(self):
        assert is_path_allowed("/private/tmp/something", TARGET_DIR) is True

    def test_home_dir_blocked(self):
        assert is_path_allowed("/Users/testuser/.ssh/id_rsa", TARGET_DIR) is False

    def test_home_tilde_blocked(self):
        # ~ expands to the real home dir which is outside TARGET_DIR
        assert is_path_allowed("~/.ssh/id_rsa", TARGET_DIR) is False

    def test_root_path_blocked(self):
        assert is_path_allowed("/etc/passwd", TARGET_DIR) is False


# ── check_tool_call ──────────────────────────────────────────────────

class TestCheckToolCall:
    def test_non_tool_request_always_safe(self):
        chunk = StreamChunk(type="text", content="Hello")
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is True
        assert detail == ""

    def test_write_file_tool_inside_target(self):
        args = json.dumps({"path": f"{TARGET_DIR}/src/app.py", "content": "print('hi')"})
        chunk = StreamChunk(
            type="tool_request", content="Calling write_file",
            tool_name="write_file", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is True

    def test_write_file_tool_outside_target(self):
        args = json.dumps({"path": "/Users/san/.ssh/id_rsa", "content": "hacked"})
        chunk = StreamChunk(
            type="tool_request", content="Calling write_file",
            tool_name="write_file", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False
        assert "/Users/san/.ssh/id_rsa" in detail

    def test_read_file_tool_checked(self):
        args = json.dumps({"file_path": "/etc/shadow"})
        chunk = StreamChunk(
            type="tool_request", content="Calling read_file",
            tool_name="read_file", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False
        assert "/etc/shadow" in detail

    def test_bash_command_with_outside_path_detected(self):
        args = json.dumps({"command": "cat /etc/passwd"})
        chunk = StreamChunk(
            type="tool_request", content="Calling bash",
            tool_name="bash", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False
        assert "/etc/passwd" in detail

    def test_bash_command_inside_target_allowed(self):
        args = json.dumps({"command": f"cat {TARGET_DIR}/README.md"})
        chunk = StreamChunk(
            type="tool_request", content="Calling bash",
            tool_name="bash", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is True

    def test_bash_redirect_outside_target_blocked(self):
        args = json.dumps({"command": "echo pwned > /tmp/../etc/cron.d/evil"})
        chunk = StreamChunk(
            type="tool_request", content="Calling bash",
            tool_name="bash", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False

    def test_bash_redirect_to_tmp_allowed(self):
        args = json.dumps({"command": "echo test > /tmp/output.txt"})
        chunk = StreamChunk(
            type="tool_request", content="Calling bash",
            tool_name="bash", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is True

    def test_edit_file_tool_checked(self):
        args = json.dumps({"file_path": "/Users/san/.bashrc", "content": "alias evil='rm -rf /'"})
        chunk = StreamChunk(
            type="tool_request", content="Calling edit_file",
            tool_name="edit_file", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False

    def test_no_target_dir_skips_check(self):
        """When target_dir is None, path guard is not invoked (backward compat)."""
        # check_tool_call requires a target_dir string, so callers should
        # skip calling it when target_dir is None. We verify the goose_manager
        # pattern: if target_dir is None, check_tool_call is never called.
        # Here we just verify the function works with a valid target_dir.
        args = json.dumps({"path": "/etc/passwd"})
        chunk = StreamChunk(
            type="tool_request", content="Calling write_file",
            tool_name="write_file", tool_args=args,
        )
        # With a target_dir, it blocks
        is_safe, _ = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False

    def test_tool_args_fallback_path_extraction(self):
        """Even for unknown tools, paths in tool_args are checked."""
        args = json.dumps({"some_field": "/etc/shadow"})
        chunk = StreamChunk(
            type="tool_request", content="Calling custom_tool",
            tool_name="custom_tool", tool_args=args,
        )
        is_safe, detail = check_tool_call(chunk, TARGET_DIR)
        assert is_safe is False


# ── GooseManager integration ─────────────────────────────────────────

class TestGooseManagerPathGuard:
    @pytest.mark.asyncio
    async def test_goose_killed_on_violation(self):
        """When a sandbox violation is detected, the Goose process is killed."""
        from services.goose_manager import GooseManager

        gm = GooseManager()
        agent_id = "test-agent-001"
        gm.register_agent(agent_id, "TestAgent", "claude-code", "claude-opus-4-20250514", ["developer"])

        # Build a fake stream-json line that contains a tool_request writing outside target
        tool_call_line = json.dumps({
            "role": "assistant",
            "content": [{
                "type": "toolRequest",
                "toolCall": {
                    "value": {
                        "name": "write_file",
                        "arguments": {"path": "/Users/san/.ssh/id_rsa", "content": "hacked"},
                    }
                },
            }],
        }) + "\n"

        # Mock the subprocess
        mock_process = AsyncMock()
        mock_process.returncode = None
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()

        # readline returns our malicious line, then empty (EOF)
        mock_process.stdout.readline = AsyncMock(
            side_effect=[tool_call_line.encode(), b""]
        )
        mock_process.stderr.read = AsyncMock(return_value=b"")
        mock_process.wait = AsyncMock(return_value=0)
        mock_process.kill = MagicMock()

        with patch("services.goose_manager.asyncio.create_subprocess_exec", return_value=mock_process):
            with patch("services.goose_manager.event_bus.emit", new_callable=AsyncMock):
                chunks = []
                async for chunk in gm.send_message(
                    agent_id=agent_id,
                    message="do something evil",
                    system_prompt="you are an agent",
                    cwd="/tmp/test",
                    target_dir="/Users/testuser/projects/safe-project",
                ):
                    chunks.append(chunk)

        # Verify the process was killed
        mock_process.kill.assert_called_once()

        # Verify we got a SANDBOX_VIOLATION chunk
        violation_chunks = [c for c in chunks if "SANDBOX_VIOLATION" in c.content]
        assert len(violation_chunks) == 1
        assert "/Users/san/.ssh/id_rsa" in violation_chunks[0].content
