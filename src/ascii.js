import { saveDisplayRecord } from "./display-db.js";

const ASCII_CHARS = {
  minimalist: "#+-.",
  normal: "@%#*+=-:.",
  letters: "@#MWNQBHKR*AEGOPDXUCSYZVJFTL+I-,. ",
  grayscale: "@$BWM#*oahkbdpwmZO0QCJYXzcvnxrjft/|()1{}[]-_+~<>i!lI;:,\"^`'.",
  blockelement: "█▓▒░",
  alphabetic: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
};

const DEFAULTS = {
  width: 96,
  gradient: "letters",
  font: "signpainter",
  dithering: "none",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  hue: 0,
  grayscale: 0,
  invert: 0,
  useSharpen: false,
  sharpness: 9,
  useThreshold: false,
  thresholdOffset: 128,
  useEdgeDetection: false,
  edgeIntensity: 1,
  spaceDensity: 1,
  transparentFrame: 0,
};
const STORAGE_KEY = "flap.ascii.defaultSettings";
const DISPLAY_STORAGE_KEY = "flap.display.ascii";

export function initAsciiTool() {
  const elements = getElements();
  const state = {
    image: null,
    settings: loadSavedSettings(),
  };

  drawEmptyPreview(elements.preview);
  bindFileInput(elements, state);
  bindControls(elements, state);
  renderAscii(elements, state);
}

function getElements() {
  return {
    dropArea: document.querySelector("#drop-area"),
    fileInput: document.querySelector("#image-file"),
    preview: document.querySelector("#image-preview"),
    output: document.querySelector("#ascii-output"),
    reset: document.querySelector("#reset-ascii"),
    saveDefault: document.querySelector("#save-ascii-default"),
    saveShare: document.querySelector("#save-share-display"),
    openDisplay: document.querySelector("#open-display"),
    shareStatus: document.querySelector("#share-status"),
    controls: {
      width: document.querySelector("#ascii-width"),
      font: document.querySelector("#display-font"),
      dithering: document.querySelector("#dithering"),
      brightness: document.querySelector("#brightness"),
      contrast: document.querySelector("#contrast"),
      saturation: document.querySelector("#saturation"),
      sepia: document.querySelector("#sepia"),
      hue: document.querySelector("#hue"),
      grayscale: document.querySelector("#grayscale"),
      invert: document.querySelector("#invert"),
      useSharpen: document.querySelector("#use-sharpen"),
      sharpness: document.querySelector("#sharpness"),
      useThreshold: document.querySelector("#use-threshold"),
      thresholdOffset: document.querySelector("#threshold-offset"),
      useEdgeDetection: document.querySelector("#use-edge-detection"),
      edgeIntensity: document.querySelector("#edge-intensity"),
      spaceDensity: document.querySelector("#space-density"),
      transparentFrame: document.querySelector("#transparent-frame"),
    },
    outputs: {
      width: document.querySelector("#ascii-width-value"),
      brightness: document.querySelector("#brightness-value"),
      contrast: document.querySelector("#contrast-value"),
      saturation: document.querySelector("#saturation-value"),
      sepia: document.querySelector("#sepia-value"),
      hue: document.querySelector("#hue-value"),
      grayscale: document.querySelector("#grayscale-value"),
      invert: document.querySelector("#invert-value"),
      sharpness: document.querySelector("#sharpness-value"),
      thresholdOffset: document.querySelector("#threshold-offset-value"),
      edgeIntensity: document.querySelector("#edge-intensity-value"),
      spaceDensity: document.querySelector("#space-density-value"),
      transparentFrame: document.querySelector("#transparent-frame-value"),
    },
  };
}

function bindFileInput(elements, state) {
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
    loadFile(event.dataTransfer.files?.[0], elements, state);
  });

  elements.fileInput.addEventListener("change", (event) => {
    loadFile(event.target.files?.[0], elements, state);
  });
}

