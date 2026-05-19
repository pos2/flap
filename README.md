# Flap Display

Generate a configurable glyph sprite sheet for a split-flap / flip-board display:

```sh
npm run make:sprite
```

With custom options:

```sh
npm run make:sprite -- --font-family "Arial Narrow" --font-size 40 --color "#f8f2d8"
```

Or from a config file:

```sh
npm run make:sprite -- --config sprite.config.example.json
```

Generate the preview sprite presets:

```sh
npm run make:sprites
```

If `npm` is not available in the current shell, the same preset generator can be run directly:

```sh
node scripts/make-sprite-presets.mjs
```

The script writes:

- `public/assets/flap-glyphs.svg`: the sprite sheet
- `public/assets/flap-glyphs.json`: source rectangles for each glyph, including `top` and `bottom` halves for flip animation

The preset generator writes:

- `public/assets/sprites/*.svg`
- `public/assets/sprites/*.json`
- `public/assets/sprites/sprites.json`: the manifest used by the preview page font picker

Pages:

- `index.html`: image-to-ASCII tool with upload, processed image preview, ASCII output, and preprocessing controls for brightness, contrast, saturation, sepia, hue, grayscale, invert, sharpen, thresholding, edge detection, dithering, space density, and transparent frame.
- `flap.html`: saved split-flap preview with sprite font picker.
- `display.html`: generated split-flap display. The ASCII page saves the current character grid through the backend API, then this page loads it by `id` and animates a matching display.

## Run Locally

```sh
npm run dev
```

The app serves both frontend files and the display API from the same Node server.

API routes:

- `POST /api/displays`: save a display payload.
- `GET /api/displays`: list saved displays for database management.
- `GET /api/displays/:id`: load a saved display payload.
- `DELETE /api/displays/:id`: delete a saved display.

Saved displays are written to `data/displays.json` by default. Override with `DATA_DIR=/path/to/data`.

## Docker

Build and run with Compose:

```sh
docker compose up -d --build
```

The app listens on `http://localhost:4173` by default. To expose a different host port:

```sh
PORT=8080 docker compose up -d --build
```

Saved displays are persisted in the `flap-data` Docker volume mounted at `/data`.
