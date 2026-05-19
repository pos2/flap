import { saveDisplayRecord } from "./display-db.js";

const ASCII_CHARS = "@#MWNQBHKR*AEGOPDXUCSYZVJFTL+I-,. ";
const DISPLAY_STORAGE_KEY = "flap.display.ascii";
const MAX_DECODE_FRAMES = 180;
const DIFF_SIZE = 48;
const FALLBACK_SAMPLE_MS = 120;

const DEFAULTS = {
  width: 96,
  font: "signpainter",
  maxFrames: 24,
  minDiff: 6,
  dithering: "none",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  invert: 0,
  useThreshold: false,
  thresholdOffset: 128,
  spaceDensity: 1,
};

const elements = {
  dropArea: document.querySelector("#gif-drop-area"),
  fileInput: document.querySelector("#gif-file"),
  preview: document.querySelector("#gif-preview"),
  status: document.querySelector("#gif-status"),
  previewDisplay: document.querySelector("#preview-gif-display"),
  saveShare: document.querySelector("#save-share-gif"),
  previewStatus: document.querySelector("#gif-preview-status"),
  frameList: document.querySelector("#gif-frame-list"),
  controls: {
    width: document.querySelector("#gif-width"),
    font: document.querySelector("#gif-font"),
    maxFrames: document.querySelector("#gif-max-frames"),
    minDiff: document.querySelector("#gif-min-diff"),
    dithering: document.querySelector("#gif-dithering"),
    brightness: document.querySelector("#gif-brightness"),
    contrast: document.querySelector("#gif-contrast"),
    saturation: document.querySelector("#gif-saturation"),
    grayscale: document.querySelector("#gif-grayscale"),
    invert: document.querySelector("#gif-invert"),
    useThreshold: document.querySelector("#gif-use-threshold"),
    thresholdOffset: document.querySelector("#gif-threshold-offset"),
    spaceDensity: document.querySelector("#gif-space-density"),
  },
  outputs: {
    width: document.querySelector("#gif-width-value"),
    maxFrames: document.querySelector("#gif-max-frames-value"),
    minDiff: document.querySelector("#gif-min-diff-value"),
    brightness: document.querySelector("#gif-brightness-value"),
    contrast: document.querySelector("#gif-contrast-value"),
    saturation: document.querySelector("#gif-saturation-value"),
    grayscale: document.querySelector("#gif-grayscale-value"),
    invert: document.querySelector("#gif-invert-value"),
    thresholdOffset: document.querySelector("#gif-threshold-offset-value"),
    spaceDensity: document.querySelector("#gif-space-density-value"),
  },
};

const state = {
  settings: { ...DEFAULTS },
  decodedFrames: [],
  keyframes: [],
  renderToken: 0,
};

init();

function init() {
  drawEmptyPreview();
  bindFileInput();
  bindControls();
  syncControls();
}

function bindFileInput() {
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    elements.dropArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropArea.addEventListener(eventName, () => {
      elements.dropArea.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropArea.addEventListener(eventName, () => {
      elements.dropArea.classList.remove("is-dragging");
    });
  });

  elements.dropArea.addEventListener("drop", (event) => {
    loadFile(event.dataTransfer.files?.[0]);
  });

  elements.fileInput.addEventListener("change", (event) => {
    loadFile(event.target.files?.[0]);
  });
}

function bindControls() {
  for (const [key, input] of Object.entries(elements.controls)) {
    input.addEventListener("input", () => {
      updateSetting(key, input);
      renderCurrentFrames();
    });

    input.addEventListener("change", () => {
      updateSetting(key, input);
      renderCurrentFrames();
    });
  }

  elements.previewDisplay.addEventListener("click", () => {
    const payload = createAnimationPayload();
    if (!payload) {
      showPreviewStatus("No frames yet");
      return;
    }

    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(payload));
    window.location.href = "/display.html";
  });

  elements.saveShare.addEventListener("click", async () => {
    const payload = createAnimationPayload();
    if (!payload) {
      showPreviewStatus("No frames yet");
      return;
    }

    try {
      const record = await saveDisplayRecord(payload);
      const url = `${window.location.origin}/display.html?id=${encodeURIComponent(record.id)}`;
      await copyShareUrl(url);
      showPreviewStatus("Saved link");
    } catch (error) {
      console.error(error);
      showPreviewStatus("Save failed");
    }
  });
}

