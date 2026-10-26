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
let combo, bestCombo; // combo: locks seguidos que limpian líneas

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
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = baseLevel + Math.floor(lines / 10);
    dropInterval = levelInterval(level);
    updateHUD();
    combo++;
    bestCombo = Math.max(bestCombo, combo);
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

  if (!current) return; // pantalla de inicio: solo tablero vacío

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
  if (!next) return;
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
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
  hidePauseMenu();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showRecordsOnGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    overlay.classList.add('hidden');
    resumeGuard = true;
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMenu();
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
  baseLevel = startLevel; // el selector solo afecta a la próxima partida
  level = baseLevel;
  paused = false;
  gameOver = false;
  dropInterval = levelInterval(level);
  dropAccum = 0;
  commitRecord(); // reiniciar sin pulsar Guardar: guarda con el nombre escrito
  combo = 0;
  bestCombo = 0;
  hideRecordsUI();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hidePauseMenu();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // escribir en el input / activar botones no debe mover piezas ni pausar
  if (e.target.closest && e.target.closest('input, button')) return;
  if (e.code === 'Enter' && startScreen) { init(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (e.target.tagName === 'SELECT' && e.code === 'Escape') return; // Esc cierra el desplegable
    if (!e.repeat) togglePause();
    return;
  }
  if (paused || gameOver) return;
  // tras reanudar, ignorar teclas mantenidas hasta soltarlas
  if (resumeGuard && e.repeat) return;
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

restartBtn.addEventListener('click', init);

document.addEventListener('keyup', () => { resumeGuard = false; });

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

// ---- Récords ----
const RECORDS_KEY = 'tetris.records';
const STATS_KEY = 'tetris.stats';
const MAX_RECORDS = 5;
const MAX_NAME = 12;

const recordsSection = document.getElementById('records-section');
const recordsBody = document.getElementById('records-body');
const recordsEmpty = document.getElementById('records-empty');
const recordsTable = document.getElementById('records-table');
const statCombo = document.getElementById('stat-combo');
const statLines = document.getElementById('stat-lines');
const recordsReset = document.getElementById('records-reset');
const recordBadge = document.getElementById('record-badge');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

let startScreen = false;
let pendingRecord = null; // récord de esta partida aún sin guardar

function num(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(r => r && typeof r === 'object' && typeof r.score === 'number' && isFinite(r.score))
      .map(r => ({
        name: String(r.name ?? '').slice(0, MAX_NAME) || 'Jugador',
        score: num(r.score),
        lines: num(r.lines),
        combo: num(r.combo),
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (e) {
    return [];
  }
}

function loadStats() {
  try {
    const d = JSON.parse(localStorage.getItem(STATS_KEY));
    return { bestCombo: num(d && d.bestCombo), maxLines: num(d && d.maxLines) };
  } catch (e) {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento */ }
}

function qualifies(pts) {
  const recs = loadRecords();
  return pts > 0 && (recs.length < MAX_RECORDS || pts > recs[recs.length - 1].score);
}

function renderRecords(highlight) {
  const recs = loadRecords();
  const stats = loadStats();
  recordsBody.textContent = '';
  recs.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlight) tr.className = 'new-record';
    [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    recordsBody.appendChild(tr);
  });
  recordsTable.classList.toggle('hidden', !recs.length);
  recordsEmpty.classList.toggle('hidden', !!recs.length);
  statCombo.textContent = stats.bestCombo;
  statLines.textContent = stats.maxLines;
  recordsSection.classList.remove('hidden');
}

function hideRecordsUI() {
  startScreen = false;
  pendingRecord = null;
  recordsSection.classList.add('hidden');
  nameForm.classList.add('hidden');
  recordBadge.classList.add('hidden');
  overlay.classList.remove('start-screen');
  restartBtn.textContent = 'Reiniciar';
}

function showStart() {
  board = createBoard();
  current = next = null;
  paused = false;
  gameOver = true; // sin partida: el teclado no mueve nada
  startScreen = true;
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  overlay.classList.add('start-screen');
  overlay.classList.remove('hidden');
  renderRecords(-1);
  draw();
}

function showRecordsOnGameOver() {
  // estadísticas históricas se actualizan siempre, haya o no récord
  const stats = loadStats();
  stats.bestCombo = Math.max(stats.bestCombo, bestCombo);
  stats.maxLines = Math.max(stats.maxLines, lines);
  saveKey(STATS_KEY, stats);
  renderRecords(-1);
  if (qualifies(score)) {
    pendingRecord = { score, lines, combo: bestCombo };
    nameInput.value = 'Jugador';
    nameForm.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  }
}

function commitRecord() {
  if (!pendingRecord) return;
  const rec = pendingRecord;
  pendingRecord = null;
  rec.name = nameInput.value.trim().slice(0, MAX_NAME) || 'Jugador';
  rec.date = new Date().toISOString();
  const recs = loadRecords();
  recs.push(rec);
  // desempate: el más antiguo queda primero (sort estable, el nuevo va al final)
  recs.sort((a, b) => b.score - a.score);
  const kept = recs.slice(0, MAX_RECORDS);
  saveKey(RECORDS_KEY, kept);
  nameForm.classList.add('hidden');
  const idx = kept.indexOf(rec);
  renderRecords(idx);
  recordBadge.classList.toggle('hidden', idx < 0);
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitRecord();
  restartBtn.focus();
});

restartBtn.addEventListener('click', () => restartBtn.blur());

recordsReset.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords y estadísticas?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (e) { /* sin almacenamiento */ }
  pendingRecord = null;
  nameForm.classList.add('hidden');
  recordBadge.classList.add('hidden');
  renderRecords(-1);
  recordsReset.blur();
});

// ---- Menú de pausa ----
const START_LEVEL_KEY = 'tetris.startLevel';
const pauseMenu = document.getElementById('pause-menu');
const pauseResumeBtn = document.getElementById('pause-resume');
const pauseRestartBtn = document.getElementById('pause-restart');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('pause-start-level');
let startLevel = 1;
let baseLevel = 1;
let resumeGuard = false;

try {
  const saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  if (saved >= 1 && saved <= 10) startLevel = saved;
} catch (e) { /* localStorage no disponible */ }
startLevelSelect.value = String(startLevel);

function levelInterval(lv) {
  return Math.max(100, 1000 - (lv - 1) * 90);
}

function showPauseMenu() {
  overlayTitle.textContent = 'PAUSA';
  overlayScore.textContent = '';
  restartBtn.classList.add('hidden');
  pauseControls.classList.add('hidden');
  pauseMenu.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
}

pauseResumeBtn.addEventListener('click', () => {
  pauseResumeBtn.blur();
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
});

pauseControlsBtn.addEventListener('click', () => {
  pauseControls.classList.toggle('hidden');
  pauseControlsBtn.blur();
});

startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) { /* ignorar */ }
  startLevelSelect.blur();
});

showStart();
