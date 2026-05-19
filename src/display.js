import { getDisplayRecord } from "./display-db.js";

const DISPLAY_STORAGE_KEY = "flap.display.ascii";
const DEFAULT_FONT = "signpainter";
const DISPLAY_CHAR_ORDER = " @#MWNQBHKR*AEGOPDXUCSYZVJFTL+I-,.%=:";
const FONT_ASSETS = {
  "display-signpainter": {
    meta: "/public/assets/sprites/display-signpainter.json",
    image: "/public/assets/sprites/display-signpainter.svg",
  },
  signpainter: {
    meta: "/public/assets/sprites/signpainter.json",
    image: "/public/assets/sprites/signpainter.svg",
  },
  "arial-narrow": {
    meta: "/public/assets/sprites/arial-narrow.json",
    image: "/public/assets/sprites/arial-narrow.svg",
  },
  courier: {
    meta: "/public/assets/sprites/courier.json",
    image: "/public/assets/sprites/courier.svg",
  },
  georgia: {
    meta: "/public/assets/sprites/georgia.json",
    image: "/public/assets/sprites/georgia.svg",
  },
};

const DEFAULT_TILE_RATIO = 1.8;
const START_DELAY = 450;
const STEP_INTERVAL = 110;
const FLIP_DURATION = 820;
const DETAIL_COLUMNS = 24;
const DETAIL_ROWS = 10;
const DETAIL_TILE_WIDTH = 18;
const DETAIL_GAP = 2;
const MAIN_GAP = 1;
const FINAL_RENDER_SCALE = 4;

const canvas = document.querySelector("#display-canvas");
const detailCanvas = document.querySelector("#detail-canvas");
const shell = document.querySelector(".display-shell");
const detailWindow = document.querySelector(".detail-window");
const ctx = canvas.getContext("2d");
const detailCtx = detailCanvas.getContext("2d");
const playButton = document.querySelector("#play-display");
const fastButton = document.querySelector("#fast-display");
const detailToggle = document.querySelector("#toggle-detail");
const closeDetailButton = document.querySelector("#close-detail");

const state = {
  payload: null,
  metadata: null,
  image: null,
  glyphOrder: [],
  glyphIndex: new Map(),
  targetIndexes: [],
  scanSteps: [],
  startTime: 0,
  animationId: null,
  mainTileWidth: 6,
  mainTileHeight: 9,
  detailTileHeight: 26,
  mainWidth: 0,
  mainHeight: 0,
  mainRenderScale: 1,
  tileRatio: DEFAULT_TILE_RATIO,
  completedCanvas: document.createElement("canvas"),
  completedCtx: null,
  completedUntil: -1,
  detailCenter: { row: 0, col: 0 },
  blockRanges: [],
  detailVisible: true,
  detailDrag: null,
};

init();

async function init() {
  state.payload = await readPayload();
  const fontAssets = getFontAssets(state.payload.font);

  const [metadata, image] = await Promise.all([fetchJson(fontAssets.meta), loadImage(fontAssets.image)]);
  state.metadata = metadata;
  state.image = image;
  state.glyphOrder = [...DISPLAY_CHAR_ORDER].filter((char) => metadata.glyphs[char]);
  state.glyphOrder.forEach((char, index) => state.glyphIndex.set(char, index));
  state.targetIndexes = createTargetIndexes();
  state.blockRanges = createBlockRanges();
  state.scanSteps = createScanSteps();

  playButton.addEventListener("click", replay);
  fastButton.addEventListener("click", skipToFinal);
  detailToggle.addEventListener("change", () => {
    setDetailVisible(detailToggle.checked);
  });
  closeDetailButton.addEventListener("click", () => setDetailVisible(false));
  closeDetailButton.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  detailWindow.addEventListener("pointerdown", startDetailDrag);
  window.addEventListener("pointermove", dragDetailWindow);
  window.addEventListener("pointerup", stopDetailDrag);
  window.addEventListener("pointercancel", stopDetailDrag);
  window.addEventListener("resize", () => {
    refreshLayout();
  });

  setupCanvases();
  replay();
}

