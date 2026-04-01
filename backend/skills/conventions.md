# Conventions Discovery Skill

Before writing any code, discover and lock in the project's conventions. This skill is used at the start of every coding task to ensure consistency.

## Step 1: Read Existing Convention Files

```bash
# Primary source of truth
cat CLAUDE.md 2>/dev/null

# Secondary sources
cat .editorconfig 2>/dev/null
cat .prettierrc 2>/dev/null || cat .prettierrc.json 2>/dev/null
cat .eslintrc* 2>/dev/null || cat eslint.config.* 2>/dev/null
cat tsconfig.json 2>/dev/null
cat pyproject.toml 2>/dev/null | head -50
```

## Step 2: Sample Existing Code

Read 5 representative files to extract patterns. Pick files from different layers:
```bash
# Find non-trivial source files (>20 lines, not config)
find src/ app/ lib/ -name '*.ts' -o -name '*.js' -o -name '*.py' 2>/dev/null | head -5
```

For each file, extract:
- **Indent**: tabs or spaces? How many?
- **Quotes**: single or double?
- **Semicolons**: yes or no? (JS/TS)
- **Trailing commas**: yes or no?
- **Import style**: named vs default, relative path style
- **Naming**: camelCase, snake_case, PascalCase, kebab-case for files/variables/functions/classes
- **Comments**: JSDoc? Inline? Section headers?
- **Error handling**: try/catch pattern? Result type? Error callbacks?
- **Export style**: named exports or default exports?

## Step 3: Detect Patterns via Grep

```bash
# Indent style
grep -Pn '^\t' src/**/*.ts 2>/dev/null | head -3    # Tabs
grep -Pn '^  [^ ]' src/**/*.ts 2>/dev/null | head -3  # 2-space
grep -Pn '^    [^ ]' src/**/*.ts 2>/dev/null | head -3 # 4-space

# Semicolons (JS/TS)
grep -c ';$' src/**/*.ts 2>/dev/null | tail -5  # Count lines ending in ;

# Quote style (JS/TS)
grep -c "'" src/**/*.ts 2>/dev/null | tail -5    # Single quotes
grep -c '"' src/**/*.ts 2>/dev/null | tail -5    # Double quotes

# Import style
grep '^import' src/**/*.ts 2>/dev/null | head -10

# Naming convention for files
ls src/**/ 2>/dev/null | head -20  # kebab-case? camelCase? PascalCase?
```

## Step 4: Build Convention Profile

Compile findings into a profile:
```
CONVENTIONS:
- Language: TypeScript
- Indent: 2 spaces
- Quotes: single
- Semicolons: no
- Trailing commas: yes
- File naming: kebab-case (e.g., user-service.ts)
- Variable naming: camelCase
- Class naming: PascalCase
- Function style: arrow functions for callbacks, function declarations for exports
- Import style: named imports, no index re-exports
- Error handling: try/catch with custom error classes
- Export style: named exports
- Test naming: [file].test.ts, describe/it pattern
```

## Step 5: Handle Conflicts

If CLAUDE.md says one thing but the code does another:
1. **Follow the code** — the codebase is the real convention.
2. **Flag the discrepancy** — add a comment in your commit: "Note: CLAUDE.md says X but codebase uses Y. Following codebase."
3. **Never mix conventions** — pick one and be consistent within your changes.

If two existing files disagree with each other:
1. Count which pattern is more common (majority wins).
2. If tied, follow the more recently modified file.

## Step 6: Apply to New Code

When writing new code:
- Match the profile exactly. No personal preferences.
- Copy the import order from existing files.
- Match the file/folder structure pattern.
- Use the same error handling pattern.
- Use the same logging approach.
- Match test structure from existing tests.

## Rules
- Never introduce a new library for something the project already does (e.g., don't add lodash if the project uses vanilla JS).
- Never change existing code style to match your preference.
- If the project has no conventions yet (greenfield), use the defaults from CLAUDE.md or the framework's official style guide.
- Convention discovery should take < 2 minutes. Don't over-analyze.
