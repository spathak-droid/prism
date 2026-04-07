# Research Quality Gate

Checklist to verify your research output before returning it. Run through every item.

## Verification Checklist

### Source Quality
- [ ] Every technology in `tech_landscape` was evaluated with at least one WebSearch
- [ ] No claims are based solely on training data — if unverified, prefix with "UNVERIFIED:"
- [ ] Version numbers were confirmed via WebSearch, not recalled from memory
- [ ] Pricing data was checked against current pricing pages, not assumed

### Completeness
- [ ] Every major component from the brief has options in `tech_landscape`
- [ ] At least one risk is flagged (if you found zero risks, you missed something)
- [ ] `constraints.must_use` only contains technologies explicitly required by the brief
- [ ] `constraints.avoid` cites the specific issue (CVE number, deprecation notice, etc.)

### Brief Cross-Check
- [ ] Every technology assumption in the brief was challenged or verified
- [ ] Scale assumptions are flagged if unquantified
- [ ] External service dependencies have verified availability and pricing
- [ ] Compliance implications are surfaced if implied by the brief

### Output Validity
- [ ] JSON is wrapped in ```json fences
- [ ] JSON is valid (no trailing commas, proper quoting)
- [ ] `type` field is set to `"research_output"`
- [ ] Every `TechOption` has: name, version, maturity, strengths, weaknesses, community_health
- [ ] Every `Risk` has: category, severity, description, mitigation

## Common Mistakes to Avoid
- Listing a technology you didn't actually WebSearch — remove it or mark UNVERIFIED
- Confusing star count with community health — check contributor count and last commit
- Trusting training data for pricing — always verify current pricing pages
- Padding with weak options to fill the template — 2 strong options beats 4 weak ones