async function readPayload() {
  const id = new URLSearchParams(window.location.search).get("id");
  const record = normalizePayload(await getDisplayRecord(id));
  if (record) return record;

  try {
    const parsed = JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY));
    const payload = normalizePayload(parsed);
    if (payload) return payload;
  } catch {}

  return {
    width: 36,
    height: 8,
    font: DEFAULT_FONT,
    rows: [
      "        @#MWNQBHKR*AEGOPDXUCSYZVJ",
      "      @#MWNQBHKR*AEGOPDXUCSYZVJ  ",
      "    @#MWNQBHKR*AEGOPDXUCSYZVJ    ",
      "  @#MWNQBHKR*AEGOPDXUCSYZVJ      ",
      "@#MWNQBHKR*AEGOPDXUCSYZVJ        ",
      "  AEGOPDXUCSYZVJFTL+I-,.%=:      ",
      "    AEGOPDXUCSYZVJFTL+I-,.       ",
      "        +I-,.%=:                 ",
    ].map((row) => row.padEnd(36, " ")),
  };
}

function normalizePayload(payload) {
  if (payload?.width > 0 && payload?.height > 0 && Array.isArray(payload.rows)) {
    return {
      ...payload,
      font: FONT_ASSETS[payload.font] ? payload.font : DEFAULT_FONT,
      rows: payload.rows.map((row) => row.padEnd(payload.width, " ")),
    };
  }

  return null;
}

function getFontAssets(font) {
  return FONT_ASSETS[font] || FONT_ASSETS[DEFAULT_FONT];
}

function createTargetIndexes() {
  return state.payload.rows.map((row) =>
    [...row].map((char) => state.glyphIndex.get(char) ?? state.glyphIndex.get(" ")),
  );
}

function createBlockRanges() {
  const ranges = [];
  const blockCount = Math.ceil(state.payload.height / DETAIL_ROWS);

  for (let block = 0; block < blockCount; block += 1) {
    const blockStart = block * DETAIL_ROWS;
    let minCol = state.payload.width - 1;
    let maxCol = 0;
    let hasContent = false;

    for (let offset = 0; offset < DETAIL_ROWS; offset += 1) {
      const row = blockStart + offset;
      if (row >= state.payload.height) break;

      for (let col = 0; col < state.payload.width; col += 1) {
        if (getTargetChar(row, col) !== " ") {
          minCol = Math.min(minCol, col);
          maxCol = Math.max(maxCol, col);
          hasContent = true;
        }
      }
    }

    ranges.push({
      block,
      blockStart,
      minCol: hasContent ? Math.max(0, minCol - 5) : 0,
      maxCol: hasContent ? Math.min(state.payload.width - 1, maxCol + 5) : 0,
      hasContent,
    });
  }

  return ranges;
}

function createScanSteps() {
  const steps = [];

  for (const range of state.blockRanges) {
    if (!range.hasContent) continue;

    if (range.block % 2 === 0) {
      for (let col = range.minCol; col <= range.maxCol; col += 1) {
        steps.push({ ...range, col });
      }
    } else {
      for (let col = range.maxCol; col >= range.minCol; col -= 1) {
        steps.push({ ...range, col });
      }
    }
  }

  return steps;
}

function setupCanvases() {
  const width = state.payload.width;
  const height = state.payload.height;
  const availableWidth = Math.max(320, window.innerWidth - 32);
  const tileByWidth = (availableWidth - (width - 1) * MAIN_GAP) / width;
  state.mainTileWidth = Math.max(1.5, tileByWidth);
  state.mainTileHeight = state.mainTileWidth * state.tileRatio;
  state.detailTileHeight = DETAIL_TILE_WIDTH * state.tileRatio;
  state.mainWidth = Math.ceil(width * state.mainTileWidth + (width - 1) * MAIN_GAP);
  state.mainHeight = Math.ceil(height * state.mainTileHeight + (height - 1) * MAIN_GAP);

  canvas.style.width = `${state.mainWidth}px`;
  canvas.style.height = `${state.mainHeight}px`;
  setMainCanvasScale(1);

  detailCanvas.width = DETAIL_COLUMNS * DETAIL_TILE_WIDTH + (DETAIL_COLUMNS - 1) * DETAIL_GAP;
  detailCanvas.height = Math.ceil(DETAIL_ROWS * state.detailTileHeight + (DETAIL_ROWS - 1) * DETAIL_GAP);
}

function refreshLayout() {
  setupCanvases();
  resetCompletedLayer();
  draw(performance.now());
  if (state.animationId === null && isComplete(performance.now())) {
    renderFinalHighRes();
  }
}

