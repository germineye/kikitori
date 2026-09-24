# Kikitori · 聞き取り

A quiet Japanese listening notebook for Vietnamese learners. Open an audio file, transcribe Japanese, and listen sentence by sentence.

## V1

- Google Drive **file** links (`/file/d/…`, `/open?id=…`, `/uc?id=…`), including resource keys. No manual download/upload round-trip.
- Local MP3, WAV, M4A, OGG, FLAC and WebM when the browser can decode the codec.
- Japanese transcription with multilingual Whisper Small and word-level timestamps.
- Sentence timestamps, click/keyboard seek-and-play, current-sentence highlighting, 0.5–1.5× speed slider.
- Dictionary furigana, hidden until word hover or sentence keyboard focus. Always mode for full furigana and touch devices.
- Progress messages and cancellation.
- No account, API key, chatbot, export or database.

## Run

Node.js 22.18+ (24 recommended) and pnpm 11:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The dev command copies the kuromoji dictionary, starts Vite, and starts the Drive relay on port 8787.

```sh
pnpm test
pnpm build
pnpm start
```

Production serves the app and `/api/drive` together on `http://localhost:8787`. Set `HOST=0.0.0.0` and `PORT` when hosting behind an HTTPS reverse proxy. A Dockerfile is included. HTTPS or localhost is required for browser AI features.

## GitHub Pages

The `Deploy GitHub Pages` workflow builds the frontend with `/kikitori/` as its base path and publishes `dist`. In Settings → Pages, choose **GitHub Actions** as the source. The static site uses a small Cloudflare Worker for public Google Drive files; audio recognition stays in the browser.

Deploy the relay with `pnpm dlx wrangler deploy` after signing in to Cloudflare. Wrangler uses [wrangler.toml](wrangler.toml) and [worker/index.mjs](worker/index.mjs). Set the GitHub Actions repository variable `DRIVE_RELAY_URL` to the resulting `https://<name>.<account>.workers.dev/api/drive` URL, then rerun the Pages workflow. The build passes that URL as `VITE_DRIVE_RELAY_URL`; local development keeps using the same-origin Node relay. Until this variable is configured, Drive is unavailable on the Pages deployment.

## Why a small Drive relay exists

Google Drive preview/download pages are not a reliable CORS-enabled audio API. A Drive iframe can play a file but cannot supply its audio bytes to an unrelated application. A relay fetches publicly shared audio and returns it to the browser. GitHub Pages uses the streaming Cloudflare Worker; local development uses the Node relay. Neither runs AI or keeps files on disk. No paid API or developer key is required.

V1 requires **Anyone with the link** and downloads enabled. Restricted school-domain files, login-only links, folders, quota-limited files, and files blocked by Google are not bypassed. Both relays follow only allowlisted Google HTTPS hosts, limit redirects and audio size, reject non-audio signatures, and do not forward cookies or credentials. The Worker allows browser calls only from `https://germineye.github.io` and streams audio to stay within its memory limit. Google's confirmation-page format is not a stable API and may need maintenance.

Cloudflare's Free Worker request and CPU limits apply. Deploying the Worker is an additional account setup step, but users stay on the GitHub Pages URL without a sleeping web server.

## Models, accuracy and resource usage

Inference runs in a dedicated browser worker using Transformers.js and quantized Whisper Small on WASM. WebGPU is not required. Model files download from Hugging Face on first use and are cached by the browser where supported. The larger model takes longer and uses more memory than the previous Base model; a computer is recommended. Browser cache eviction can trigger another download.

Audio is decoded and mixed to mono at 16 kHz. V1 caps audio at 100 MB / 30 minutes. Whisper supplies word timestamps. Sentences split inside a word chunk still use proportional timing marked `≈`. Pauses remain unhighlighted. Japanese punctuation and timing gaps guide grouping. Furigana uses kuromoji dictionary readings (katakana converted to hiragana); unknown words and names can be missing or wrong. Transcripts can still contain mistakes.

If the model cannot load or has insufficient memory, the UI reports an error. Stopping terminates the worker. The original audio remains playable.

## Privacy and licenses

Local audio never leaves the browser. Drive audio and its public link pass through Cloudflare's Worker (or the local Node relay) and are not persisted by the app. No audio, transcripts, Drive links, or user files are committed as fixtures. The app makes requests to Hugging Face for model files and Google Fonts for fonts. There are no analytics.

Application source: MIT. Whisper model: Apache-2.0. kuromoji/IPADIC retains its upstream licenses. Review model and dictionary licenses before commercial use.

## Verification

`pnpm test` covers both relay flows, Drive URL validation, redirect allowlists, permission/rate/size errors, audio sniffing, sentence grouping, word boundaries, approximate timestamps, silence highlighting, and the Drive confirmation form. These deterministic tests do not establish that Cloudflare's IP can download a particular Drive file; test the deployed Worker with a public audio link before sharing the site.

See [VALIDATION.md](VALIDATION.md) for the actual checks completed in the authoring environment and remaining verification work.

References: [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/api/pipelines), [Whisper Small timestamped ONNX](https://huggingface.co/onnx-community/whisper-small_timestamped), [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages), [Drive download guidance](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [Drive resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys).
