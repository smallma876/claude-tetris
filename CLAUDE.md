# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vanilla JS Tetris (HTML5 Canvas). No `package.json`, no build, no tests, no linter. README and UI text are in Spanish; match that for user-facing strings.

## Run

- Open `index.html` directly, or serve statically: `python3 -m http.server 8000` then visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, `game.js` (all logic, one script, global state, `'use strict'`).

- `game.js` holds state in module-level `let` vars (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, ...) assigned in `init()`. Restart button calls `init()` again.
- Board is `ROWS x COLS` matrix; cells are `0` or piece type index 1–8. The same index keys `COLORS` and `PIECES` (index 0 is `null`), and piece shape cells hold their own type number.
- Piece lifecycle: `randomPiece` → `spawn` (promotes `next`, game over if it collides at spawn) → moves via `collide` checks → `lockPiece` (`merge` → `clearLines` → `spawn`).
- Game loop `loop(ts)` uses `requestAnimationFrame` with a `dropAccum` timer vs `dropInterval`; `dropInterval` recomputed in `clearLines` on level change. Pause/game-over cancel the rAF via `animId`; unpause resets `lastTime` and re-enters `loop`.
- Rotation: `rotateCW` + horizontal kick offsets `[0,-1,1,-2,2]` in `tryRotate` (no vertical or SRS kicks).
- Input: single `keydown` listener at bottom of `game.js` using `e.code`.

## Gotchas

- Canvas size is hardcoded in `index.html` (`board` 300x600 = `COLS*BLOCK` x `ROWS*BLOCK`; `next-canvas` 120x120). Changing `COLS`/`ROWS`/`BLOCK` in `game.js` requires updating those attributes.
- `drawNext` uses its own 4x4 grid with block size 30, tied to the 120px next-canvas.
- Element IDs referenced in `game.js` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`) must stay in sync with `index.html`.

## Menú de pausa

- Sección `// ---- Menú de pausa ----` en `game.js`: `P`/`Escape` → `togglePause`/`resumeGame`; `showPauseMenu` muestra `#pause-menu` dentro de `#overlay` y `endGame` lo oculta (`hidePauseMenu`).
- Nivel inicial (select 1–10, `localStorage` `tetris.startLevel`) se captura en `init` como `baseLevel`; `clearLines` hace `level = baseLevel + floor(lines/10)` y `dropInterval = levelInterval(level)`.
- El `keydown` ignora `SELECT` y Space/Enter sobre `input`/`button`; `resumeGuard` descarta repeticiones de teclas mantenidas tras reanudar (se limpia en `keyup` o en la primera pulsación nueva).
