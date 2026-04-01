"""Tests for the validator_node — hard validation via subprocess."""
import asyncio
import json
import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# Helpers to build minimal state dicts for validator_node
def _make_state(target_dir="/tmp/test_project"):
    return {
        "project_id": "test-project-id",
        "brief": "test brief",
        "target_dir": target_dir,
        "complexity": "simple",
        "research": None,
        "plan": None,
        "approved": True,
        "tickets": [],
        "ticket_results": {},
        "review_cycles": {},
        "validation": None,
        "status": "building",
        "error": None,
    }


def _mock_event_bus():
    """Return a mock event_bus with async emit."""
    bus = MagicMock()
    bus.emit = AsyncMock()
    return bus


def _mock_state_funcs():
    """Return mocked update_phase, read_state, write_state."""
    return MagicMock(), MagicMock(return_value={"pipeline": {"phases": {"validator": {"status": "pending"}}}}), MagicMock()


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary project directory."""
    return str(tmp_path)


class TestValidatorRunsNpmTest:
    """test_validator_runs_npm_test: mock subprocess, package.json exists."""

    @pytest.mark.asyncio
    async def test_npm_test_runs_when_package_json_exists(self, tmp_project):
        # Create package.json with test script
        pkg = {"scripts": {"test": "jest"}}
        with open(os.path.join(tmp_project, "package.json"), "w") as f:
            json.dump(pkg, f)

        state = _make_state(tmp_project)

        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(return_value=(b"All tests passed", b""))
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)) as mock_exec:

            from graphs.nodes import validator_node
            result = await validator_node(state)

        assert result["validation"]["status"] == "pass"
        assert any("npm test" in r["command"] for r in result["validation"]["results"])


class TestValidatorRunsPytest:
    """test_validator_runs_pytest: mock subprocess, tests/ dir exists."""

    @pytest.mark.asyncio
    async def test_pytest_runs_when_tests_dir_exists(self, tmp_project):
        os.makedirs(os.path.join(tmp_project, "tests"))

        state = _make_state(tmp_project)

        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(return_value=(b"3 passed", b""))
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)) as mock_exec:

            from graphs.nodes import validator_node
            result = await validator_node(state)

        assert result["validation"]["status"] == "pass"
        assert any("pytest" in r["command"] for r in result["validation"]["results"])


class TestValidatorHtmlCheck:
    """test_validator_html_check: no package.json, check for DOCTYPE."""

    @pytest.mark.asyncio
    async def test_html_doctype_check(self, tmp_project):
        # Create a valid HTML file
        with open(os.path.join(tmp_project, "index.html"), "w") as f:
            f.write("<!DOCTYPE html>\n<html><body>Hello</body></html>")

        state = _make_state(tmp_project)

        # For HTML check, we let the actual subprocess run (it's just python -c)
        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()):

            from graphs.nodes import validator_node
            result = await validator_node(state)

        assert result["validation"]["status"] == "pass"
        assert len(result["validation"]["results"]) == 1
        assert result["validation"]["results"][0]["passed"] is True

    @pytest.mark.asyncio
    async def test_html_missing_doctype_fails(self, tmp_project):
        # Create an invalid HTML file (no DOCTYPE)
        with open(os.path.join(tmp_project, "index.html"), "w") as f:
            f.write("<html><body>Hello</body></html>")

        state = _make_state(tmp_project)

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()):

            from graphs.nodes import validator_node
            result = await validator_node(state)

        assert result["validation"]["status"] == "fail"


class TestValidatorTimeout:
    """test_validator_timeout: command hangs, verify 60s timeout."""

    @pytest.mark.asyncio
    async def test_command_timeout(self, tmp_project):
        # Create package.json to trigger npm test
        pkg = {"scripts": {"test": "jest"}}
        with open(os.path.join(tmp_project, "package.json"), "w") as f:
            json.dump(pkg, f)

        state = _make_state(tmp_project)

        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError())
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()
        mock_proc.returncode = -1

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):

            # We need to also mock asyncio.wait_for to raise TimeoutError
            from graphs.nodes import _run_validation_command
            result = await _run_validation_command(["npm", "test"], tmp_project)

        assert result["passed"] is False
        assert "timed out" in result["output"].lower() or result["exit_code"] == -1


class TestValidatorPassResultFormat:
    """test_validator_pass_result_format."""

    @pytest.mark.asyncio
    async def test_pass_result_structure(self, tmp_project):
        pkg = {"scripts": {"test": "jest", "lint": "eslint ."}}
        with open(os.path.join(tmp_project, "package.json"), "w") as f:
            json.dump(pkg, f)

        state = _make_state(tmp_project)

        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(return_value=(b"OK", b""))
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):

            from graphs.nodes import validator_node
            result = await validator_node(state)

        v = result["validation"]
        assert v["status"] == "pass"
        assert isinstance(v["results"], list)
        assert len(v["results"]) >= 1
        assert "passed" in v["summary"]
        for r in v["results"]:
            assert "command" in r
            assert "exit_code" in r
            assert "passed" in r
            assert "output" in r
            assert r["passed"] is True
            assert r["exit_code"] == 0


class TestValidatorFailResultFormat:
    """test_validator_fail_result_format."""

    @pytest.mark.asyncio
    async def test_fail_result_structure(self, tmp_project):
        pkg = {"scripts": {"test": "jest"}}
        with open(os.path.join(tmp_project, "package.json"), "w") as f:
            json.dump(pkg, f)

        state = _make_state(tmp_project)

        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(return_value=(b"", b"FAIL: 2 tests failed"))
        mock_proc.returncode = 1
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)):

            from graphs.nodes import validator_node
            result = await validator_node(state)

        v = result["validation"]
        assert v["status"] == "fail"
        assert "failed" in v["summary"]
        assert any(r["passed"] is False for r in v["results"])


class TestValidatorReadsClaudeMdCommands:
    """test_validator_reads_claude_md_commands: mock CLAUDE.md with custom commands."""

    @pytest.mark.asyncio
    async def test_reads_custom_commands(self, tmp_project):
        claude_md = """# My Project

