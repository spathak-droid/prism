#!/bin/bash
# Prism — Start everything with one command
DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Kill any existing processes on our ports
lsof -i :8000 -t 2>/dev/null | xargs kill 2>/dev/null
lsof -i :3000 -t 2>/dev/null | xargs kill 2>/dev/null
sleep 1

cleanup() {
  echo ""
  echo -e "${BLUE}Shutting down...${NC}"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
  exit 0
}
trap cleanup INT TERM

# 1. Backend venv + deps
echo -e "${BOLD}[1/3] Backend setup...${NC}"
if [ ! -d "$DIR/.venv" ]; then
  echo "  Creating virtualenv..."
  python3 -m venv "$DIR/.venv"
fi
source "$DIR/.venv/bin/activate"

# Install deps from pyproject.toml
cd "$DIR/backend"
pip install -q -e ".[dev]" 2>/dev/null || {
  echo "  pip install -e failed, installing deps directly..."
  python3 -c "
import tomllib, pathlib, subprocess, sys
p = tomllib.loads(pathlib.Path('pyproject.toml').read_text())
deps = p['project']['dependencies'] + p['project'].get('optional-dependencies',{}).get('dev',[])
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q'] + deps)
"
}
echo -e "  ${GREEN}Backend deps ready${NC}"

# 2. Frontend deps
echo -e "${BOLD}[2/3] Frontend setup...${NC}"
cd "$DIR/frontend"
if [ ! -d "node_modules" ]; then
  pnpm install
else
  echo -e "  ${GREEN}node_modules exists${NC}"
fi

# 3. Start both servers
echo -e "${BOLD}[3/3] Starting servers...${NC}"

cd "$DIR/backend"
source "$DIR/.venv/bin/activate"
uvicorn server:app --host 0.0.0.0 --port 8000 2>&1 &
BACKEND_PID=$!

cd "$DIR/frontend"
if [ "$DEV" = "1" ]; then
  npx next dev --port 3000 2>&1 &
else
  # Production build is 10x lighter on CPU/RAM than dev mode
  if [ ! -d ".next" ] || [ "$REBUILD" = "1" ]; then
    echo "  Building frontend (one-time)..."
    npx next build 2>&1
  fi
  npx next start --port 3000 2>&1 &
fi
FRONTEND_PID=$!

# Wait for backend to be ready
echo -n "  Waiting for backend"
for i in $(seq 1 30); do
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo ""
    echo -e "  ${GREEN}Backend ready${NC}"
    break
  fi
  echo -n "."
  sleep 1
done

# Wait for frontend
echo -n "  Waiting for frontend"
for i in $(seq 1 30); do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo ""
    echo -e "  ${GREEN}Frontend ready${NC}"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo -e "${GREEN}${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD}  Prism is running!${NC}"
echo -e "${GREEN}${BOLD}========================================${NC}"
echo ""
echo -e "  ${BOLD}Open:${NC}     http://localhost:3000"
echo -e "  ${BOLD}API:${NC}      http://localhost:8000/docs"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop both servers."
echo ""
echo -e "  ${BLUE}Tip:${NC} DEV=1 ./start.sh for hot-reload | REBUILD=1 ./start.sh to rebuild frontend"
echo ""

# Keep running until Ctrl+C
wait