function bindControls(elements, state) {
  for (const [key, input] of Object.entries(elements.controls)) {
    input.addEventListener("input", () => {
      updateSetting(key, input, elements, state);
      renderAscii(elements, state);
    });

    input.addEventListener("change", () => {
      updateSetting(key, input, elements, state);
      renderAscii(elements, state);
    });
  }

  elements.reset.addEventListener("click", () => {
    state.settings = { ...DEFAULTS };
    syncControls(elements, state);
    renderAscii(elements, state);
  });

  elements.saveDefault.addEventListener("click", () => {
    saveSettings(state.settings);
    elements.saveDefault.textContent = "Saved";
    window.setTimeout(() => {
      elements.saveDefault.textContent = "Save Default";
    }, 900);
  });

  elements.saveShare.addEventListener("click", async () => {
    const record = await saveCurrentDisplay(elements, state);
    if (!record) return;

    const url = createDisplayUrl(record.id);
    await copyShareUrl(url);
    showShareStatus(elements, "Saved link");
  });

  elements.openDisplay.addEventListener("click", () => {
    const payload = createDisplayPayload(elements.output.textContent, state.settings);
    if (!payload) return;

    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(payload));
    window.location.href = "/display.html";
  });

  syncControls(elements, state);
}

async function saveCurrentDisplay(elements, state) {
  const payload = createDisplayPayload(elements.output.textContent, state.settings);
  if (!payload) {
    showShareStatus(elements, "No ASCII yet");
    return null;
  }

  try {
    return await saveDisplayRecord(payload);
  } catch (error) {
    console.error(error);
    showShareStatus(elements, "Save failed");
    return null;
  }
}

function createDisplayUrl(id) {
  return `${window.location.origin}/display.html?id=${encodeURIComponent(id)}`;
}

async function copyShareUrl(url) {
  if (!navigator.clipboard?.writeText) return;

  try {
    await navigator.clipboard.writeText(url);
  } catch {}
}

function showShareStatus(elements, message) {
  elements.shareStatus.textContent = message;
  window.setTimeout(() => {
    elements.shareStatus.textContent = "";
  }, 1400);
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };

    return normalizeSettings({
      ...DEFAULTS,
      ...JSON.parse(raw),
      gradient: DEFAULTS.gradient,
    });
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

function normalizeSettings(settings) {
  const normalized = { ...DEFAULTS };

  for (const key of Object.keys(DEFAULTS)) {
    const defaultValue = DEFAULTS[key];
    const value = settings[key];

    if (typeof defaultValue === "boolean") {
      normalized[key] = Boolean(value);
    } else if (typeof defaultValue === "number") {
      const number = Number(value);
      normalized[key] = Number.isFinite(number) ? number : defaultValue;
    } else {
      normalized[key] = typeof value === "string" ? value : defaultValue;
    }
  }

  normalized.gradient = DEFAULTS.gradient;
  return normalized;
}

function updateSetting(key, input, elements, state) {
  if (input.type === "checkbox") {
    state.settings[key] = input.checked;
  } else if (input.tagName === "SELECT") {
    state.settings[key] = input.value;
  } else {
    state.settings[key] = Number(input.value);
  }

  if (key === "useSharpen") {
    elements.controls.sharpness.disabled = !state.settings.useSharpen;
  }

  if (key === "useThreshold") {
    elements.controls.thresholdOffset.disabled = !state.settings.useThreshold;
  }

  if (key === "useEdgeDetection") {
    elements.controls.edgeIntensity.disabled = !state.settings.useEdgeDetection;
  }

  syncOutputs(elements, state);
}

function syncControls(elements, state) {
  for (const [key, input] of Object.entries(elements.controls)) {
    if (input.type === "checkbox") {
      input.checked = state.settings[key];
    } else {
      input.value = state.settings[key];
    }
  }

  elements.controls.sharpness.disabled = !state.settings.useSharpen;
  elements.controls.thresholdOffset.disabled = !state.settings.useThreshold;
  elements.controls.edgeIntensity.disabled = !state.settings.useEdgeDetection;
  syncOutputs(elements, state);
}

function syncOutputs(elements, state) {
  for (const [key, output] of Object.entries(elements.outputs)) {
    output.textContent = state.settings[key];
  }
}

