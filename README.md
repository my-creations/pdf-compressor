# Compressor de PDF 📄⚡

A fast, private web app that shrinks PDFs and phone photos to the size an upload portal asks for (2 MB by default). Everything runs in the browser, so no file is ever uploaded.

Hosted on **GitHub Pages** with continuous deployment via **GitHub Actions**.

## Features

- **Smart hybrid compression.** Text stays selectable whenever possible:
  1. **Lossless clean-up:** removes unreferenced objects, compresses uncompressed streams and packs objects into object streams. Files already under the limit are returned untouched.
  2. **Image recompression:** re-encodes embedded photos and scans as JPEG, stepping resolution and quality down (best quality first, then a binary search) until the file fits. Text, links, forms and bookmarks are preserved.
  3. **Rasterize (last resort):** turns pages into images only if the first two steps can't reach the target. The result clearly warns that text is no longer selectable.
- **Any target size:** 1, 2, 5 or 10 MB, or a custom value.
- **Photos → PDF and merging:** combine phone photos (JPG, PNG, WebP; EXIF orientation respected) and several PDFs into one PDF, or produce one PDF per file and download them all as a ZIP.
- **Page tools:** thumbnails, rotate, reorder and delete pages, and reorder files.
- **Black & white:** grayscale option for an even smaller file.
- **Before / after preview:** compare original and compressed pages side by side.
- **Honest results:** if the target can't be reached, the app says so and suggests what to try.
- **Installable and offline:** PWA with a service worker that precaches the whole app. On Android it accepts files via "Share to…", and on desktop via "Open with…".
- **Portuguese and English:** detected from the browser, with a manual toggle that is remembered.
- **Light and dark mode**, keyboard accessible, and responsive down to phone screens.

## Architecture

| Path | Role |
| --- | --- |
| `src/engine/optimize.js` | Hybrid optimizer (pdf-lib): lossless clean-up and image recompression |
| `src/engine/assemble.js` | Builds output PDFs from pages of several PDFs and photos |
| `src/engine/worker.js` | Web Worker running assemble/optimize off the main thread |
| `src/engine/rasterize.js` | pdf.js-based last-resort rasterizer |
| `src/engine/pipeline.js` | Orchestrates a job across outputs, with progress and cancellation |
| `src/ui/*` | Workspace (thumbnails and page tools), results and compare dialog |
| `src/i18n.js` | PT/EN strings |
| `src/sw.js` | Service worker; precache list is generated at build time in `vite.config.js` |

## Local development

```bash
bun install
bun dev            # start dev server
bun run test:unit  # engine, format and i18n unit tests
bun run test:e2e   # Playwright end-to-end tests
bun run build      # production build in dist/
```

To run the E2E tests against an already-installed Chromium, set `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`.

## Deployment

Automatically deployed to GitHub Pages on push to `main` by `.github/workflows/deploy.yml`.

To enable GitHub Pages in your repository settings:
1. Go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
