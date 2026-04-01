# Game Checklist Skill

Run this checklist after building any browser-based game. Each item has a concrete verification step. Mark PASS or FAIL.

## Game Loop
- [ ] **requestAnimationFrame** — Never `setInterval`/`setTimeout` for game loop. Verify:
  ```bash
  grep -rn 'setInterval\|setTimeout' *.html *.js | grep -v 'menu\|delay\|debounce'
  ```
  Any match in game loop code is a FAIL.
- [ ] **Delta time** — Frame-rate independent movement. Verify: `grep -rn 'deltaTime\|delta\|dt\|elapsed' *.html *.js` finds delta calculation. Movement formulas multiply by dt.
- [ ] **Canvas cleared each frame** — Verify: `grep -rn 'clearRect\|fillRect.*0.*0.*width.*height' *.html *.js` finds clearing before draw calls.
- [ ] **No logic in render** — Render functions read state only, never modify it. Verify: render/draw functions contain no assignments to game state variables.

## State Machine
- [ ] **Explicit game states** — Enum or object defines states. Verify:
  ```bash
  grep -rn 'MENU\|PLAYING\|PAUSED\|GAME_OVER\|gameState\|state.*=' *.html *.js
  ```
  Must find at least 3 distinct states.
- [ ] **State transitions guarded** — Can't go from GAME_OVER to PAUSED. Input handlers check current state before acting.
- [ ] **Pause support** — If game has pause: verify game loop skips update (not render) when paused. Verify: `grep -rn 'pause\|PAUSED' *.html *.js`.

## Entity Management
- [ ] **Entity lifecycle** — Entities (bullets, enemies, particles) have create/update/destroy phases. Verify: arrays filtered to remove dead entities each frame: `grep -rn 'filter\|splice\|alive\|active\|destroy' *.html *.js`.
- [ ] **No entity leaks** — Off-screen entities removed. Verify: bounds checking exists in update loop.
- [ ] **Object pooling (if >100 entities)** — Reuse objects instead of GC pressure. Optional for small games.

## Input Handling
- [ ] **Input state object** — Keys tracked in object/Map, not inline event handlers. Verify:
  ```bash
  grep -rn 'keys\[.*\]\|keysPressed\|inputState\|keydown.*=.*true' *.html *.js
  ```
  Must find a key-state tracking pattern.
- [ ] **No inline onclick for game input** — Verify: `grep -rn 'onclick.*move\|onclick.*shoot' *.html` returns nothing.
- [ ] **Prevent default on game keys** — Arrow keys and space don't scroll page. Verify: `grep -rn 'preventDefault' *.html *.js` finds it in key handler.

## Collision Detection
- [ ] **Separate collision phase** — Collision checks in own function, not mixed with rendering. Verify: find function named `checkCollision` or `detectCollision` or `collide`.
- [ ] **Correct math** — AABB: `a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y`. Circle: `dist < r1 + r2`. Verify by reading the collision function.
- [ ] **No N^2 without justification** — If > 50 entities, use spatial partitioning or limit checks. For small games, O(n*m) is acceptable.

## Constants & Configuration
- [ ] **No magic numbers** — Speeds, sizes, colors, timings defined as named constants. Verify:
  ```bash
  grep -rn 'const.*SPEED\|const.*SIZE\|const.*COLOR\|const.*RATE\|const.*WIDTH' *.html *.js
  ```
  Must find constants section.
- [ ] **Tuning values grouped** — All gameplay tuning in one section/object for easy adjustment.

## Mobile Support
- [ ] **Touch events** — `touchstart`/`touchmove`/`touchend` handlers exist. Verify: `grep -rn 'touchstart\|touchmove\|touchend' *.html *.js`.
- [ ] **Touch areas large enough** — Minimum 44x44px touch targets.
- [ ] **No hover-dependent mechanics** — Gameplay works without mouse hover.
- [ ] **Viewport meta** — Prevents zoom on double-tap. Verify: `grep 'user-scalable=no\|viewport' *.html`.

## Audio (if applicable)
- [ ] **User gesture required** — Audio context created/resumed on first click/tap, not on load.
- [ ] **Mute toggle** — Player can mute. State persisted in localStorage.

## Persistence
- [ ] **High score saved** — Verify: `grep -rn 'localStorage\|sessionStorage' *.html *.js` finds score save/load.
- [ ] **JSON.parse wrapped in try/catch** — Corrupted storage doesn't crash game.

## Final Verification
Open the HTML file in browser, play through one full game cycle (start -> play -> die -> restart). Confirm no console errors.