async function loadFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("Choose a GIF or animated image.");
    return;
  }

  state.decodedFrames = [];
  state.keyframes = [];
  elements.frameList.textContent = "";
  setStatus("Decoding frames...");

  try {
    const frames = "ImageDecoder" in window
      ? await decodeAnimatedImage(file)
      : await sampleAnimatedImage(file);
    state.decodedFrames = frames;
    state.keyframes = selectKeyframes(frames);
    setStatus(`${frames.length} decoded / ${state.keyframes.length} keyframes`);
    drawSourcePreview(state.keyframes[0]?.canvas || frames[0]?.canvas);
    renderCurrentFrames();
  } catch (error) {
    console.error(error);
    setStatus("Could not decode this animated image.");
  }
}

async function decodeAnimatedImage(file) {
  const data = await file.arrayBuffer();
  const decoder = new ImageDecoder({ data, type: file.type || "image/gif" });
  await decoder.tracks.ready;

  const frameCount = decoder.tracks.selectedTrack.frameCount;
  const safeFrameCount = Number.isFinite(frameCount)
    ? Math.min(frameCount, MAX_DECODE_FRAMES)
    : MAX_DECODE_FRAMES;
  const frames = [];

  for (let index = 0; index < safeFrameCount; index += 1) {
    const result = await decoder.decode({ frameIndex: index });
    const image = result.image;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = image.displayWidth || image.codedWidth;
    canvas.height = image.displayHeight || image.codedHeight;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    frames.push({
      index,
      duration: Math.max(20, Math.round((image.duration || 100000) / 1000)),
      canvas,
      signature: createFrameSignature(canvas),
    });
    image.close();
  }

  return frames;
}

