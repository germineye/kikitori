# Validation status

## Current local-file release

- Removed the Google Drive input, both relays, their server and deployment configuration, and related tests. The GitHub Pages build has no audio upload endpoint.
- Removed the top-right header label and introductory headline shown in the user's screenshot. The source section now starts directly below the logo header.
- Added a keyboard-accessible file drop area. It accepts one supported audio file at a time through drag and drop or the native file picker, then uses the existing local player and transcription flow.
- Eight sentence/timestamp tests passed. TypeScript checking and a production Vite build passed.
- The built page rendered in a browser. A synthetic 1-second WAV selected through the new drop area opened the player and showed its duration. An operating-system drag gesture was not exercised in the authoring environment.

## Transcription limits

- A previous live run transcribed a 01:44 Japanese sample with Whisper Small and showed sentence rows, seek, playback highlight and furigana. This was a functional check, not an accuracy benchmark; some words and names were wrong.
- The model files are large and fetched on first use. Devices with little memory may fail to load them. Audio is limited to 100 MB and 30 minutes; codecs still depend on browser support.
