---
name: In-app media popup convention
description: Video/audio/link attachments on assignment screens must open in an in-app modal, never navigate away; video specifically renders inline with no click needed.
---

Assignment media (video, audio, and any generically-linked file/attachment) must render/play inside the app — never via `Linking.openURL` or a new browser tab/external navigation.

**Why:** User explicitly required all attached media (uploaded or link-based) to stay inside the app experience; navigating away breaks the flow and was reported as a bug across multiple assignment-related screens (assignment detail, teacher results, submission review). A later request tightened this further: video specifically should play immediately inline on the page with no "Открыть видео" button/click required — a click-to-open button is not acceptable for video even though it opens an in-app modal.

**How to apply:** Two sibling components share the same embedding logic (YouTube-embed detection, native `<video>`/`<audio>` on web, expo-av fallbacks on native):
- `MediaViewerModal` — popup version with open/close chrome, used for audio and generic/"other" file attachments (button that opens a closable modal).
- `InlineMediaPlayer` — chromeless version that always renders the player directly (no button, no modal), used for video attachments only, reusing `toEmbeddableUrl`/`NativeVideoPlayer`/`NativeAudioPlayer` exported from `MediaViewerModal`.
When adding a new screen that displays assignment video, use `InlineMediaPlayer` directly (not a button + modal); for audio/other attachments keep using `MediaViewerModal`.
