# Kikitori · 聞き取り

A quiet Japanese listening notebook for Vietnamese learners. Drop a local audio file, transcribe Japanese, and listen sentence by sentence.

## V1

- Local MP3, WAV, M4A, OGG, FLAC and WebM, when the browser can decode the codec. Drag and drop or use the file picker.
- Japanese transcription with multilingual Whisper Small and word-level timestamps.
- Sentence timestamps, click/keyboard seek-and-play, current-sentence highlighting, and a 0.5–1.5× speed slider.
- Dictionary furigana, hidden until word hover or sentence keyboard focus. Always mode shows readings throughout.
- Progress messages and cancellation.
- No login, backend, Google Drive integration, translation, chatbot, export or database.

## Run

Node.js 22.18+ (24 recommended) and pnpm 11:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The dev command copies the kuromoji dictionary and starts Vite. For a production build:

```sh
pnpm test
pnpm build
pnpm start
```

`pnpm start` previews the built static site. The `Deploy GitHub Pages` workflow builds with `/kikitori/` as its base path and publishes `dist`. In Settings → Pages, choose **GitHub Actions** as the source.

## Models and resource usage

Inference runs in a dedicated browser worker using Transformers.js and quantized Whisper Small on WASM. WebGPU is not required. Model files download from Hugging Face on first use and are cached by the browser where supported. The model is large; a computer is recommended, and browser cache eviction can trigger another download.

Audio is decoded and mixed to mono at 16 kHz. V1 caps files at 100 MB and decoded audio at 30 minutes. Whisper supplies word timestamps. Sentences split inside a word chunk use proportional timing marked `≈`; pauses remain unhighlighted. Furigana uses kuromoji dictionary readings. Transcripts and names can still be wrong.

If the model cannot load or has insufficient memory, the UI reports an error. Stopping terminates the worker. The original audio remains playable.

## Privacy and licenses

Selected audio and transcripts stay in the browser. The app requests model files from Hugging Face and fonts from Google Fonts. There is no analytics or file upload endpoint.

Application source: MIT. Whisper model: Apache-2.0. kuromoji/IPADIC retains its upstream licenses. Review model and dictionary licenses before commercial use.

## Verification

`pnpm test` covers sentence grouping, word boundaries, approximate timestamps and silence highlighting. `pnpm build` checks TypeScript and produces the static site. See [VALIDATION.md](VALIDATION.md) for completed checks and practical limits.

References: [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/api/pipelines), [Whisper Small timestamped ONNX](https://huggingface.co/onnx-community/whisper-small_timestamped), [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).
