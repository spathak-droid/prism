# Workflow Selection at Project Creation

## Problem
Projects auto-assign a pipeline based on brief text analysis. Users have no visibility or control over which stages run, making the system feel like a black box with only Planner/Builder/Reviewer visible.

## Solution
Add a second step to the project creation dialog where users pick a preset workflow then toggle individual stages on/off before creating the project.

## UI: Two-Step Create Dialog

### Step 1 (unchanged)
- Name (text input, required)
- Brief (textarea, required)
- Target Directory (text input with folder browser, required)
- "Next" button

### Step 2: Pipeline Configuration
- **Preset cards** (3 options, horizontal row):
  - **Simple**: Planner, Builder, Reviewer
  - **Medium**: Researcher, Planner, Approval, Builder, Reviewer, Deployer
  - **Complex**: Same as Medium
  - Selecting a preset pre-toggles the stages below
  - Once user manually toggles a stage, preset clears to "Custom"

- **Stage toggle list** (fixed order, vertical):
  | Stage | Default (Simple) | Locked |
  |-------|-------------------|--------|
  | Researcher | off | no |
  | Planner | on | yes (always required) |
  | Approval | off | no |
  | Builder | on | yes (always required) |
  | Reviewer | on | no |
  | Deployer | off | no |

- **Visual preview strip**: Active stages shown as connected node badges at bottom, updates live as toggles change.

- Buttons: "Back" (returns to step 1), "Create Project" (submits)

## Backend Changes

### API: POST /api/projects
Add optional `stages` field to request body:
```json
{
  "name": "My Project",
  "brief": "A todo app",
  "targetDir": "/path/to/project",
  "stages": ["planner", "coder", "reviewer"]
}
```

- `stages` omitted: fall back to current auto-assessment from brief (backward compatible)
- `stages` provided: use directly, skip complexity assessment
- Validation: `planner` and `coder` must always be present, reject with 400 otherwise

### Project Factory
- When `stages` is provided, create only agents for selected stages
- Build pipeline graph dynamically by filtering existing graph definitions to include only active stages
- Store selected stages in `Project.config` JSON field (no schema changes)

### Stage-to-Agent Mapping
| Stage Key | Agent Role | Description |
|-----------|-----------|-------------|
| researcher | researcher | Research and context gathering |
| planner | planner | Plan generation and ticket creation |
| approval | approval | Manual approval gate |
| coder | coder | Code implementation |
| reviewer | reviewer | Code review with retry loop |
| deployer | deployer | Deployment steps |

## Constraints
- Stage order is fixed: Researcher > Planner > Approval > Builder > Reviewer > Deployer
- Planner and Builder are always required
- Reviewer-to-Builder retry loop only exists when both are active
- No new database tables or models needed
