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
const skinSelect = document.getElementById('skin-select');

// El canvas no hereda variables CSS: color de la cuadrícula por tema
const GRID_COLORS = { dark: '#22222e', light: '#e3e6ee' };
let gridColor = GRID_COLORS.dark;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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

// ---- Skins ----
// Cada skin: nombre, colores (índices 1–8 como COLORS), color de cuadrícula
// (null = el del tema; el fondo de Neon va en style.css) y función de dibujo.
function drawRetro(context, x, y, colorIndex, size, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = SKINS.retro.colors[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawNeon(context, x, y, colorIndex, size, alpha) {
  const color = SKINS.neon.colors[colorIndex];
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.globalAlpha = alpha * 0.35;
  context.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
  // el glow solo en el borde (menos costoso)
  context.globalAlpha = alpha;
  context.shadowColor = color;
  context.shadowBlur = alpha < 1 ? 0 : 12;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(x * size + 3, y * size + 3, size - 6, size - 6);
}

// roundRect con respaldo para navegadores antiguos
function pathRound(context, x, y, w, h, r) {
  if (context.roundRect) { context.roundRect(x, y, w, h, r); return; }
  context.rect(x, y, w, h);
}

function drawPastel(context, x, y, colorIndex, size, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = SKINS.pastel.colors[colorIndex];
  context.beginPath();
  pathRound(context, x * size + 2, y * size + 2, size - 4, size - 4, size * 0.3);
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.18)'; // contorno: visible sobre fondo claro
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.beginPath();
  pathRound(context, x * size + 5, y * size + 5, size - 10, 4, 2);
  context.fill();
}

function drawPixel(context, x, y, colorIndex, size, alpha) {
  const px = x * size + 1, py = y * size + 1, s = size - 2, u = s / 6;
  context.globalAlpha = alpha;
  context.fillStyle = SKINS.pixel.colors[colorIndex];
  context.fillRect(px, py, s, s);
  // textura: bordes claro/oscuro y damero de píxeles
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px, py, s, u);
  context.fillRect(px, py, u, s);
  context.fillStyle = 'rgba(0,0,0,0.35)';
  context.fillRect(px, py + s - u, s, u);
  context.fillRect(px + s - u, py, u, s);
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 1; i < 5; i++)
    for (let j = 1; j < 5; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * u, py + j * u, u, u);
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: COLORS,
    grid: null,
    draw: drawRetro,
  },
  neon: {
    name: 'Neon',
    colors: [null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#c6ff00'],
    grid: '#1a1a1a',
    draw: drawNeon,
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a8e6ef', '#fff3b0', '#e0bbf0', '#c1ecc4', '#f9b9b7', '#bcd8f7', '#fcd5a5', '#d7c4bb'],
    grid: null,
    draw: drawPastel,
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#29b6f6', '#fdd835', '#8e24aa', '#43a047', '#e53935', '#3949ab', '#fb8c00', '#795548'],
    grid: null,
    draw: drawPixel,
  },
};
const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // save/restore para que alpha/shadow no se filtren entre bloques
  context.save();
  try {
    SKINS[currentSkin].draw(context, x, y, colorIndex, size, alpha ?? 1);
  } finally {
    context.restore();
  }
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
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // el select enfocado usa sus propias teclas
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

restartBtn.addEventListener('click', init);

// Color de cuadrícula efectivo: el de la skin (si define uno) o el del tema
function updateGridColor() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  gridColor = SKINS[currentSkin].grid || (light ? GRID_COLORS.light : GRID_COLORS.dark);
}

function setTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  updateGridColor();
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

function setSkin(name, save = true) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  currentSkin = name;
  document.documentElement.setAttribute('data-skin', name);
  skinSelect.value = name;
  updateGridColor();
  if (save) {
    try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* sin almacenamiento */ }
  }
  // en pausa/game over el loop no corre: redibujar manualmente
  if (board) { draw(); drawNext(); }
}

// llenar el selector desde SKINS
for (const key of Object.keys(SKINS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = SKINS[key].name;
  skinSelect.appendChild(opt);
}

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que Space/flechas actúen sobre el select enfocado
});

{
  let savedSkin = null;
  try { savedSkin = localStorage.getItem(SKIN_KEY); } catch (e) { /* sin almacenamiento */ }
  setSkin(savedSkin, false);
}
init();
