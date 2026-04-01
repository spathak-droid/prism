"""Filesystem path validation for Goose agent tool calls.

Intercepts tool_request chunks and kills the agent if it attempts
to access files outside the allowed target_dir.
"""
import os
import re
import json
from typing import Optional
from services.stream_parser import StreamChunk


# Directories that are always allowed (temp dirs used by tools)
ALLOWED_SYSTEM_DIRS = (
    "/tmp",
    "/var/folders",
    "/private/tmp",
    "/private/var/folders",
)

# Tool names that involve file operations
FILE_TOOLS = {"write_file", "read_file", "edit_file", "create_file", "patch"}

# Bash/shell tool names
SHELL_TOOLS = {"bash", "shell", "run_command", "execute_command", "terminal"}

# Commands that take file path arguments
FILE_COMMANDS = (
    "cat", "rm", "mv", "cp", "mkdir", "touch", "chmod", "chown",
    "less", "more", "head", "tail", "nano", "vim", "vi", "code",
    "sed", "awk", "tee", "ln", "rmdir", "stat", "file",
)

# Regex to extract paths from text: absolute paths, home-relative, or traversal
_PATH_RE = re.compile(
    r'(?:^|[\s"\'=:,])('
    r'/[^\s"\'`,;|&><!(){}\[\]]*'  # absolute paths
    r'|~/[^\s"\'`,;|&><!(){}\[\]]*'  # home-relative
    r'|\.\./[^\s"\'`,;|&><!(){}\[\]]*'  # relative traversal
    r')'
)


def is_path_allowed(file_path: str, target_dir: str) -> bool:
    """Check if a file path is within target_dir. Resolves symlinks and ../"""
    # Expand ~ to home directory
    expanded = os.path.expanduser(file_path)
    # Resolve to absolute real path (follows symlinks, resolves ..)
    resolved = os.path.realpath(expanded)
    resolved_target = os.path.realpath(target_dir)

    # Allow if path is within target_dir
    if resolved.startswith(resolved_target + os.sep) or resolved == resolved_target:
        return True

    # Allow system temp directories
    for allowed in ALLOWED_SYSTEM_DIRS:
        if resolved.startswith(allowed + os.sep) or resolved == allowed:
            return True

    return False


def _extract_paths_from_text(text: str) -> list[str]:
    """Extract file paths from arbitrary text."""
    paths = []
    for match in _PATH_RE.finditer(text):
        path = match.group(1).strip()
        # Skip common false positives
        if path in ("/", "//") or path.startswith("//"):
            continue
        # Strip trailing punctuation that's not part of a path
        path = path.rstrip(".,;:!?)")
        if len(path) > 1:
            paths.append(path)
    return paths


def _extract_paths_from_bash(command: str) -> list[str]:
    """Extract file paths from a bash/shell command string."""
    paths = []

    # Check for output redirection: > file, >> file, 2> file
    redirect_re = re.compile(r'[12]?>>\s*([^\s;|&]+)|[12]?>\s*([^\s;|&]+)')
    for match in redirect_re.finditer(command):
        path = match.group(1) or match.group(2)
        if path:
            paths.append(path)

    # Extract paths from known file commands
    # Split on pipes and semicolons to get individual commands
    parts = re.split(r'[;|]', command)
    for part in parts:
        tokens = part.strip().split()
        if not tokens:
            continue
        cmd = os.path.basename(tokens[0])
        if cmd in FILE_COMMANDS:
            for token in tokens[1:]:
                # Skip flags
                if token.startswith("-"):
                    continue
                # If it looks like a path
                if token.startswith("/") or token.startswith("~") or token.startswith(".."):
                    paths.append(token)

    # Also do general path extraction
    paths.extend(_extract_paths_from_text(command))

    return paths


def check_tool_call(chunk: StreamChunk, target_dir: str) -> tuple[bool, str]:
    """Check if a tool_request chunk contains file operations outside target_dir.

    Returns (is_safe, violation_detail).
    """
    if chunk.type != "tool_request":
        return (True, "")

    tool_name = (chunk.tool_name or "").lower()
    paths_to_check: list[str] = []

    # Parse tool_args as JSON if available
    args_dict: dict = {}
    if chunk.tool_args:
        try:
            args_dict = json.loads(chunk.tool_args)
        except (json.JSONDecodeError, TypeError):
            pass

    # File operation tools — extract path from arguments
    if tool_name in FILE_TOOLS:
        for key in ("path", "file_path", "file", "filename", "target"):
            val = args_dict.get(key)
            if val and isinstance(val, str):
                paths_to_check.append(val)
        # Also scan all string values for paths
        for val in args_dict.values():
            if isinstance(val, str):
                paths_to_check.extend(_extract_paths_from_text(val))

    # Shell/bash tools — parse the command
    elif tool_name in SHELL_TOOLS:
        command = args_dict.get("command") or args_dict.get("cmd") or ""
        if isinstance(command, str) and command:
            paths_to_check.extend(_extract_paths_from_bash(command))

    # For any tool, scan tool_args text for paths as a fallback
    if chunk.tool_args:
        paths_to_check.extend(_extract_paths_from_text(chunk.tool_args))

    # Deduplicate
    seen = set()
    unique_paths = []
    for p in paths_to_check:
        if p not in seen:
            seen.add(p)
            unique_paths.append(p)

    # Check each path
    for path in unique_paths:
        if not is_path_allowed(path, target_dir):
            return (False, f"Attempted to access {path}")

    return (True, "")
