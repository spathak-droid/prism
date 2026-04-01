# Frontend Checklist Skill

Run this checklist after building any frontend/UI project. Every item has a concrete verification step. Do not skip items — mark each PASS or FAIL with evidence.

## Responsive Design
- [ ] **320px (mobile)** — No horizontal scroll. Run: resize browser to 320px or check `@media (max-width: 480px)` exists in CSS. All text readable without zoom.
- [ ] **768px (tablet)** — Layout adapts. Navigation collapses or reflows. No overlapping elements.
- [ ] **1024px (small desktop)** — Content uses available width. No excessive whitespace gutters.
- [ ] **1440px (large desktop)** — Content has max-width or scales. Not stretched edge-to-edge on ultrawide.
- [ ] **Viewport meta tag** — Verify: `grep -r 'viewport' index.html` must find `<meta name="viewport" content="width=device-width, initial-scale=1">`.

## Accessibility
- [ ] **Semantic HTML** — Use `<nav>`, `<main>`, `<section>`, `<article>`, `<button>` (not `<div onclick>`). Verify: `grep -c 'div onclick' *.html` should return 0.
- [ ] **ARIA labels** — Interactive elements without visible text have `aria-label`. Verify: `grep -c 'aria-label' *.html` > 0 for any icon buttons.
- [ ] **Keyboard navigation** — All interactive elements reachable via Tab. Verify: no `tabindex="-1"` on interactive elements. Focus order matches visual order.
- [ ] **Focus indicators** — Verify: `grep 'outline.*none' *.css` — if found, confirm a replacement focus style exists (`:focus-visible` with visible ring).
- [ ] **Color contrast** — Text meets 4.5:1 ratio (AA). Verify: no light-gray-on-white text. Use `#333` minimum on white backgrounds.
- [ ] **Alt text** — Every `<img>` has `alt`. Verify: `grep '<img' *.html | grep -v 'alt='` returns nothing.

## Error & Edge States
- [ ] **Empty state** — UI shows helpful message when data list is empty (not blank screen).
- [ ] **Loading state** — Async operations show spinner or skeleton. No layout jump on load.
- [ ] **Error state** — Network failures show user-friendly message. No raw error objects shown.
- [ ] **Partial data** — Missing optional fields don't crash rendering. Use `?.` or defaults.

## Forms
- [ ] **Client validation** — Required fields marked, validated before submit. Use `required` attribute + JS validation.
- [ ] **Error messages** — Inline, specific ("Email must contain @"), not generic ("Invalid input").
- [ ] **Submit feedback** — Button disables during submission. Success/failure shown after.
- [ ] **Labels** — Every `<input>` has a `<label>` with matching `for`/`id`. Verify: `grep '<input' *.html | grep -v 'id='` returns nothing.

## Performance
- [ ] **No render-blocking scripts** — Scripts use `defer` or are at end of `<body>`. Verify: `grep '<script' index.html | grep -v 'defer'` — only inline scripts allowed.
- [ ] **Images optimized** — Use WebP/AVIF where possible. No images > 500KB without lazy loading.
- [ ] **No unused CSS/JS** — Remove dead code. If using a framework, verify tree-shaking is enabled.

## Meta & SEO
- [ ] **Title tag** — `<title>` exists and is descriptive. Verify: `grep '<title>' index.html`.
- [ ] **Favicon** — `<link rel="icon">` present. Verify: `grep 'favicon' index.html`.
- [ ] **Lang attribute** — `<html lang="en">` set. Verify: `grep 'lang=' index.html`.

## Final Verification
```bash
# Run all grep checks at once:
echo "=== Viewport ===" && grep -c 'viewport' *.html
echo "=== Semantic ===" && grep -c 'div onclick' *.html
echo "=== Alt text ===" && grep '<img' *.html | grep -v 'alt=' | wc -l
echo "=== Labels ===" && grep '<input' *.html | grep -v 'id=' | wc -l
echo "=== Title ===" && grep -c '<title>' *.html
echo "=== Lang ===" && grep -c 'lang=' *.html
```

Output a summary table: Item | Status | Evidence.
