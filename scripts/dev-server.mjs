#!/usr/bin/env node
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const displaysPath = path.join(dataDir, "displays.json");
const frameDataDir = path.join(dataDir, "display-frames");
const maxBodyBytes = 16 * 1024 * 1024;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  const safePath = path
    .normalize(decodeURIComponent(url.pathname))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await stat(filePath);

    if (!file.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

listen(port);

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/displays") {
    await listDisplays(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/displays") {
    await saveDisplay(request, response);
    return;
  }

  const displayMatch = url.pathname.match(/^\/api\/displays\/([a-zA-Z0-9-]+)$/);
  if (request.method === "GET" && displayMatch) {
    await getDisplay(response, displayMatch[1]);
    return;
  }

  if (request.method === "DELETE" && displayMatch) {
    await deleteDisplay(response, displayMatch[1]);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function saveDisplay(request, response) {
  let payload;

  try {
    payload = validateDisplayPayload(await readJsonBody(request));
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Invalid display payload" });
    return;
  }

  const id = crypto.randomUUID();
  const record = {
    ...payload.record,
    id,
    createdAt: Date.now(),
  };
  const displays = await readDisplays();
  displays[id] = record;
  await writeDisplays(displays);

  if (payload.frames) {
    await writeDisplayFrames(id, payload.frames);
  }

  sendJson(response, 201, record);
}

async function listDisplays(response) {
  const displays = await readDisplays();
  const records = Object.values(displays)
    .map((record) => ({
      id: record.id,
      type: record.type || "image",
      width: record.width,
      height: record.height,
      font: record.font,
      frameCount: record.frameCount || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt || null,
    }))
    .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));

  sendJson(response, 200, { displays: records });
}

async function getDisplay(response, id) {
  const displays = await readDisplays();
  const record = displays[id];

  if (!record) {
    sendJson(response, 404, { error: "Display not found" });
    return;
  }

  if (record.type === "animation") {
    sendJson(response, 200, {
      ...record,
      frames: await readDisplayFrames(id),
    });
    return;
  }

  sendJson(response, 200, record);
}

async function deleteDisplay(response, id) {
  const displays = await readDisplays();

  if (!displays[id]) {
    sendJson(response, 404, { error: "Display not found" });
    return;
  }

  delete displays[id];
  await writeDisplays(displays);

  try {
    await unlink(getFramesPath(id));
  } catch {}

  sendJson(response, 200, { ok: true, id });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        request.destroy();
        reject(new Error("Payload too large"));
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function validateDisplayPayload(payload) {
  const width = Number(payload?.width);
  const height = Number(payload?.height);

  if (!Number.isInteger(width) || width < 1 || width > 512) {
    throw new Error("Invalid width");
  }

  if (!Number.isInteger(height) || height < 1 || height > 512) {
    throw new Error("Invalid height");
  }

  if (payload?.type === "animation") {
    const frames = validateAnimationFrames(payload.frames, width, height);

    return {
      record: {
        type: "animation",
        width,
        height,
        font: typeof payload.font === "string" ? payload.font : "signpainter",
        frameCount: frames.length,
        frameDuration: Number(payload.frameDuration) || 180,
        settings: sanitizeSettings(payload.settings),
      },
      frames,
    };
  }

  if (!Array.isArray(payload.rows) || payload.rows.length !== height) {
    throw new Error("Invalid rows");
  }
  const rows = payload.rows.map((row) => {
    if (typeof row !== "string") throw new Error("Invalid row");
    return row.slice(0, width).padEnd(width, " ");
  });

  return {
    record: {
      type: "image",
      width,
      height,
      rows,
      font: typeof payload.font === "string" ? payload.font : "signpainter",
      settings: sanitizeSettings(payload.settings),
    },
  };
}

function validateAnimationFrames(frames, width, height) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 120) {
    throw new Error("Invalid animation frames");
  }

  return frames.map((frame) => {
    if (!Array.isArray(frame) || frame.length !== height) {
      throw new Error("Invalid animation frame");
    }

    return frame.map((row) => {
      if (typeof row !== "string") throw new Error("Invalid animation row");
      return row.slice(0, width).padEnd(width, " ");
    });
  });
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(settings)
      .filter(([key, value]) => /^[a-zA-Z0-9_-]{1,40}$/.test(key) && isJsonScalar(value))
      .slice(0, 80),
  );
}

function isJsonScalar(value) {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

async function readDisplays() {
  try {
    return JSON.parse(await readFile(displaysPath, "utf8"));
  } catch {
    return {};
  }
}

async function writeDisplays(displays) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(displaysPath, JSON.stringify(displays, null, 2));
}

async function readDisplayFrames(id) {
  try {
    const parsed = JSON.parse(await readFile(getFramesPath(id), "utf8"));
    return Array.isArray(parsed.frames) ? parsed.frames : [];
  } catch {
    return [];
  }
}

async function writeDisplayFrames(id, frames) {
  await mkdir(frameDataDir, { recursive: true });
  await writeFile(getFramesPath(id), JSON.stringify({ frames }), "utf8");
}

function getFramesPath(id) {
  return path.join(frameDataDir, `${id}.json`);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function listen(candidatePort) {
  server.removeAllListeners("error");
  server.removeAllListeners("listening");

  server.once("error", (error) => {
    if ((error.code === "EADDRINUSE" || error.code === "EPERM") && candidatePort < port + 20) {
      listen(candidatePort + 1);
      return;
    }

    throw error;
  });

  server.once("listening", () => {
    console.log(`Flap demo running at http://localhost:${candidatePort}`);
  });
  server.listen(candidatePort);
}
