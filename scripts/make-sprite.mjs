#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CHARS =
  " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%*=.,+-:/&_'\",()[]";

const DEFAULTS = {
  chars: DEFAULT_CHARS,
  fontFamily: "Arial Narrow, Arial, Helvetica, sans-serif",
  fontSize: 42,
  fontWeight: "700",
  color: "#f2f4e8",
  background: "transparent",
  cellWidth: 48,
  cellHeight: 64,
  columns: 16,
  verticalOffset: 0,
  output: "public/assets/flap-glyphs.svg",
  metadata: "public/assets/flap-glyphs.json",
};

const args = parseArgs(process.argv.slice(2));
const config = {
  ...DEFAULTS,
  ...(args.config ? await readJson(args.config) : {}),
  ...args,
};

if (config.charFile) {
  config.chars = await readFile(config.charFile, "utf8");
}

const chars = uniqueGraphemes(config.chars.replace(/\r?\n/g, ""));
config.fontSize = Number(config.fontSize);
config.cellWidth = Number(config.cellWidth);
config.cellHeight = Number(config.cellHeight);
config.columns = Number(config.columns);
config.verticalOffset = Number(config.verticalOffset);

validateConfig(config);

const rows = Math.ceil(chars.length / config.columns);
const width = config.columns * config.cellWidth;
const height = rows * config.cellHeight;
const glyphs = {};
const glyphList = [];

const textNodes = chars.map((char, index) => {
  const col = index % config.columns;
  const row = Math.floor(index / config.columns);
  const x = col * config.cellWidth;
  const y = row * config.cellHeight;
  const centerX = x + config.cellWidth / 2;
  const centerY = y + config.cellHeight / 2 + config.verticalOffset;

  const glyph = {
    char,
    index,
    x,
    y,
    width: config.cellWidth,
    height: config.cellHeight,
    top: {
      x,
      y,
      width: config.cellWidth,
      height: config.cellHeight / 2,
    },
    bottom: {
      x,
      y: y + config.cellHeight / 2,
      width: config.cellWidth,
      height: config.cellHeight / 2,
    },
  };
  glyphs[char] = glyph;
  glyphList.push(glyph);

  const background =
    config.background === "transparent"
      ? ""
      : `  <rect x="${x}" y="${y}" width="${config.cellWidth}" height="${config.cellHeight}" fill="${escapeAttr(
          config.background,
        )}"/>\n`;

  return `${background}  <text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central">${escapeText(
    char,
  )}</text>`;
});

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text {
      fill: ${escapeCss(config.color)};
      font-family: ${escapeCss(config.fontFamily)};
      font-size: ${config.fontSize}px;
      font-weight: ${escapeCss(config.fontWeight)};
    }
  </style>
${textNodes.join("\n")}
</svg>
`;

const metadata = {
  image: path.basename(config.output),
  width,
  height,
  cellWidth: config.cellWidth,
  cellHeight: config.cellHeight,
  columns: config.columns,
  rows,
  chars: chars.join(""),
  font: {
    family: config.fontFamily,
    size: config.fontSize,
    weight: config.fontWeight,
    color: config.color,
    background: config.background,
  },
  glyphList,
  glyphs,
};

await mkdir(path.dirname(config.output), { recursive: true });
await mkdir(path.dirname(config.metadata), { recursive: true });
await writeFile(config.output, svg, "utf8");
await writeFile(config.metadata, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

console.log(`Wrote ${config.output}`);
console.log(`Wrote ${config.metadata}`);
console.log(`${chars.length} glyphs, ${config.columns} columns, ${rows} rows`);

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = toCamelCase(rawKey);
    const value = inlineValue ?? argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    parsed[key] = value;
  }

  return parsed;
}

function validateConfig(configToValidate) {
  const requiredNumbers = ["fontSize", "cellWidth", "cellHeight", "columns"];

  for (const key of requiredNumbers) {
    if (!Number.isFinite(configToValidate[key]) || configToValidate[key] <= 0) {
      throw new Error(`${key} must be a positive number`);
    }
  }

  if (configToValidate.cellHeight % 2 !== 0) {
    throw new Error("cellHeight must be an even number so the glyph can split cleanly");
  }

  if (chars.length === 0) {
    throw new Error("chars cannot be empty");
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function uniqueGraphemes(value) {
  const seen = new Set();
  const chars = [];
  const splitter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  const segments = splitter
    ? [...splitter.segment(value)].map((segment) => segment.segment)
    : [...value];

  for (const char of segments) {
    if (!seen.has(char)) {
      seen.add(char);
      chars.push(char);
    }
  }

  return chars;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function escapeText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeText(String(value)).replaceAll('"', "&quot;");
}

function escapeCss(value) {
  return String(value).replaceAll("</style", "<\\/style");
}

function printHelp() {
  console.log(`Usage:
  npm run make:sprite -- [options]

Options:
  --config <path>            JSON config file
  --chars <string>           Characters to include
  --char-file <path>         Read characters from a text file
  --font-family <value>      CSS font-family
  --font-size <number>       Font size in px
  --font-weight <value>      CSS font-weight
  --color <value>            Glyph color
  --background <value>       Cell background color or transparent
  --cell-width <number>      Cell width in px
  --cell-height <number>     Cell height in px, must be even
  --columns <number>         Number of columns in the sprite sheet
  --vertical-offset <number> Move glyph baseline up/down in px
  --output <path>            Output SVG path
  --metadata <path>          Output JSON metadata path

Example:
  npm run make:sprite -- --font-family "Arial Narrow" --font-size 40 --color "#f8f2d8"
`);
}
