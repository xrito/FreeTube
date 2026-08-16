# FreeTube VOT integration — architecture analysis

Status: research complete; no FreeTube application source modified.

## FreeTube architecture

| Item | Finding |
| --- | --- |
| Node | `v22.23.2` installed and used. The repository does not declare an `engines.node` field. |
| Electron | `electron` `43.3.0`; Electron entry point is `src/main/index.js`. |
| Package manager | pnpm `11.19.0` (`pnpm-lock.yaml`, `pnpm-workspace.yaml`); `pnpm dev` launches development mode. |
| Build | Webpack independently packs main, renderer and preload; `pnpm build` runs pack plus release build. |

`src/` is deliberately split into `main/`, `preload/`, and `renderer/`. Renderer is Vue 3 + Vuex + vue-i18n. The application starts Electron from `src/main/index.js`; the constrained preload bridge is in `src/preload/{main,interface}.js`.

## Video page and player

* View: `src/renderer/views/Watch/Watch.vue` with component logic in `Watch.js`.
* Route source: `Watch.js` assigns `this.videoId = this.$route.params.id`; it reloads its state on route changes and gets local metadata with `getLocalVideoInfo(this.videoId)`.
* Player: `src/renderer/components/ft-shaka-video-player/ft-shaka-video-player.vue` and `.js`, built on Shaka Player 5. The template owns the only source `<video ref="video">`; the script creates `new shaka.ui.Overlay(..., videoElement, ...)` and attaches Shaka to that `HTMLVideoElement`.
* Existing events: Vue binds `play`, `pause`, `ended`, `canplay`, `volumechange` and `timeupdate` on the video. The player also listens for Shaka `ratechange` and emits `playback-rate-updated` to the Watch view. Seeking changes `video.currentTime` through the player helpers.

## Recommended VOT integration point

Keep VOT UI in the Watch view, immediately below `<ft-shaka-video-player>` and before the video information block. Keep media synchronization inside the Shaka-player component because it owns the `HTMLVideoElement`.

Add an isolated renderer service and a `VoiceTranslationPlaybackController` helper. The player should expose only narrow methods (for example `enableVoiceTranslation(result, volumes)` and `disableVoiceTranslation()`), not its raw video element. The controller owns a separate `HTMLAudioElement`, subscribes to the source video, and is destroyed from the player's existing teardown path.

```
Watch UI -> VoiceTranslationService -> narrow IPC -> main HTTPS client -> VOT
Watch UI -> player enable/disable -> PlaybackController -> audio + source video
```

For the first proof, use YouTube video id from the Watch route, canonical URL `https://youtu.be/<videoId>`, source language metadata already loaded by the Watch view where reliable, and target `ru`.

The VOT smoke-test on 2026-08-16 used the repository's public example ID and did not persist an audio URL, cookies, tokens or media. Direct `api.browser.yandex.ru` access created a session but returned HTTP 402 for the translation request. The VOT-configured worker `vot-worker.vtrans.eu.cc` returned HTTP 200 for both session creation and translation; its documented `AUDIO_REQUESTED` fallback plus abortable polling reached `FINISHED` and received an audio URL. Therefore the PoC must use a main-process adapter configured for the worker route, with direct Yandex access treated only as an optional, authenticated provider.

## Intended first-PoC FreeTube changes

* `src/renderer/views/Watch/Watch.{vue,js}` — controls, request state, cancellation and route teardown.
* `src/renderer/components/ft-shaka-video-player/ft-shaka-video-player.js` — instantiate/tear down the playback controller and expose narrow control methods.
* `src/renderer/helpers/player/VoiceTranslationPlaybackController.js` — new media-only controller.
* `src/renderer/services/voiceTranslation/*` — new UI-facing service/types/errors.
* `src/main/index.js`, `src/preload/{main,interface}.js`, `src/preload/preload-interface.d.ts` — expose one typed VOT IPC operation. Main process is the chosen security boundary, not a CORS workaround.
* `src/renderer/components/PlayerSettings/*`, store defaults, and affected locale JSON — deferred until the media proof succeeds.

## Minimal PoC implementation (2026-08-16)

The first implementation adds an isolated `src/main/voiceTranslation/VotTranslationService.js` with a single allow-listed VOT worker host, validation that canonicalizes the YouTube URL from the video ID, a ten-minute bounded poll and `AbortSignal` support. The preload exposes only translate and cancel operations; it does not expose arbitrary network access.

`VoiceTranslationPlaybackController` owns an independent `HTMLAudioElement`. It starts and pauses it with the Shaka-owned video, mirrors seeks and playback rate, checks drift every 500 ms and corrects only at 0.25 seconds or more. It temporarily uses original-video volume 15% and restores the previous volume and mute state during cleanup. Route changes and player teardown cancel the in-flight request and detach the audio listeners.

The exact main-service smoke-test completed an English-to-Russian public test translation and returned an audio URL without storing or logging it. An already-aborted request returned `AbortError`. Targeted ESLint/Stylelint and `pnpm run pack` passed. Manual clicking in the Electron window could not be automated because the local Windows ACL failure also prevents the Computer Use node-repl helper from starting.\n\nManual validation reported by the user: on an English YouTube video, the translation control was visible, VOT generated the Russian voice track, and playback worked in FreeTube.

## Development/build verification

The repository was fetched from `FreeTubeApp/FreeTube` branch `development` at commit `1e19525`; work is on `feature/vot-voice-translation`. `pnpm install --frozen-lockfile` completed successfully (1,105 packages). Electron `43.3.0` was downloaded, then `pnpm dev` started FreeTube successfully on Windows; the Electron window opened with title `Подписки - FreeTube` and development `dist/main.js`/`dist/preload.js` bundles were created.

The default Windows Codex sandbox currently fails before PowerShell can start (`apply deny-read ACLs`). The successful commands above ran only after one-time user-approved elevation; this is an environment limitation, not a FreeTube change.