function replay() {
  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId);
  }

  setMainCanvasScale(1);
  state.startTime = performance.now() + START_DELAY;
  resetCompletedLayer();
  draw(performance.now());
  state.animationId = requestAnimationFrame(tick);
}

function skipToFinal() {
  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }

  flushCompletedTiles(state.scanSteps.length - 1);
  state.detailCenter = state.scanSteps.at(-1) || { row: 0, col: 0 };
  renderFinalHighRes();
  if (state.detailVisible) {
    drawDetail(state.scanSteps.length * STEP_INTERVAL + FLIP_DURATION + 1);
  }
}

function setDetailVisible(visible) {
  state.detailVisible = visible;
  detailToggle.checked = visible;
  shell.classList.toggle("detail-hidden", !visible);
  if (visible) draw(performance.now());
}

function resetCompletedLayer() {
  state.completedCanvas.width = state.mainWidth;
  state.completedCanvas.height = state.mainHeight;
  state.completedCtx = state.completedCanvas.getContext("2d");
  state.completedUntil = -1;

  state.completedCtx.fillStyle = "#f8fafc";
  state.completedCtx.fillRect(0, 0, state.mainWidth, state.mainHeight);

  for (let row = 0; row < state.payload.height; row += 1) {
    for (let col = 0; col < state.payload.width; col += 1) {
      drawMainStaticTile(state.completedCtx, row, col, " ");
    }
  }
}

function tick(now) {
  draw(now);

  if (!isComplete(now)) {
    state.animationId = requestAnimationFrame(tick);
  } else {
    state.animationId = null;
    renderFinalHighRes();
  }
}

function isComplete(now) {
  const elapsed = now - state.startTime;
  return elapsed >= state.scanSteps.length * STEP_INTERVAL + FLIP_DURATION;
}

function draw(now) {
  if (state.scanSteps.length === 0) {
    ctx.drawImage(state.completedCanvas, 0, 0);
    if (state.detailVisible) drawDetail(0);
    return;
  }

  const elapsed = now - state.startTime;
  const completedUntil = Math.min(
    state.scanSteps.length - 1,
    Math.floor((elapsed - FLIP_DURATION) / STEP_INTERVAL),
  );
  flushCompletedTiles(completedUntil);

  ctx.clearRect(0, 0, state.mainWidth, state.mainHeight);
  ctx.drawImage(state.completedCanvas, 0, 0);

  const activeStart = Math.max(0, Math.floor((elapsed - FLIP_DURATION) / STEP_INTERVAL) + 1);
  const activeEnd = Math.min(state.scanSteps.length - 1, Math.floor(elapsed / STEP_INTERVAL));

  for (let index = activeStart; index <= activeEnd; index += 1) {
    const item = state.scanSteps[index];
    const progress = clamp((elapsed - index * STEP_INTERVAL) / FLIP_DURATION, 0, 1);
    drawMainAnimatedStep(item, progress);
  }

  const headIndex = clamp(Math.floor(elapsed / STEP_INTERVAL), 0, state.scanSteps.length - 1);
  const head = state.scanSteps[headIndex] || { blockStart: 0, col: 0 };
  state.detailCenter = { row: head.blockStart, col: head.col };
  if (state.detailVisible) drawDetail(elapsed);
}

function flushCompletedTiles(completedUntil) {
  if (completedUntil <= state.completedUntil) return;

  for (let index = state.completedUntil + 1; index <= completedUntil; index += 1) {
    const item = state.scanSteps[index];
    drawCompletedStep(item);
  }

  state.completedUntil = completedUntil;
}

