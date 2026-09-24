# Validation status

## Completed locally

- 12 deterministic core tests passed, zero failures.
- 1 confirmation-page parser test skipped because dependencies are not installed.
- All five TypeScript modules parse successfully after Node's TypeScript stripping. This is syntax checking, not TypeScript type checking.
- Browser UI opened successfully using a temporary source-only verification server (not the production Vite build).
- Local WAV selected through the real file picker; duration displayed as 00:04.
- Play button changed to pause; speed changed from 1.00× to 0.95×.
- No browser console errors in that flow.
- At a 390px viewport, document/body width was 375px: no horizontal overflow.
- The user-provided Drive link was identified by the connected Drive service as an MP3, 1,685,683 bytes. This metadata read does not prove anonymous/public download access. The user's file and link are not included in this repository.

## Remaining verification

- Dependency installation, lockfile generation, TypeScript check and production bundle.
- Live anonymous Drive download, including confirmation pages.
- Actual Whisper and NLLB inference in a browser, Japanese accuracy and Vietnamese translation quality on a choukai recording.
- Furigana dictionary loading and sentence interaction with real inference results.

The authoring environment blocked package-registry and direct Drive network access. GitHub CI runs the install, test and build steps on pushes. Do not interpret source implementation or mocked tests as evidence that live inference has completed successfully.
