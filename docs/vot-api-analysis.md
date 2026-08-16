# Voice Over Translation (VOT) API analysis

Status: source analysis of `ilyhalight/voice-over-translation` `master`; no VOT code copied.

## Minimal YouTube path

```
FreeTube Watch videoId / canonical URL
  -> construct VOT VideoData + source/target language
  -> VOT client translateVideo(...)
  -> response: translated URL, or remainingTime / translationId
  -> abortable wait and repeat request
  -> separate HTMLAudioElement consumes resulting URL
```

The upstream extension uses the reusable `@vot.js/core` client for the signed/provider protocol. Its extension orchestration has an extra YouTube-specific `AUDIO_REQUESTED` path: it downloads audio then posts it back through `requestVtransAudio`, then requests translation again. This is an integration risk, not a detail that can safely be omitted from a functioning PoC.

## Relevant modules

| Function | VOT source file | Needed in FreeTube | Needs adaptation |
| --- | --- | --- | --- |
| Translation API selection / text-language helpers | `src/core/translateApis.ts` | Partly | Yes — extension storage and `GM_fetch` must not come across. |
| VOT request, response handling, ETA retry, AbortSignal | `src/core/translationHandler.ts` (`VOTTranslationHandler.translateVideoImpl`) | Yes | Yes — remove UI, account and extension-specific audio downloader integration. |
| Call into `@vot.js/core` | `src/core/translationHandler.ts` (`votClient.translateVideo`) | Yes | Prefer direct dependency/adapter rather than copying. |
| Automatic-translation state machine | `src/core/translationOrchestrator.ts` | No | No; PoC is explicit button only. |
| High-level request/apply/cache/stale action checks | `src/videoHandler/modules/translationPlayback.ts` | Partly | Yes — retain the stale-result guard idea, not the extension playback/UI implementation. |
| Audio source/proxy fallback | `src/videoHandler/modules/translationPlayback.ts` | Partly | Yes — test direct audio first, then use a tightly scoped main-process proxy only if needed. |
| Playback / volume features | `src/videoHandler/modules/translationPlayback.ts`, `src/videoHandler/translationVolume.ts`, `src/videoHandler/volumeLink.ts` | Concept only | Yes — make a small FreeTube controller, not a transplant. |
| Audio-download/upload fallback | `src/audioDownloader/*`, `src/core/translationHandler.ts` | Conditional | Yes — no browser-extension download/runtime; only implement after the simple metadata request is proven insufficient. |
| YouTube/site DOM discovery | `src/videoHandler/*`, `src/core/videoManager.ts` | No | No. FreeTube already owns id, metadata and video element. |
| Extension bootstrap/UI/subtitles/localization | `src/bootstrap/*`, `src/extension/*`, `src/ui/*`, `src/subtitles/*` | No | No. |

## Endpoints and request semantics

The current VOT configuration identifies these hosts (values are configuration, not secrets):

| Purpose | Configured endpoint/host | PoC treatment |
| --- | --- | --- |
| Primary Yandex Browser service | `https://api.browser.yandex.ru` | Access only through the VOT client/adapter; do not hand-recreate signing based on guesses. |
| VOT backend | `https://vot.toil.cc/v1` | May be used by client/provider; permit only explicit routes. |
| VOT proxy workers | `vot-worker.vtrans.eu.cc`, `vot-worker.eu.cc` | Fallback only; configurable allow-list. |
| Media proxy | `media-proxy.toil.cc/v1/proxy/m3u8` | Not a first-PoC dependency; required only for incompatible indirect media URLs. |
| Optional detection / auth services | `rust-server-531j.onrender.com` | Out of scope unless the client returns an explicit account/detection requirement. |

The precise signed request headers/body and result types belong to `@vot.js/core` (the extension imports its `VideoTranslationResponse`, `VideoTranslationStatus`, request/response languages and client). The integration must pin and inspect that package at implementation time rather than duplicate an unstable private protocol in FreeTube. Do not store or log cookies, account tokens, signed values, request bodies or full responses.

Expected response handling from VOT's `translationHandler`:

* finished: `translated === true` and `remainingTime < 1`; obtain the audio URL from the returned translation response;
* still generating: use `remainingTime` when present, otherwise bounded retry; upstream starts retrying at 30 seconds and caps initial ETA waits at 180 seconds;
* `AUDIO_REQUESTED`: upstream's YouTube fallback obtains/uploads audio, then repeats the request;
* cancellation: propagate `AbortSignal`; upstream explicitly treats abort as a non-error;
* known errors: unsupported/failed request, no audio link, network/timeout and authorization are mapped to localized messages.

## License

FreeTube is AGPL-3.0-or-later. The current VOT repository LICENSE is MIT (copyright sodapng, 2021; ilyhalight, 2022-present). If source is directly copied, preserve copyright and MIT text in `THIRD_PARTY_NOTICES.md`. The preferred PoC path is an adapter around the published VOT library or a clean implementation based on observed behaviour; that avoids importing the extension runtime.

## Network and security decision

Renderer direct fetch is not approved as the production plan: it can fail CORS and may expose protocol-specific details. Start with a narrowly scoped Electron main-process HTTPS client behind one preload function, with an explicit host allow-list, method/schema validation, timeouts and `AbortSignal`/request-id cancellation. Do not disable CSP, `webSecurity`, or enable Node integration. Renderer plays the resulting remote audio URL normally; if audio CORS fails, add a narrowly scoped streaming/proxy solution after confirming headers/range support.

## Architecture plan and risks

1. Prove one translated URL for one public English YouTube video using a small VOT adapter in main process.
2. Add the media-only controller: play/pause, `seeked`, `ratechange`; drift check every 500 ms and seek only when absolute drift exceeds 0.25 s.
3. Keep a request generation plus video-id guard; abort and destroy on route/component teardown and reject a result that does not match current `videoId`.
4. Add UI states; only after this works add volumes/settings/locales.

Main risks: VOT/Yandex protocol and availability change without notice; translation may require the `AUDIO_REQUESTED` upload fallback; audio URL CORS/range/expiry; audio duration differing from video; network location restrictions/proxy health; Electron security boundary; and upstream FreeTube player churn. Test on a short public non-live English video before building UX.