function loadFile(file, elements, state) {
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      renderAscii(elements, state);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderAscii(elements, state) {
  if (!state.image) {
    elements.output.textContent = "";
    drawEmptyPreview(elements.preview);
    return;
  }

  const processed = preprocessImage(state.image, state.settings);
  elements.output.textContent = imageDataToAscii(processed.imageData, state.settings);
  drawPreview(elements.preview, state.image, state.settings);
}

function createDisplayPayload(text, settings) {
  const rows = text.replace(/\n+$/, "").split("\n");
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

  if (width === 0 || height === 0) return null;

  return {
    width,
    height,
    rows: rows.map((row) => row.padEnd(width, " ")),
    font: settings.font,
    settings: normalizeSettings(settings),
    createdAt: Date.now(),
  };
}

function preprocessImage(image, settings) {
  const width = settings.width;
  const aspect = image.width / image.height || 1;
  const height = Math.max(1, Math.floor(0.55 * Math.floor(width / aspect)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const frame = settings.transparentFrame;

  canvas.width = width + frame * 2;
  canvas.height = height + frame * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = getCanvasFilter(settings);
  ctx.drawImage(image, frame, frame, width, height);

  if (settings.useEdgeDetection) {
    applyEdgeDetection(ctx, canvas, settings.edgeIntensity);
  }

  if (settings.useSharpen) {
    applySharpen(ctx, canvas, settings.sharpness);
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (settings.useThreshold) {
    applyThreshold(imageData.data, canvas.width, canvas.height, settings.thresholdOffset);
  }

  return { imageData, width: canvas.width, height: canvas.height };
}

function drawPreview(canvas, image, settings) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const boxWidth = canvas.width;
  const aspect = image.width / image.height || 1;
  const drawWidth = boxWidth;
  const drawHeight = Math.max(1, Math.floor(drawWidth / aspect));

  canvas.height = Math.min(360, Math.max(120, drawHeight));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = getCanvasFilter(settings);
  ctx.drawImage(image, 0, 0, drawWidth, canvas.height);

  if (settings.useEdgeDetection) {
    applyEdgeDetection(ctx, canvas, settings.edgeIntensity);
  }

  if (settings.useSharpen) {
    applySharpen(ctx, canvas, settings.sharpness);
  }

  if (settings.useThreshold) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyThreshold(imageData.data, canvas.width, canvas.height, settings.thresholdOffset);
    ctx.putImageData(imageData, 0, 0);
  }
}

function drawEmptyPreview(canvas) {
  const ctx = canvas.getContext("2d");
  canvas.height = 180;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#11120f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(248, 242, 216, 0.42)";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("No image", canvas.width / 2, canvas.height / 2);
}

function imageDataToAscii(imageData, settings) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const mutable = new Uint8ClampedArray(data);
  const chars = `${ASCII_CHARS[settings.gradient]}${" ".repeat(settings.spaceDensity)}`;
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

function getCanvasFilter(settings) {
  return [
    `brightness(${settings.brightness}%)`,
    `contrast(${settings.contrast}%)`,
    `saturate(${settings.saturation}%)`,
    `sepia(${settings.sepia}%)`,
    `hue-rotate(${settings.hue}deg)`,
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
    const index = ((y + dy) * width + (x + dx)) * 4;

    if (index >= 0 && index < data.length) {
      data[index] += error * weight;
      data[index + 1] += error * weight;
      data[index + 2] += error * weight;
    }
  }

  return quantized;
}

function applyEdgeDetection(ctx, canvas, intensity) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const input = imageData.data;
  const output = new Uint8ClampedArray(input.length);
  const width = imageData.width;
  const height = imageData.height;
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        output[index] = 255;
        output[index + 1] = 255;
        output[index + 2] = 255;
        output[index + 3] = input[index + 3];
        continue;
      }

      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleIndex = ((y + ky) * width + (x + kx)) * 4;
          const luminance =
            0.3 * input[sampleIndex] + 0.59 * input[sampleIndex + 1] + 0.11 * input[sampleIndex + 2];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += luminance * sobelX[kernelIndex];
          gy += luminance * sobelY[kernelIndex];
        }
      }

      const edge = Math.min(255, Math.sqrt(gx * gx + gy * gy) * intensity);
      const value = 255 - edge;
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = input[index + 3];
    }
  }

  ctx.putImageData(new ImageData(output, width, height), 0, 0);
}

function applySharpen(ctx, canvas, strength) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const input = imageData.data;
  const output = new Uint8ClampedArray(input.length);
  const width = imageData.width;
  const height = imageData.height;
  const kernel = [-1, -1, -1, -1, strength, -1, -1, -1, -1];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleX = x + kx;
          const sampleY = y + ky;

          if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
            const sampleIndex = (sampleY * width + sampleX) * 4;
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            red += input[sampleIndex] * weight;
            green += input[sampleIndex + 1] * weight;
            blue += input[sampleIndex + 2] * weight;
          }
        }
      }

      output[index] = red;
      output[index + 1] = green;
      output[index + 2] = blue;
      output[index + 3] = input[index + 3];
    }
  }

  ctx.putImageData(new ImageData(output, width, height), 0, 0);
}