function drawDetail(elapsed) {
  const halfCols = Math.floor(DETAIL_COLUMNS / 2);
  const startCol = clamp(state.detailCenter.col - halfCols, 0, Math.max(0, state.payload.width - DETAIL_COLUMNS));
  const startRow = clamp(state.detailCenter.row, 0, Math.max(0, state.payload.height - DETAIL_ROWS));

  detailCtx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
  detailCtx.fillStyle = "#f8fafc";
  detailCtx.fillRect(0, 0, detailCanvas.width, detailCanvas.height);

  for (let rowOffset = 0; rowOffset < DETAIL_ROWS; rowOffset += 1) {
    for (let colOffset = 0; colOffset < DETAIL_COLUMNS; colOffset += 1) {
      const row = startRow + rowOffset;
      const col = startCol + colOffset;
      const x = colOffset * (DETAIL_TILE_WIDTH + DETAIL_GAP);
      const y = rowOffset * (state.detailTileHeight + DETAIL_GAP);

      if (row >= state.payload.height || col >= state.payload.width) {
        drawTileBackground(detailCtx, x, y, DETAIL_TILE_WIDTH, state.detailTileHeight);
        continue;
      }

      const scanIndex = getScanIndex(row, col);
      const progress = clamp((elapsed - scanIndex * STEP_INTERVAL) / FLIP_DURATION, 0, 1);

      if (progress <= 0) {
        drawStaticTile(detailCtx, x, y, DETAIL_TILE_WIDTH, state.detailTileHeight, " ");
      } else if (progress >= 1) {
        drawStaticTile(detailCtx, x, y, DETAIL_TILE_WIDTH, state.detailTileHeight, getTargetChar(row, col));
      } else {
        drawAnimatedTile(detailCtx, x, y, DETAIL_TILE_WIDTH, state.detailTileHeight, row, col, progress);
      }
    }
  }
}

function getScanIndex(row, col) {
  const block = Math.floor(row / DETAIL_ROWS);
  const range = state.blockRanges[block];
  if (!range?.hasContent) return Number.POSITIVE_INFINITY;
  if (col < range.minCol || col > range.maxCol) {
    return col < range.minCol ? -1 : Number.POSITIVE_INFINITY;
  }

  let previousSteps = 0;
  for (let index = 0; index < block; index += 1) {
    const item = state.blockRanges[index];
    if (item?.hasContent) previousSteps += item.maxCol - item.minCol + 1;
  }

  return block % 2 === 0
    ? previousSteps + col - range.minCol
    : previousSteps + range.maxCol - col;
}

function startDetailDrag(event) {
  if (!state.detailVisible) return;
  const rect = detailWindow.getBoundingClientRect();
  state.detailDrag = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  detailWindow.classList.add("is-dragging");
  detailWindow.setPointerCapture(event.pointerId);
}

function dragDetailWindow(event) {
  if (!state.detailDrag) return;
  const rect = detailWindow.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width);
  const maxTop = Math.max(0, window.innerHeight - rect.height);
  const left = clamp(event.clientX - state.detailDrag.offsetX, 0, maxLeft);
  const top = clamp(event.clientY - state.detailDrag.offsetY, 0, maxTop);

  detailWindow.style.left = `${left}px`;
  detailWindow.style.top = `${top}px`;
  detailWindow.style.right = "auto";
}

function stopDetailDrag(event) {
  if (!state.detailDrag) return;
  state.detailDrag = null;
  detailWindow.classList.remove("is-dragging");
  if (detailWindow.hasPointerCapture(event.pointerId)) {
    detailWindow.releasePointerCapture(event.pointerId);
  }
}

function drawCompletedStep(step) {
  for (let offset = 0; offset < DETAIL_ROWS; offset += 1) {
    const row = step.blockStart + offset;
    if (row >= state.payload.height) break;
    drawMainStaticTile(state.completedCtx, row, step.col, getTargetChar(row, step.col));
  }
}

function drawMainStaticTile(targetCtx, row, col, char) {
  const x = col * (state.mainTileWidth + MAIN_GAP);
  const y = row * (state.mainTileHeight + MAIN_GAP);
  drawStaticTile(targetCtx, x, y, state.mainTileWidth, state.mainTileHeight, char);
}

function drawMainAnimatedTile(row, col, progress) {
  const x = col * (state.mainTileWidth + MAIN_GAP);
  const y = row * (state.mainTileHeight + MAIN_GAP);
  drawAnimatedTile(ctx, x, y, state.mainTileWidth, state.mainTileHeight, row, col, progress);
}

function drawMainAnimatedStep(step, progress) {
  for (let offset = 0; offset < DETAIL_ROWS; offset += 1) {
    const row = step.blockStart + offset;
    if (row >= state.payload.height) break;
    drawMainAnimatedTile(row, step.col, progress);
  }
}

