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
let combo = 0, maxCombo = 0;

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
    combo++;
    if (combo > maxCombo) maxCombo = combo;
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
  overlay.classList.remove('hidden');
  showGameOverRecords();
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
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hideRecordsUI();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // escribir el nombre no mueve la pieza
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

restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });

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

// ---- Tabla de records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const MAX_NAME = 12;
const recordsEl = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const recordsBests = document.getElementById('records-bests');
const recordsEntry = document.getElementById('records-entry');
const recordsName = document.getElementById('records-name');
const recordsSave = document.getElementById('records-save');
const recordsReset = document.getElementById('records-reset');
const startBtn = document.getElementById('start-btn');

const num = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function loadRecords() {
  const data = { entries: [], bestCombo: 0, bestLines: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.entries)) {
        data.entries = raw.entries
          .filter(e => e && typeof e === 'object')
          .map(e => ({
            name: String(e.name ?? '').slice(0, MAX_NAME) || 'Jugador',
            score: num(e.score), lines: num(e.lines), combo: num(e.combo),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_RECORDS);
      }
      data.bestCombo = num(raw.bestCombo);
      data.bestLines = num(raw.bestLines);
    }
  } catch (err) { /* sin localStorage o JSON inválido: records vacíos */ }
  for (const e of data.entries) {
    data.bestCombo = Math.max(data.bestCombo, e.combo);
    data.bestLines = Math.max(data.bestLines, e.lines);
  }
  return data;
}

function saveRecords(data) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(data)); } catch (err) { /* ignorar */ }
}

function qualifies(data, pts) {
  return pts > 0 && (data.entries.length < MAX_RECORDS || pts > data.entries[data.entries.length - 1].score);
}

// highlight: índice de la fila recién guardada (o -1)
function renderRecords(highlight = -1) {
  const data = loadRecords();
  recordsList.replaceChildren();
  if (!data.entries.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin records todavía';
    recordsList.appendChild(li);
  }
  data.entries.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'records-new';
    const rank = document.createElement('span');
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.textContent = e.name;
    const pts = document.createElement('span');
    pts.textContent = e.score.toLocaleString();
    const extra = document.createElement('span');
    extra.className = 'rec-extra';
    extra.textContent = `${e.lines} líneas · combo ${e.combo}`;
    li.append(rank, name, pts, extra);
    recordsList.appendChild(li);
  });
  recordsBests.textContent = `Mejor combo: ${data.bestCombo} · Líneas máx.: ${data.bestLines}`;
  recordsEl.hidden = false;
}

function hideRecordsUI() {
  recordsEl.hidden = true;
  recordsEntry.hidden = true;
  startBtn.hidden = true;
  restartBtn.hidden = false;
}

function showStartScreen() {
  board = createBoard();
  next = randomPiece();
  current = randomPiece();
  score = 0; lines = 0; level = 1; combo = 0; maxCombo = 0;
  paused = false;
  gameOver = true; // bloquea teclas hasta pulsar Jugar
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  startBtn.hidden = false;
  restartBtn.hidden = true;
  recordsEntry.hidden = true;
  renderRecords();
  updateHUD();
  draw();
  drawNext();
}

function showGameOverRecords() {
  // los mejores combo/líneas se guardan aunque la partida no entre al top
  const data = loadRecords();
  data.bestCombo = Math.max(data.bestCombo, maxCombo);
  data.bestLines = Math.max(data.bestLines, lines);
  saveRecords(data);
  renderRecords();
  if (qualifies(data, score)) {
    recordsEntry.hidden = false;
    recordsName.value = '';
    recordsName.focus();
  }
}

function submitRecord() {
  if (recordsEntry.hidden) return;
  const data = loadRecords();
  if (!qualifies(data, score)) { recordsEntry.hidden = true; return; }
  const entry = {
    name: recordsName.value.trim().slice(0, MAX_NAME) || 'Jugador',
    score, lines, combo: maxCombo,
  };
  data.entries.push(entry);
  data.entries.sort((a, b) => b.score - a.score); // estable: empates quedan debajo
  data.entries = data.entries.slice(0, MAX_RECORDS);
  saveRecords(data);
  recordsEntry.hidden = true;
  renderRecords(data.entries.indexOf(entry));
}

recordsSave.addEventListener('click', () => { submitRecord(); recordsSave.blur(); });
recordsName.addEventListener('keydown', e => { if (e.key === 'Enter') submitRecord(); });
recordsReset.addEventListener('click', () => {
  recordsReset.blur();
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (err) { /* ignorar */ }
  renderRecords();
});
startBtn.addEventListener('click', () => { startBtn.blur(); init(); });

showStartScreen();