async function sampleAnimatedImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;

  try {
    await image.decode();
    const sampleCount = Math.min(MAX_DECODE_FRAMES, Math.max(4, state.settings.maxFrames * 3));
    const frames = [];

    for (let index = 0; index < sampleCount; index += 1) {
      await wait(FALLBACK_SAMPLE_MS);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      frames.push({
        index,
        duration: FALLBACK_SAMPLE_MS,
        canvas,
        signature: createFrameSignature(canvas),
      });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function selectKeyframes(frames) {
  if (frames.length === 0) return [];

  const selected = [frames[0]];
  const stride = Math.max(1, Math.floor(frames.length / state.settings.maxFrames));

  for (let index = stride; index < frames.length; index += stride) {
    const candidate = frames[index];
    const previous = selected[selected.length - 1];
    const diff = frameDifference(previous.signature, candidate.signature);

    if (diff >= state.settings.minDiff || selected.length < 2) {
      selected.push(candidate);
    }

    if (selected.length >= state.settings.maxFrames) break;
  }

  const last = frames[frames.length - 1];
  if (selected[selected.length - 1] !== last && selected.length < state.settings.maxFrames) {
    selected.push(last);
  }

  return selected;
}

function renderCurrentFrames() {
  const token = state.renderToken + 1;
  state.renderToken = token;

  if (state.decodedFrames.length === 0) {
    syncControls();
    return;
  }

  state.keyframes = selectKeyframes(state.decodedFrames);
  setStatus(`${state.decodedFrames.length} decoded / ${state.keyframes.length} keyframes`);
  renderKeyframeList(token);
}

function renderKeyframeList(token) {
  elements.frameList.textContent = "";

  for (const frame of state.keyframes) {
    if (token !== state.renderToken) return;

    const processed = preprocessCanvas(frame.canvas, state.settings);
    const ascii = imageDataToAscii(processed.imageData, state.settings);
    frame.asciiRows = asciiToRows(ascii, processed.width);
    frame.asciiWidth = processed.width;
    frame.asciiHeight = processed.height;
    const card = document.createElement("article");
    const title = document.createElement("div");
    const deleteButton = document.createElement("button");
    const thumb = document.createElement("canvas");
    const pre = document.createElement("pre");

    card.className = "gif-frame-card";
    title.className = "gif-frame-title";
    title.textContent = `Frame ${frame.index} / ${frame.duration}ms`;
    deleteButton.className = "gif-frame-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "x";
    deleteButton.setAttribute("aria-label", `Delete frame ${frame.index}`);
    deleteButton.addEventListener("click", () => {
      state.keyframes = state.keyframes.filter((item) => item !== frame);
      renderKeyframeList(state.renderToken);
      setStatus(`${state.decodedFrames.length} decoded / ${state.keyframes.length} keyframes`);
    });
    thumb.width = frame.canvas.width;
    thumb.height = frame.canvas.height;
    thumb.getContext("2d").drawImage(frame.canvas, 0, 0);
    pre.textContent = ascii;

    card.append(title, deleteButton, thumb, pre);
    elements.frameList.append(card);
  }
}

function createAnimationPayload() {
  const frames = state.keyframes
    .map((frame) => {
      if (frame.asciiRows) return frame.asciiRows;
      const processed = preprocessCanvas(frame.canvas, state.settings);
      return asciiToRows(imageDataToAscii(processed.imageData, state.settings), processed.width);
    })
    .filter((rows) => rows.length > 0);

  if (frames.length === 0) return null;

  const height = frames[0].length;
  const width = frames[0][0]?.length || 0;
  if (width === 0 || height === 0) return null;

  return {
    type: "animation",
    width,
    height,
    font: state.settings.font,
    frameDuration: FALLBACK_SAMPLE_MS,
    settings: { ...state.settings },
    frames: frames.map((rows) => rows.map((row) => row.slice(0, width).padEnd(width, " "))),
    createdAt: Date.now(),
  };
}

function asciiToRows(text, width) {
  return text
    .replace(/\n+$/, "")
    .split("\n")
    .map((row) => row.slice(0, width).padEnd(width, " "));
}

function preprocessCanvas(source, settings) {
  const width = settings.width;
  const aspect = source.width / source.height || 1;
  const height = Math.max(1, Math.floor(0.55 * Math.floor(width / aspect)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  ctx.filter = getCanvasFilter(settings);
  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);

  if (settings.useThreshold) {
    applyThreshold(imageData.data, width, height, settings.thresholdOffset);
  }

  return { imageData, width, height };
}

function imageDataToAscii(imageData, settings) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const mutable = new Uint8ClampedArray(data);
  const chars = `${ASCII_CHARS}${" ".repeat(settings.spaceDensity)}`;
  let text = "";

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = mutable[index + 3];

      if (alpha < 16) {
        text += " ";
        continue;
      }

      let luminance =
        0.3 * mutable[index] + 0.59 * mutable[index + 1] + 0.11 * mutable[index + 2];

      if (settings.dithering !== "none") {
        luminance = applyDithering(settings.dithering, x, y, luminance, width, mutable);
      }

      const charIndex = Math.floor((luminance * (chars.length - 1)) / 255);
      text += chars[charIndex];
    }

    text += "\n";
  }

  return text;
}

function createFrameSignature(canvas) {
  const sample = document.createElement("canvas");
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  sample.width = DIFF_SIZE;
  sample.height = DIFF_SIZE;
  ctx.drawImage(canvas, 0, 0, DIFF_SIZE, DIFF_SIZE);
  const data = ctx.getImageData(0, 0, DIFF_SIZE, DIFF_SIZE).data;
  const signature = new Uint8Array(DIFF_SIZE * DIFF_SIZE);

  for (let index = 0; index < signature.length; index += 1) {
    const offset = index * 4;
    signature[index] = Math.round(0.3 * data[offset] + 0.59 * data[offset + 1] + 0.11 * data[offset + 2]);
  }

  return signature;
}

function frameDifference(left, right) {
  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }

  return total / left.length;
}

function getCanvasFilter(settings) {
  return [
    `brightness(${settings.brightness}%)`,
    `contrast(${settings.contrast}%)`,
    `saturate(${settings.saturation}%)`,
    `grayscale(${settings.grayscale}%)`,
    `invert(${settings.invert}%)`,
  ].join(" ");
}

function applyThreshold(data, width, height, threshold) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luminance = 0.3 * data[index] + 0.59 * data[index + 1] + 0.11 * data[index + 2];
      const value = luminance < threshold ? 0 : 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }
}

