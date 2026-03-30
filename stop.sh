#!/bin/bash
# Prism — Stop all servers
lsof -i :8000 -t 2>/dev/null | xargs kill 2>/dev/null
lsof -i :3000 -t 2>/dev/null | xargs kill 2>/dev/null
echo "Prism stopped."
