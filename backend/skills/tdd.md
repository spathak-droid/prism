# TDD Skill

You follow strict test-driven development. Write tests first, then implement. This skill defines exact patterns by language.

## Workflow

### 1. Read the Ticket
Parse the ticket's acceptance criteria and test requirements. List every behavior to test:
```
BEHAVIORS TO TEST:
1. [AC1] -> test: "should [expected behavior]"
2. [AC2] -> test: "should [expected behavior]"
```

### 2. Read Conventions
```bash
cat CLAUDE.md   # Project conventions
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null  # Test runner config
```

### 3. Write Failing Tests

**JavaScript/TypeScript (Jest/Vitest)**:
```bash
# Test file location mirrors source: src/utils/foo.ts -> tests/utils/foo.test.ts
# Naming: describe('[ModuleName]', () => { it('should [behavior]', () => { ... }) })
```
```typescript
describe('UserService', () => {
  it('should reject email without @', () => {
    expect(() => validateEmail('invalid')).toThrow('Invalid email')
  })

  it('should return user by ID', async () => {
    const user = await getUser('123')
    expect(user).toMatchObject({ id: '123', email: expect.any(String) })
  })
})
```

**Python (pytest)**:
```bash
# Test file location: src/utils/foo.py -> tests/test_foo.py
# Naming: test_[function]_[scenario]_[expected]
```
```python
def test_validate_email_rejects_missing_at():
    with pytest.raises(ValueError, match="Invalid email"):
        validate_email("invalid")

def test_get_user_returns_user_by_id():
    user = get_user("123")
    assert user["id"] == "123"
```

Run tests — confirm they FAIL:
```bash
npm test 2>/dev/null || npx jest --passWithNoTests 2>/dev/null || pytest -x 2>/dev/null
```

### 4. Implement Minimum Code
Write only enough code to make tests pass. Rules:
- No speculative features.
- No "while I'm here" refactoring.
- If a test needs functionality from another ticket, mock it.
- Match existing code style exactly (read 2-3 nearby files first).

### 5. Verify Green
```bash
# Run full suite, not just new tests
npm test 2>/dev/null || pytest 2>/dev/null
```
All tests must pass. Zero warnings in test output.

### 6. Refactor (if needed)
Only refactor if:
- Duplicate code introduced by this ticket (extract to helper).
- Variable names don't match project conventions.
- Function exceeds 30 lines (split it).

Re-run tests after any refactor.

## When to Skip TDD
- **Pure HTML/CSS** — No testable logic. Use the frontend checklist instead.
- **Config files** — package.json, tsconfig.json, .env.example. Just create them.
- **Static assets** — Images, fonts, icons.
- **Single-file games** — Use game checklist instead. Manual play-testing is the test.

## Coverage Targets
- **API routes**: 80%+ line coverage. Every endpoint tested with valid and invalid input.
- **Business logic**: 90%+ line coverage. Edge cases covered.
- **Utilities**: 100% line coverage. Pure functions are easy to test.
- **UI components**: 60%+ coverage. Test logic, not layout.

Check coverage:
```bash
npx jest --coverage 2>/dev/null || pytest --cov=src 2>/dev/null
```

## Test Quality Rules
- No `test('works')` — test names describe behavior.
- No assertions on implementation details (don't test private methods).
- Each test tests one behavior. Multiple assertions OK if same behavior.
- Tests must not depend on each other or execution order.
- Clean up: close DB connections, clear mocks, reset state.
- No `console.log` in tests. Use assertions.

## Commit
```bash
git add -A
git commit -m "feat(TICKET-ID): [description]

- Tests: [count] new tests, all passing
- Coverage: [X]% on changed files"
```
