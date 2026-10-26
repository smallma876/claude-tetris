'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#a1887f', // N - tuerca
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeText = document.getElementById('theme-text');

// El canvas no hereda variables CSS: color de la cuadrícula por tema
const GRID_COLORS = { dark: '#22222e', light: '#e3e6ee' };
let gridColor = GRID_COLORS.dark;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, bestCombo, atStart, pendingEntry, lastEntry, records;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!current) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  restartBtn.textContent = 'Reiniciar';
  updateStats();
  records = loadRecords();
  lastEntry = null;
  pendingEntry = qualifies(score);
  nameForm.classList.toggle('hidden', !pendingEntry);
  recordBadge.classList.add('hidden');
  if (pendingEntry) nameInput.value = 'Jugador';
  recordsSection.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
  // retraso: evita que una tecla aún pulsada (Space) escriba en el campo
  if (pendingEntry) setTimeout(() => { if (pendingEntry) { nameInput.focus(); nameInput.select(); } }, 600);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    restartBtn.textContent = 'Reiniciar';
    nameForm.classList.add('hidden');
    recordBadge.classList.add('hidden');
    recordsSection.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() no puede cancelar el frame en curso: no reprogramar tras game over
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  bestCombo = 0;
  atStart = false;
  pendingEntry = false;
  lastEntry = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameForm.classList.add('hidden');
  recordBadge.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'BUTTON') return;
  if (atStart) {
    if (e.code === 'Enter') init();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

// ---- Récords ----
const RECORDS_KEY = 'tetris.records';
const STATS_KEY = 'tetris.stats';
const MAX_RECORDS = 5;
const recordsSection = document.getElementById('records-section');
const recordsBody = document.getElementById('records-body');
const recordsEmpty = document.getElementById('records-empty');
const recordsTable = document.getElementById('records-table');
const recordsReset = document.getElementById('records-reset');
const statCombo = document.getElementById('stat-combo');
const statLines = document.getElementById('stat-lines');
const recordBadge = document.getElementById('record-badge');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(r => r && typeof r.name === 'string' && Number.isFinite(r.score) &&
        Number.isFinite(r.lines) && Number.isFinite(r.combo) && typeof r.date === 'string')
      .map(r => ({ name: r.name.slice(0, 12), score: r.score, lines: r.lines, combo: r.combo, date: r.date }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (e) {
    return [];
  }
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    if (raw && Number.isFinite(raw.bestCombo) && Number.isFinite(raw.maxLines)) {
      return { bestCombo: raw.bestCombo, maxLines: raw.maxLines };
    }
  } catch (e) { /* ignorar */ }
  return { bestCombo: 0, maxLines: 0 };
}

function qualifies(s) {
  return s > 0 && (records.length < MAX_RECORDS || s > records[records.length - 1].score);
}

function updateStats() {
  const st = loadStats();
  const merged = {
    bestCombo: Math.max(st.bestCombo, bestCombo || 0),
    maxLines: Math.max(st.maxLines, lines || 0),
  };
  try { localStorage.setItem(STATS_KEY, JSON.stringify(merged)); } catch (e) { /* ignorar */ }
}

function saveRecord() {
  if (!pendingEntry) return;
  pendingEntry = false;
  const name = nameInput.value.trim().slice(0, 12) || 'Jugador';
  const entry = { name, score, lines, combo: bestCombo, date: new Date().toISOString() };
  records = loadRecords();
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  records = records.slice(0, MAX_RECORDS);
  lastEntry = records.includes(entry) ? entry : null;
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* ignorar */ }
  nameForm.classList.add('hidden');
  recordBadge.classList.toggle('hidden', !lastEntry);
  renderRecords();
}

function renderRecords() {
  const st = loadStats();
  statCombo.textContent = st.bestCombo;
  statLines.textContent = st.maxLines;
  recordsBody.textContent = '';
  recordsEmpty.classList.toggle('hidden', records.length > 0);
  recordsTable.classList.toggle('hidden', records.length === 0);
  records.forEach((rec, i) => {
    const tr = document.createElement('tr');
    if (rec === lastEntry) tr.className = 'current';
    const d = new Date(rec.date);
    const dateText = isNaN(d) ? '-' : d.toLocaleDateString('es');
    [i + 1, rec.name, rec.score.toLocaleString(), rec.lines, rec.combo, dateText].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    recordsBody.appendChild(tr);
  });
}

function showStart() {
  atStart = true;
  paused = false;
  gameOver = true;
  current = null;
  next = null;
  board = createBoard();
  score = 0; lines = 0; level = 1; combo = 0; bestCombo = 0;
  pendingEntry = false;
  lastEntry = null;
  records = loadRecords();
  updateHUD();
  draw();
  drawNext();
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  nameForm.classList.add('hidden');
  recordBadge.classList.add('hidden');
  recordsSection.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveRecord();
});

recordsReset.addEventListener('click', () => {
  recordsReset.blur();
  if (!confirm('¿Borrar todos los récords y estadísticas?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (e) { /* ignorar */ }
  records = [];
  lastEntry = null;
  pendingEntry = false;
  nameForm.classList.add('hidden');
  recordBadge.classList.add('hidden');
  renderRecords();
});

restartBtn.addEventListener('click', () => {
  saveRecord();
  restartBtn.blur();
  init();
});

function setTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  gridColor = light ? GRID_COLORS.light : GRID_COLORS.dark;
  themeToggle.setAttribute('aria-checked', String(light));
  themeText.textContent = light ? 'Modo claro' : 'Modo oscuro';
  // en pausa/game over el loop no corre: redibujar manualmente
  draw();
  drawNext();
}

themeToggle.addEventListener('click', () => {
  setTheme(themeToggle.getAttribute('aria-checked') === 'true' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space (caída) active el botón enfocado
});

showStart();
