# Validation status

## Streaming Drive relay update

- The Cloudflare Worker implementation follows the same public-file/allowlisted-host policy as the Node relay and streams audio without buffering the full file.
- `pnpm test` passes 21 deterministic tests, including CORS, redirects, Drive confirmation, audio response, and size limits for the Worker. `pnpm build` passes.
- A live call through the Worker handler from the authoring environment returned the user's public `122.mp3` (1,685,683 bytes, audio/mpeg). This confirms the code path locally; deployment and a Cloudflare-origin test remain outstanding.
- A direct browser fetch of the Google download URL failed. The GitHub Pages frontend therefore requires the configured Worker URL; a response that succeeds from Node does not prove browser CORS access.

## GitHub Pages and transcription update

- GitHub Pages had published the repository root, which served `/src/main.ts` instead of the built app. The repository now selects GitHub Actions as its Pages source, and the deploy workflow publishes `dist` with `/kikitori/` asset paths. The deployed page rendered successfully in a browser.
- Translation was removed from the UI and worker. Transcript rows now allow selecting Japanese text for browser translation while retaining click and keyboard seek.
- Whisper Small with word timestamps completed transcription of the user's 01:44 sample in a browser and displayed Japanese rows. This is a functional check, not a measured accuracy benchmark; individual words and names were still wrong. A later sentence-grouping adjustment is covered by deterministic tests.
- Until the Worker URL is configured for the Pages build, a Drive link displays a clear connection-needed error. GitHub Pages cannot run the included Node relay; its Drive flow remains available when the full server is hosted.
- The Vite dev server's automatic `.gz` content encoding broke kuromoji dictionary loading. A dev-only raw dictionary response now preserves the gzipped bytes; the GitHub Pages response already did so. Furigana after that dev fix still needs a live rerun.

The checks below record the earlier Whisper Base implementation and are retained as historical validation, not claims about the current model.

## Completed locally

- 14 deterministic core tests passed, zero failures or skips (including Drive confirmation-form parsing and unpunctuated exercise boundaries).
- Dependencies installed and pnpm lockfile generated.
- TypeScript check and Vite production build passed.
- Live anonymous Drive download succeeded for the user-provided MP3 (1,685,683 bytes), using the actual relay implementation.
- The production browser app opened the same Drive link as 122.mp3, duration 01:44.
- Real browser Whisper inference produced Japanese transcript rows; NLLB produced Vietnamese translations.
- Dictionary furigana loaded (45 ruby annotations in the sample); Always made readings visible and Hover hid them by default.
- Clicking a transcript row moved playback to approximately 00:48 and started audio; the highlighted sentence followed playback.
- GitHub CI passed install, all tests, TypeScript checking and the production build on commit 2b51e58.
- All five TypeScript modules parse successfully after Node's TypeScript stripping. This is syntax checking, not TypeScript type checking.
- Browser UI opened successfully using a temporary source-only verification server (not the production Vite build).
- Local WAV selected through the real file picker; duration displayed as 00:04.
- Play button changed to pause; speed changed from 1.00× to 0.95×.
- No browser console errors in that flow.
- At a 390px viewport, document/body width was 375px: no horizontal overflow.
- The user-provided Drive link was identified by the connected Drive service as an MP3, 1,685,683 bytes. This metadata read does not prove anonymous/public download access. The user's file and link are not included in this repository.

## Remaining verification

- Live Google confirmation-page behavior for larger files (parser is covered by fixtures).
- Accuracy tuning and evaluation across more recordings. The tested Whisper Base baseline made recognizable Japanese word and name errors; the current Whisper Small model also made errors on the sample. Treat this as a working prototype, not a reliable answer key.
- Boundary refinement was added after the live run to stop unpunctuated polite answers from merging into the next numbered exercise; that change passed targeted tests and production build.

Network access was granted during authoring; package installation, local tests, production build, anonymous Drive download and browser inference now work. GitHub CI also runs install, test and build on pushes. Passing technical checks does not establish transcript accuracy.

