# Validation status

## Completed locally

- 13 deterministic core tests passed, zero failures or skips (including Drive confirmation-form parsing).
- Dependencies installed and pnpm lockfile generated.
- TypeScript check and Vite production build passed.
- Live anonymous Drive download succeeded for the user-provided MP3 (1,685,683 bytes), using the actual relay implementation.
- The production browser app opened the same Drive link as 122.mp3, duration 01:44.
- All five TypeScript modules parse successfully after Node's TypeScript stripping. This is syntax checking, not TypeScript type checking.
- Browser UI opened successfully using a temporary source-only verification server (not the production Vite build).
- Local WAV selected through the real file picker; duration displayed as 00:04.
- Play button changed to pause; speed changed from 1.00× to 0.95×.
- No browser console errors in that flow.
- At a 390px viewport, document/body width was 375px: no horizontal overflow.
- The user-provided Drive link was identified by the connected Drive service as an MP3, 1,685,683 bytes. This metadata read does not prove anonymous/public download access. The user's file and link are not included in this repository.

## Remaining verification

- Live Google confirmation-page behavior for larger files (parser is covered by fixtures).
- Actual Whisper and NLLB inference in a browser, Japanese accuracy and Vietnamese translation quality on a choukai recording.
- Furigana dictionary loading and sentence interaction with real inference results.

Network access was granted during authoring; package installation, local tests, production build and anonymous Drive download now work. GitHub CI also runs install, test and build on pushes. Do not interpret source implementation or mocked tests as evidence that live inference has completed successfully.
