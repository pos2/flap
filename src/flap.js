const canvas = document.querySelector("#flap");
const replayButton = document.querySelector("#replay");
const reloadButton = document.querySelector("#reload");
const fontSelect = document.querySelector("#font-select");
const ctx = canvas.getContext("2d");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SPRITE_MANIFEST = "/public/assets/sprites/sprites.json";

const state = {
  sequence: ALPHABET,
  progress: 1,
  startTime: 0,
  stepDuration: 260,
  image: null,
  metadata: null,
  manifest: null,
  selectedSprite: null,
  running: false,
  animationId: null,
  loadVersion: 0,
};

const board = {
  x: 76,
  y: 56,
  width: 368,
  height: 408,
  radius: 18,
  pad: 34,
};

const tile = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  radius: 10,
};

init();
async function init() {
  state.manifest = await fetchJson(SPRITE_MANIFEST);
  populateFontSelect();

  replayButton.addEventListener("click", replay);
  reloadButton.addEventListener("click", () => loadSelectedSprite({ replayAfterLoad: true }));
  fontSelect.addEventListener("change", () => loadSelectedSprite({ replayAfterLoad: true }));
  setupCanvas();
  window.addEventListener("resize", setupCanvas);
  await loadSelectedSprite({ replayAfterLoad: true });
}

function setupCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const size = Math.min(rect.width, rect.height);
  const scale = size / 520;
  board.x = 76 * scale;
  board.y = 56 * scale;
  board.width = 368 * scale;
  board.height = 408 * scale;
  board.radius = 18 * scale;
  board.pad = 34 * scale;
  tile.x = board.x + board.pad;
  tile.y = board.y + board.pad;
  tile.width = board.width - board.pad * 2;
  tile.height = board.height - board.pad * 2;
  tile.radius = 10 * scale;

  draw();
}

function replay() {
  if (!state.image || !state.metadata) return;

  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId);
  }

  state.progress = 0;
  state.startTime = performance.now();
  state.running = true;
  setControlsDisabled(true);
  state.animationId = requestAnimationFrame(tick);
}

function tick(now) {
  const elapsed = now - state.startTime;
  const duration = (state.sequence.length - 1) * state.stepDuration;
  state.progress = Math.min(elapsed / duration, 1);
  draw();

  if (state.progress < 1) {
    state.animationId = requestAnimationFrame(tick);
  } else {
    state.animationId = null;
    state.running = false;
    setControlsDisabled(false);
  }
}

function draw() {
  if (!state.image || !state.metadata) return;

  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawBoard();
  drawSequenceTile();
}

async function loadSelectedSprite({ replayAfterLoad }) {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  const loadVersion = state.loadVersion + 1;
  state.loadVersion = loadVersion;
  state.selectedSprite = sprite;
  setControlsDisabled(true);

  try {
    const cacheKey = `v=${Date.now()}`;
    const [metadata, image] = await Promise.all([
      fetchJson(addCacheKey(sprite.metadata, cacheKey)),
      loadImage(addCacheKey(sprite.image, cacheKey)),
    ]);

    if (state.loadVersion !== loadVersion) return;

    state.metadata = metadata;
    state.image = image;
    draw();

    if (replayAfterLoad) {
      replay();
    } else {
      setControlsDisabled(false);
    }
  } catch (error) {
    console.error(error);
    setControlsDisabled(false);
  }
}

function populateFontSelect() {
  const sprites = state.manifest.sprites;

  fontSelect.replaceChildren(
    ...sprites.map((sprite) => {
      const option = document.createElement("option");
      option.value = sprite.id;
      option.textContent = sprite.label;
      return option;
    }),
  );

  fontSelect.value = state.manifest.default || sprites[0]?.id;
}

function getSelectedSprite() {
  return state.manifest.sprites.find((sprite) => sprite.id === fontSelect.value);
}

function setControlsDisabled(disabled) {
  replayButton.disabled = disabled;
  reloadButton.disabled = disabled;
  fontSelect.disabled = disabled;
}

function drawSequenceTile() {
  const lastIndex = state.sequence.length - 1;
  const rawStep = state.progress * lastIndex;
  const stepIndex = Math.min(Math.floor(rawStep), lastIndex - 1);
  const localProgress = state.progress === 1 ? 1 : rawStep - stepIndex;
  const fromChar = state.sequence[stepIndex];
  const toChar = state.sequence[Math.min(stepIndex + 1, lastIndex)];

  drawTile(fromChar, toChar, easeInOutCubic(localProgress));
}

