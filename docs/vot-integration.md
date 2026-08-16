# FreeTube VOT integration — architecture analysis

Status: research only (no application source modified).

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

## Intended first-PoC FreeTube changes

* `src/renderer/views/Watch/Watch.{vue,js}` — controls, request state, cancellation and route teardown.
* `src/renderer/components/ft-shaka-video-player/ft-shaka-video-player.js` — instantiate/tear down the playback controller and expose narrow control methods.
* `src/renderer/helpers/player/VoiceTranslationPlaybackController.js` — new media-only controller.
* `src/renderer/services/voiceTranslation/*` — new UI-facing service/types/errors.
* `src/main/index.js`, `src/preload/{main,interface}.js`, `src/preload/preload-interface.d.ts` — only if renderer requests are blocked by CORS; expose a single typed VOT IPC operation.
* `src/renderer/components/PlayerSettings/*`, store defaults, and affected locale JSON — deferred until the media proof succeeds.

## Development/build verification

The repository was fetched from `FreeTubeApp/FreeTube` branch `development` at commit `1e19525`; work is on `feature/vot-voice-translation`. `pnpm install --frozen-lockfile` completed successfully (1,105 packages). Electron `43.3.0` was downloaded, then `pnpm dev` started FreeTube successfully on Windows; the Electron window opened with title `Подписки - FreeTube` and development `dist/main.js`/`dist/preload.js` bundles were created.

The default Windows Codex sandbox currently fails before PowerShell can start (`apply deny-read ACLs`). The successful commands above ran only after one-time user-approved elevation; this is an environment limitation, not a FreeTube change.
