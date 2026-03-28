#!/bin/bash
# Factory v4 CLI — Create and monitor projects from the terminal
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

API="http://localhost:8000"

usage() {
    echo -e "${BOLD}Factory v4 CLI${NC}"
    echo ""
    echo "Usage:"
    echo "  ./cli.sh new <name> <brief> <target_dir>  Create a new project"
    echo "  ./cli.sh status <project_id>               Check project status"
    echo "  ./cli.sh list                               List all projects"
    echo "  ./cli.sh agents                             List all agents"
    echo "  ./cli.sh demo                               Setup demo agents"
    echo "  ./cli.sh health                             Check server health"
    echo ""
}

health() {
    echo -e "${BLUE}Checking server health...${NC}"
    response=$(curl -s "$API/api/health" 2>/dev/null)
    if [ $? -eq 0 ] && echo "$response" | grep -q "ok"; then
        echo -e "${GREEN}✓ Server is running${NC}"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        echo -e "${RED}✗ Server not responding at $API${NC}"
        echo "Start it with: cd backend && uvicorn server:app --port 8000"
        exit 1
    fi
}

new_project() {
    local name="$1"
    local brief="$2"
    local target_dir="$3"

    if [ -z "$name" ] || [ -z "$brief" ] || [ -z "$target_dir" ]; then
        echo -e "${RED}Error: name, brief, and target_dir required${NC}"
        echo "Usage: ./cli.sh new <name> <brief> <target_dir>"
        exit 1
    fi

    echo -e "${BOLD}Creating project: $name${NC}"
    echo -e "Brief: $brief"
    echo -e "Target: $target_dir"
    echo ""

    response=$(curl -s -X POST "$API/api/projects" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$name\", \"brief\": \"$brief\", \"targetDir\": \"$target_dir\"}")

    project_id=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    complexity=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['complexity'])" 2>/dev/null)

    if [ -z "$project_id" ]; then
        echo -e "${RED}Failed to create project${NC}"
        echo "$response"
        exit 1
    fi

    echo -e "${GREEN}✓ Project created: $project_id${NC}"
    echo -e "Complexity: ${YELLOW}$complexity${NC}"
    echo ""
    echo -e "${BLUE}Pipeline running... Use './cli.sh status $project_id' to check progress${NC}"
}

project_status() {
    local project_id="$1"
    if [ -z "$project_id" ]; then
        echo -e "${RED}Error: project_id required${NC}"
        exit 1
    fi

    response=$(curl -s "$API/api/projects/$project_id")

    echo -e "${BOLD}Project Status${NC}"
    echo "$response" | python3 -c "
import sys, json
p = json.load(sys.stdin)
print(f\"  Name: {p['name']}\")
print(f\"  Status: {p['status']}\")
print(f\"  Complexity: {p['complexity']}\")
print(f\"  Target: {p['targetDir']}\")
if p.get('state') and p['state'].get('pipeline'):
    print(f\"  Current Phase: {p['state']['pipeline'].get('current_phase', 'N/A')}\")
    for phase, data in p['state']['pipeline'].get('phases', {}).items():
        status = data.get('status', 'unknown')
        icon = '✓' if status == 'completed' else '→' if status == 'in_progress' else '○' if status == 'pending' else '⊘'
        print(f\"    {icon} {phase}: {status}\")
if p.get('agents'):
    print(f\"  Agents:\")
    for a in p['agents']:
        print(f\"    - {a['name']} ({a['role']}): {a['status']}\")
" 2>/dev/null || echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

list_projects() {
    echo -e "${BOLD}Projects${NC}"
    response=$(curl -s "$API/api/projects")
    echo "$response" | python3 -c "
import sys, json
projects = json.load(sys.stdin)
if not projects:
    print('  No projects yet. Create one with: ./cli.sh new <name> <brief> <target_dir>')
for p in projects:
    status_color = '32' if p['status'] == 'completed' else '33' if p['status'] in ('planning','building') else '31'
    print(f\"  \033[{status_color}m●\033[0m {p['name']} [{p['status']}] ({p['complexity']}) — {p['id'][:8]}\")
" 2>/dev/null || echo "$response"
}

list_agents() {
    echo -e "${BOLD}Agents${NC}"
    response=$(curl -s "$API/api/agents")
    echo "$response" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
if not agents:
    print('  No agents yet. Run: ./cli.sh demo')
for a in agents:
    print(f\"  • {a['name']} ({a['role']}) — {a['status']}\")
" 2>/dev/null || echo "$response"
}

demo_setup() {
    echo -e "${BLUE}Setting up demo agents...${NC}"
    response=$(curl -s -X POST "$API/api/demo/setup")
    echo -e "${GREEN}✓ Done${NC}"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

case "${1:-}" in
    new) new_project "$2" "$3" "$4" ;;
    status) project_status "$2" ;;
    list) list_projects ;;
    agents) list_agents ;;
    demo) demo_setup ;;
    health) health ;;
    *) usage ;;
esac