function drawBoard() {
  ctx.save();
  roundedRect(board.x, board.y, board.width, board.height, board.radius);
  const boardGradient = ctx.createLinearGradient(0, board.y, 0, board.y + board.height);
  boardGradient.addColorStop(0, "#2a2922");
  boardGradient.addColorStop(0.48, "#10110f");
  boardGradient.addColorStop(1, "#060706");
  ctx.fillStyle = boardGradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#555346";
  ctx.stroke();

  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 18;
  roundedRect(tile.x, tile.y, tile.width, tile.height, tile.radius);
  ctx.fillStyle = "#070806";
  ctx.fill();
  ctx.restore();
}

function drawTile(fromChar, toChar, progress) {
  const halfHeight = tile.height / 2;
  const hingeY = tile.y + halfHeight;
  const phase = progress < 0.5 ? progress / 0.5 : (progress - 0.5) / 0.5;

  drawTileBase();

  if (progress < 0.5) {
    const height = Math.max(2, halfHeight * Math.cos(phase * Math.PI * 0.5));

    drawStaticHalf(toChar, "top", tile.x, tile.y, tile.width, halfHeight, "top");
    drawStaticHalf(fromChar, "bottom", tile.x, hingeY, tile.width, halfHeight, "bottom");
    drawFlippingPanel(fromChar, "top", tile.x, hingeY - height, tile.width, height, {
      surface: "top",
      shadowOffsetY: 8 * (1 - height / halfHeight),
      shade: 0.14 + (1 - height / halfHeight) * 0.62,
      highlightEdge: "bottom",
    });
  } else {
    const height = Math.max(2, halfHeight * Math.sin(phase * Math.PI * 0.5));

    drawStaticHalf(toChar, "top", tile.x, tile.y, tile.width, halfHeight, "top");
    drawStaticHalf(fromChar, "bottom", tile.x, hingeY, tile.width, halfHeight, "bottom");
    drawFlippingPanel(toChar, "bottom", tile.x, hingeY, tile.width, height, {
      surface: "bottom",
      shadowOffsetY: -6 * (1 - height / halfHeight),
      shade: 0.58 - (height / halfHeight) * 0.42,
      highlightEdge: "top",
    });
  }

  drawHinge();
}

function drawTileBase() {
  ctx.save();
  roundedRect(tile.x, tile.y, tile.width, tile.height, tile.radius);
  ctx.clip();

  const top = ctx.createLinearGradient(0, tile.y, 0, tile.y + tile.height / 2);
  top.addColorStop(0, "#191a17");
  top.addColorStop(1, "#0b0c0a");
  ctx.fillStyle = top;
  ctx.fillRect(tile.x, tile.y, tile.width, tile.height / 2);

  const bottom = ctx.createLinearGradient(0, tile.y + tile.height / 2, 0, tile.y + tile.height);
  bottom.addColorStop(0, "#0d0e0c");
  bottom.addColorStop(1, "#181914");
  ctx.fillStyle = bottom;
  ctx.fillRect(tile.x, tile.y + tile.height / 2, tile.width, tile.height / 2);

  ctx.restore();
}

function drawFlippingPanel(char, half, x, y, width, height, options) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.68)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = options.shadowOffsetY;
  drawStaticHalf(char, half, x, y, width, height, options.surface);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(0.74, options.shade))})`;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillRect(x + 8, options.highlightEdge === "top" ? y : y + height - 2, width - 16, 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, Math.max(1, height - 1));
  ctx.restore();
}

function drawStaticHalf(char, half, dx, dy, dw, dh, surface) {
  ctx.save();
  roundedRect(dx, dy, dw, dh, Math.min(tile.radius, dh / 3));
  ctx.clip();
  drawHalfSurface(dx, dy, dw, dh, surface);
  drawGlyphHalf(char, half, dx, dy, dw, dh, 1);
  ctx.restore();
}

function drawHalfSurface(dx, dy, dw, dh, surface) {
  const gradient = ctx.createLinearGradient(0, dy, 0, dy + dh);

  if (surface === "top") {
    gradient.addColorStop(0, "#20211d");
    gradient.addColorStop(1, "#090a08");
  } else {
    gradient.addColorStop(0, "#0a0b09");
    gradient.addColorStop(1, "#1c1d18");
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
  ctx.fillRect(dx + 10, dy + 8, dw - 20, Math.max(1, dh * 0.18));
}

function drawGlyphHalf(char, half, dx, dy, dw, dh, alpha) {
  const glyph = state.metadata.glyphs[char];
  if (!glyph) return;

  const source = glyph[half];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(
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
  ctx.restore();
}

function drawHinge() {
  const y = tile.y + tile.height / 2;

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.11)";
  ctx.fillRect(tile.x + 8, y - 1, tile.width - 16, 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
  ctx.fillRect(tile.x + 8, y, tile.width - 16, 2);
  ctx.restore();
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
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

  if (!response.ok) {
    throw new Error(`Failed to load ${src}: ${response.status}`);
  }

  return response.json();
}

function addCacheKey(src, cacheKey) {
  return `${src}${src.includes("?") ? "&" : "?"}${cacheKey}`;
}