## Commands
```bash
python -m pytest --cov
npm run build
```

## Other
Some other content.
"""
        with open(os.path.join(tmp_project, "CLAUDE.md"), "w") as f:
            f.write(claude_md)

        state = _make_state(tmp_project)

        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(return_value=(b"OK", b""))
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()

        with patch("graphs.nodes.event_bus", _mock_event_bus()), \
             patch("graphs.nodes.update_phase", MagicMock()), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=mock_proc)) as mock_exec:

            from graphs.nodes import validator_node
            result = await validator_node(state)

        assert result["validation"]["status"] == "pass"
        # Should have run the 2 commands from CLAUDE.md
        executed_cmds = [call.args for call in mock_exec.call_args_list]
        # Flatten to check command names
        cmd_strs = [" ".join(c) for c in executed_cmds]
        assert any("pytest" in c for c in cmd_strs)
        assert any("npm" in c and "build" in c for c in cmd_strs)

    @pytest.mark.asyncio
    async def test_parse_claude_md_commands_helper(self, tmp_project):
        claude_md = """# Project

## Commands
```bash
npm test
npm run lint
```
"""
        with open(os.path.join(tmp_project, "CLAUDE.md"), "w") as f:
            f.write(claude_md)

        from graphs.nodes import _parse_claude_md_commands
        commands = _parse_claude_md_commands(tmp_project)
        assert len(commands) == 2
        assert commands[0] == ["npm", "test"]
        assert commands[1] == ["npm", "run", "lint"]

    @pytest.mark.asyncio
    async def test_no_claude_md_falls_back(self, tmp_project):
        """When no CLAUDE.md exists, should fall back to default commands."""
        # Create a package.json to trigger npm defaults
        pkg = {"scripts": {"test": "jest"}}
        with open(os.path.join(tmp_project, "package.json"), "w") as f:
            json.dump(pkg, f)

        from graphs.nodes import _parse_claude_md_commands, _discover_default_commands
        cmds = _parse_claude_md_commands(tmp_project)
        assert cmds == []

        defaults = _discover_default_commands(tmp_project)
        assert len(defaults) >= 1
        assert defaults[0] == ["npm", "test"]


class TestCheckValidationOutcome:
    """Test the router function."""

    def test_pass_outcome(self):
        from graphs.nodes import check_validation_outcome
        assert check_validation_outcome({"validation": {"status": "pass"}}) == "pass"

    def test_fail_outcome(self):
        from graphs.nodes import check_validation_outcome
        assert check_validation_outcome({"validation": {"status": "fail"}}) == "fail"

    def test_missing_validation(self):
        from graphs.nodes import check_validation_outcome
        assert check_validation_outcome({}) == "fail"
