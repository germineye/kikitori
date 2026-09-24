# Kikitori · 聞き取り

A quiet Japanese listening notebook for Vietnamese learners. Paste a Google Drive audio link or open a local file, transcribe Japanese, translate into Vietnamese, and listen sentence by sentence.

## V1

- Google Drive **file** links (`/file/d/…`, `/open?id=…`, `/uc?id=…`), including resource keys. No manual download/upload round-trip.
- Local MP3, WAV, M4A, OGG, FLAC and WebM when the browser can decode the codec.
- Japanese transcription with multilingual Whisper Base; Japanese → Vietnamese with NLLB-200 distilled 600M.
- Sentence timestamps, click/keyboard seek-and-play, current-sentence highlighting, 0.5–1.5× speed slider.
- Dictionary furigana, hidden until word hover or sentence keyboard focus. Always mode for full furigana and touch devices.
- Progress messages, cancellation, partial transcript retained if translation fails.
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

## Why a small Drive relay exists

Google Drive preview/download pages are not a reliable CORS-enabled audio API. A Drive iframe can play a file but cannot supply its audio bytes or accurate seek control to an unrelated application. The small Node relay downloads publicly shared audio and returns it to the browser on the app's own origin. It does not run AI or keep files on disk. No paid API or developer key is required.

V1 requires **Anyone with the link** and downloads enabled. Restricted school-domain files, login-only links, folders, quota-limited files, and files blocked by Google are not bypassed. The relay follows only allowlisted Google HTTPS hosts, limits redirects/body size/concurrent requests/time, rejects non-audio signatures, and does not forward cookies or credentials. Google's confirmation-page format is not a stable API and may need maintenance.

**Static-only hosting such as GitHub Pages cannot provide the complete Drive flow by itself.** Deploy the included server with the built frontend. Free hosting is possible within provider limits but is not an unlimited free-service guarantee.

## Models, accuracy and resource usage

Inference runs in a dedicated browser worker using Transformers.js and quantized WASM models. WASM is the conservative baseline; WebGPU is not required. The transcription model is disposed before the translation model loads to reduce peak memory. Model files download from Hugging Face on first use and are cached by the browser where supported. Expect roughly 1 GB of initial downloads, substantial RAM usage, and potentially slow CPU inference. A computer is recommended. Browser cache eviction can trigger another download.

Audio is decoded and mixed to mono at 16 kHz. V1 caps audio at 100 MB / 30 minutes. Whisper supplies segment timestamps; sentences within one segment use proportional timing marked `≈`, **not word alignment**. Pauses remain unhighlighted. Japanese punctuation and timing gaps guide grouping. Furigana uses kuromoji dictionary readings (katakana converted to hiragana); unknown words and names can be missing or wrong. Transcript and translation can also contain mistakes.

If a model cannot load, has insufficient memory, or translation fails, the UI reports an error and retains any completed transcript. Stopping terminates the worker. The original audio remains playable.

## Privacy and licenses

Local audio never leaves the browser. Drive audio passes through the relay in memory and is not persisted. No audio, transcripts, Drive links, or user files are committed as fixtures. The app makes requests to Hugging Face for model files and Google Fonts for fonts. There are no analytics.

Application source: MIT. Whisper model: Apache-2.0. **NLLB weights: CC-BY-NC-4.0, non-commercial use only.** Application licensing does not relicense those weights. kuromoji/IPADIC retains its upstream licenses. Review model and dictionary licenses before commercial use.

## Verification

`pnpm test` covers Drive URL validation, redirect allowlists, permission/rate/size errors, audio sniffing, sentence grouping, approximate timestamps, silence highlighting, and the Drive confirmation form. The confirmation-form test is skipped until dependencies are installed. These are deterministic tests; they do not claim live Google or model inference success.

See [VALIDATION.md](VALIDATION.md) for the actual checks completed in the authoring environment and remaining verification work.

References: [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/api/pipelines), [Whisper Base ONNX](https://huggingface.co/Xenova/whisper-base), [NLLB ONNX](https://huggingface.co/Xenova/nllb-200-distilled-600M), [Drive download guidance](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [Drive resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys).

