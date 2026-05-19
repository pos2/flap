#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const presets = [
  {
    id: "signpainter",
    label: "SignPainter",
    fontFamily: "SignPainter",
    fontSize: 40,
    fontWeight: "700",
    color: "#111827",
  },
  {
    id: "arial-narrow",
    label: "Arial Narrow",
    fontFamily: "Arial Narrow, Arial, Helvetica, sans-serif",
    fontSize: 42,
    fontWeight: "700",
    color: "#111827",
  },
  {
    id: "courier",
    label: "Courier New",
    fontFamily: "Courier New, Courier, monospace",
    fontSize: 38,
    fontWeight: "700",
    color: "#111827",
  },
  {
    id: "georgia",
    label: "Georgia",
    fontFamily: "Georgia, Times New Roman, serif",
    fontSize: 39,
    fontWeight: "700",
    color: "#111827",
  },
];

const outDir = "public/assets/sprites";
await mkdir(outDir, { recursive: true });

for (const preset of presets) {
  const base = `${outDir}/${preset.id}`;
  await run("node", [
    "scripts/make-sprite.mjs",
    "--font-family",
    preset.fontFamily,
    "--font-size",
    String(preset.fontSize),
    "--font-weight",
    preset.fontWeight,
    "--color",
    preset.color,
    "--output",
    `${base}.svg`,
    "--metadata",
    `${base}.json`,
  ]);
}

await run("node", [
  "scripts/make-sprite.mjs",
  "--font-family",
  "SignPainter",
  "--font-size",
  "40",
  "--font-weight",
  "700",
  "--color",
  "#111827",
  "--output",
  `${outDir}/display-signpainter.svg`,
  "--metadata",
  `${outDir}/display-signpainter.json`,
]);

const manifest = {
  default: presets[0].id,
  sprites: presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    image: `/public/assets/sprites/${preset.id}.svg`,
    metadata: `/public/assets/sprites/${preset.id}.json`,
  })),
};

await writeFile(
  path.join(outDir, "sprites.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${outDir}/sprites.json`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}