function setMainCanvasScale(scale) {
  state.mainRenderScale = scale;
  canvas.width = Math.ceil(state.mainWidth * scale);
  canvas.height = Math.ceil(state.mainHeight * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

function renderFinalHighRes() {
  setMainCanvasScale(FINAL_RENDER_SCALE);
  ctx.clearRect(0, 0, state.mainWidth, state.mainHeight);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, state.mainWidth, state.mainHeight);

  for (let row = 0; row < state.payload.height; row += 1) {
    for (let col = 0; col < state.payload.width; col += 1) {
      drawMainStaticTile(ctx, row, col, getTargetChar(row, col));
    }
  }
}

function drawAnimatedTile(targetCtx, x, y, width, height, row, col, progress) {
  const targetIndex = state.targetIndexes[row][col];
  const step = progress * targetIndex;
  const fromIndex = Math.min(targetIndex, Math.floor(step));
  const toIndex = Math.min(targetIndex, fromIndex + 1);
  const localProgress = targetIndex === 0 || fromIndex >= targetIndex ? 1 : step - fromIndex;

  drawFlipTile(
    targetCtx,
    x,
    y,
    width,
    height,
    state.glyphOrder[fromIndex],
    state.glyphOrder[toIndex],
    easeInOutCubic(localProgress),
  );
}

function drawFlipTile(targetCtx, x, y, width, height, fromChar, toChar, progress) {
  const halfHeight = height / 2;
  drawTileBackground(targetCtx, x, y, width, height);

  if (progress < 0.5) {
    const phase = progress / 0.5;
    const flipHeight = Math.max(1, halfHeight * Math.cos(phase * Math.PI * 0.5));
    drawGlyphHalf(targetCtx, toChar, "top", x, y, width, halfHeight);
    drawGlyphHalf(targetCtx, fromChar, "bottom", x, y + halfHeight, width, halfHeight);
    drawGlyphHalf(targetCtx, fromChar, "top", x, y + halfHeight - flipHeight, width, flipHeight);
    drawFlipShade(targetCtx, x, y + halfHeight - flipHeight, width, flipHeight, 0.16 + (1 - flipHeight / halfHeight) * 0.58);
  } else {
    const phase = (progress - 0.5) / 0.5;
    const flipHeight = Math.max(1, halfHeight * Math.sin(phase * Math.PI * 0.5));
    drawGlyphHalf(targetCtx, toChar, "top", x, y, width, halfHeight);
    drawGlyphHalf(targetCtx, fromChar, "bottom", x, y + halfHeight, width, halfHeight);
    drawGlyphHalf(targetCtx, toChar, "bottom", x, y + halfHeight, width, flipHeight);
    drawFlipShade(targetCtx, x, y + halfHeight, width, flipHeight, 0.5 - (flipHeight / halfHeight) * 0.36);
  }

  drawHinge(targetCtx, x, y, width, height);
}

function drawStaticTile(targetCtx, x, y, width, height, char) {
  drawTileBackground(targetCtx, x, y, width, height);
  drawGlyphHalf(targetCtx, char, "top", x, y, width, height / 2);
  drawGlyphHalf(targetCtx, char, "bottom", x, y + height / 2, width, height / 2);
  drawHinge(targetCtx, x, y, width, height);
}

function drawTileBackground(targetCtx, x, y, width, height) {
  const gradient = targetCtx.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.5, "#f3f4f6");
  gradient.addColorStop(1, "#ffffff");
  targetCtx.fillStyle = gradient;
  targetCtx.fillRect(x, y, width, height);
  targetCtx.strokeStyle = "#e5e7eb";
  targetCtx.lineWidth = 1;
  targetCtx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
}

function drawFlipShade(targetCtx, x, y, width, height, alpha) {
  targetCtx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(0.72, alpha))})`;
  targetCtx.fillRect(x, y, width, height);
}

function drawHinge(targetCtx, x, y, width, height) {
  targetCtx.fillStyle = "rgba(15, 23, 42, 0.12)";
  targetCtx.fillRect(x + 1, y + height / 2 - 0.5, Math.max(1, width - 2), 1);
}

function drawGlyphHalf(targetCtx, char, half, dx, dy, dw, dh) {
  const glyph = state.metadata.glyphs[char] || state.metadata.glyphs[" "];
  const source = glyph[half];

  targetCtx.drawImage(
    state.image,
    source.x,
    source.y,
    source.width,
    source.height,
    dx,
    dy,
    dw,
    dh,
  );
}

function getTargetChar(row, col) {
  return state.payload.rows[row]?.[col] || " ";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function fetchJson(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
  return response.json();
}
