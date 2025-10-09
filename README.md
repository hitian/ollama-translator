# Ollama Translator

A minimal, static web app to translate text using one or more Ollama models. Matches the provided UI reference and runs entirely in the browser.

## Features
- Language selection with swap (English, Chinese, Simplified, Japanese, Korean)
- Settings modal to configure Ollama API base URL
- Model picker (multi-select) populated from Ollama `/api/tags`
- Translate button runs each selected model sequentially via `/api/generate`
- Separate result card per model in selection order
- LocalStorage persistence for API URL and selected models

## Quick Start
1. Ensure Ollama is running and models are available.
   - Default API: `http://localhost:11434`
   - List images: `ollama list`
2. Serve this folder (to avoid browser CORS restrictions):
   - Python: `python3 -m http.server`
   - Node: `npx serve` (if available)
3. Open the served URL in your browser (e.g., `http://localhost:8000`).
4. Click the gear icon to confirm/set the Ollama API base URL.
5. Click “Model” to select one or more models (images).
6. Enter text and click “Translate”. Results appear in order of selection.

## Configuration
- Base URL is stored in LocalStorage under `ollama_base_url`.
- Selected models are stored under `ollama_selected_models`.

## API Endpoints Used
- `GET /api/tags` — list available images (models)
- `POST /api/generate` with `{ model, prompt, stream: false }` — generate translation

## Notes
- CORS: When opening `index.html` directly via `file://`, browsers typically block requests. Serve the folder as shown above. If needed, configure Ollama origins (version-dependent), e.g. `export OLLAMA_ORIGINS=*` when starting Ollama.
- The app is framework-free (HTML/CSS/JS). No build step is required.

## Files
- `index.html` — Page structure and modals
- `styles.css` — Styling and layout
- `app.js` — UI logic and API calls

## License
This project is provided as-is for demonstration purposes.