function applyDithering(type, x, y, luminance, width, data) {
  const levels = 14;
  const quantized = Math.round((luminance / 255) * levels) / levels * 255;
  const error = luminance - quantized;
  const kernels = {
    FloydSteinberg: [
      [1, 0, 7 / 16],
      [-1, 1, 3 / 16],
      [0, 1, 5 / 16],
      [1, 1, 1 / 16],
    ],
    Atkinson: [
      [1, 0, 1 / 8],
      [2, 0, 1 / 8],
      [-1, 1, 1 / 8],
      [0, 1, 1 / 8],
      [1, 1, 1 / 8],
      [0, 2, 1 / 8],
    ],
    JJN: [
      [1, 0, 7 / 48],
      [2, 0, 5 / 48],
      [-2, 1, 3 / 48],
      [-1, 1, 5 / 48],
      [0, 1, 7 / 48],
      [1, 1, 5 / 48],
      [2, 1, 3 / 48],
      [-2, 2, 1 / 48],
      [-1, 2, 3 / 48],
      [0, 2, 5 / 48],
      [1, 2, 3 / 48],
      [2, 2, 1 / 48],
    ],
    Stucki: [
      [1, 0, 8 / 42],
      [2, 0, 4 / 42],
      [-2, 1, 2 / 42],
      [-1, 1, 4 / 42],
      [0, 1, 8 / 42],
      [1, 1, 4 / 42],
      [2, 1, 2 / 42],
      [-2, 2, 1 / 42],
      [-1, 2, 2 / 42],
      [0, 2, 4 / 42],
      [1, 2, 2 / 42],
      [2, 2, 1 / 42],
    ],
  };

  for (const [dx, dy, weight] of kernels[type] || []) {
    const nextX = x + dx;
    const nextY = y + dy;
    const nextIndex = (nextY * width + nextX) * 4;

    if (nextX < 0 || nextX >= width || nextIndex < 0 || nextIndex >= data.length) {
      continue;
    }

    const value = clamp(data[nextIndex] + error * weight, 0, 255);
    data[nextIndex] = value;
    data[nextIndex + 1] = value;
    data[nextIndex + 2] = value;
  }

  return quantized;
}

function updateSetting(key, input) {
  if (input.type === "checkbox") {
    state.settings[key] = input.checked;
  } else if (input.tagName === "SELECT") {
    state.settings[key] = input.value;
  } else {
    state.settings[key] = Number(input.value);
  }

  if (key === "useThreshold") {
    elements.controls.thresholdOffset.disabled = !state.settings.useThreshold;
  }

  syncOutputs();
}

function syncControls() {
  for (const [key, input] of Object.entries(elements.controls)) {
    if (input.type === "checkbox") {
      input.checked = state.settings[key];
    } else {
      input.value = state.settings[key];
    }
  }

  elements.controls.thresholdOffset.disabled = !state.settings.useThreshold;
  syncOutputs();
}

function syncOutputs() {
  for (const [key, output] of Object.entries(elements.outputs)) {
    output.textContent = state.settings[key];
  }
}

function drawEmptyPreview() {
  const ctx = elements.preview.getContext("2d");
  elements.preview.height = 180;
  ctx.clearRect(0, 0, elements.preview.width, elements.preview.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, elements.preview.width, elements.preview.height);
  ctx.fillStyle = "rgba(17, 24, 39, 0.42)";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("No GIF", elements.preview.width / 2, elements.preview.height / 2);
}

function drawSourcePreview(source) {
  if (!source) {
    drawEmptyPreview();
    return;
  }

  const ctx = elements.preview.getContext("2d");
  const width = elements.preview.width;
  const height = Math.max(120, Math.round(width / (source.width / source.height || 1)));
  elements.preview.height = Math.min(360, height);
  ctx.clearRect(0, 0, elements.preview.width, elements.preview.height);
  ctx.drawImage(source, 0, 0, elements.preview.width, elements.preview.height);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function showPreviewStatus(message) {
  elements.previewStatus.textContent = message;
  window.setTimeout(() => {
    elements.previewStatus.textContent = "";
  }, 1200);
}

async function copyShareUrl(url) {
  if (!navigator.clipboard?.writeText) return;

  try {
    await navigator.clipboard.writeText(url);
  } catch {}
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
