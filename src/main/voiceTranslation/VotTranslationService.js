import VOTClient from '@vot.js/ext/client'
import { VOTWorkerProvider } from '@vot.js/core/providers/votworker'

export const VOT_WORKER_HOST = 'vot-worker.vtrans.eu.cc'

const MAX_TRANSLATION_TIME_MS = 10 * 60 * 1000
const MAX_VIDEO_DURATION_SECONDS = 4 * 60 * 60
const DEFAULT_POLL_INTERVAL_SECONDS = 10
const MAX_POLL_INTERVAL_SECONDS = 30

export class VoiceTranslationError extends Error {
  /**
   * @param {'invalid-request'|'unsupported'|'timeout'|'network'|'translation-failed'|'account-required'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'VoiceTranslationError'
    this.code = code
  }
}

export class VotTranslationService {
  /**
   * @param {{ getToken: () => Promise<string|undefined> }|undefined} accountStore
   */
  constructor(accountStore = undefined) {
    this.accountStore = accountStore
  }

  /**
   * @param {{
   *   videoId: string,
   *   videoUrl: string,
   *   duration?: number,
   *   sourceLanguage?: string,
   *   targetLanguage: string,
   *   voiceMode?: 'standard'|'live'
   * }} request
   * @param {AbortSignal} signal
   * @returns {Promise<{
   *   audioUrl: string,
   *   duration?: number,
   *   sourceLanguage: string,
   *   targetLanguage: string,
   *   voiceMode: 'standard'|'live'
   * }>}
   */
  async translateVideo(request, signal) {
    const normalizedRequest = normalizeRequest(request)
    throwIfAborted(signal)

    const apiToken = normalizedRequest.voiceMode === 'live'
      ? await this.accountStore?.getToken()
      : undefined

    if (normalizedRequest.voiceMode === 'live' && !apiToken) {
      throw new VoiceTranslationError('account-required', 'A Yandex OAuth token is required for live voices')
    }

    const client = new VOTClient({
      host: VOT_WORKER_HOST,
      provider: VOTWorkerProvider,
      fetchOpts: { signal },
      apiToken
    })
    const startedAt = Date.now()
    const translationRequest = {
      videoData: {
        url: normalizedRequest.videoUrl,
        videoId: normalizedRequest.videoId,
        host: 'youtube',
        duration: normalizedRequest.duration
      },
      requestLang: normalizedRequest.sourceLanguage,
      responseLang: normalizedRequest.targetLanguage
    }

    let useLivelyVoice = normalizedRequest.voiceMode === 'live'
    let response

    try {
      response = await requestTranslation(client, translationRequest, true, useLivelyVoice)
    } catch (error) {
      if (!useLivelyVoice || !isLivelyVoiceUnavailable(error)) {
        throw error
      }

      useLivelyVoice = false
      response = await requestTranslation(client, translationRequest, true, false)
    }

    if (useLivelyVoice && isLivelyVoiceUnavailable(response)) {
      useLivelyVoice = false
      response = await requestTranslation(client, translationRequest, true, false)
    }

    while (!response.translated) {
      throwIfAborted(signal)

      if (Date.now() - startedAt > MAX_TRANSLATION_TIME_MS) {
        throw new VoiceTranslationError('timeout', 'Voice translation timed out')
      }

      await waitForPollInterval(response.remainingTime, signal)
      throwIfAborted(signal)

      try {
        response = await requestTranslation(client, translationRequest, false, useLivelyVoice)
      } catch (error) {
        if (!useLivelyVoice || !isLivelyVoiceUnavailable(error)) {
          throw error
        }

        useLivelyVoice = false
        response = await requestTranslation(client, translationRequest, false, false)
      }

      if (useLivelyVoice && isLivelyVoiceUnavailable(response)) {
        useLivelyVoice = false
        response = await requestTranslation(client, translationRequest, false, false)
      }
    }

    if (!response.url) {
      throw new VoiceTranslationError('translation-failed', 'VOT did not return an audio URL')
    }

    return {
      audioUrl: response.url,
      duration: normalizedRequest.duration,
      sourceLanguage: normalizedRequest.sourceLanguage,
      targetLanguage: normalizedRequest.targetLanguage,
      voiceMode: useLivelyVoice ? 'live' : 'standard'
    }
  }
}

/**
 * @param {VOTClient} client
 * @param {object} translationRequest
 * @param {boolean} shouldSendFailedAudio
 * @param {boolean} useLivelyVoice
 */
function requestTranslation(client, translationRequest, shouldSendFailedAudio, useLivelyVoice) {
  return client.translateVideo({
    ...translationRequest,
    extraOpts: { useLivelyVoice },
    // The provider implements VOT's YouTube AUDIO_REQUESTED fallback. It is
    // intentionally kept here instead of importing the extension downloader.
    shouldSendFailedAudio
  })
}

/**
 * @param {unknown} value
 */
function isLivelyVoiceUnavailable(value) {
  const candidate = /** @type {{ message?: unknown, data?: { message?: unknown } }} */ (value)
  const messages = [candidate?.message, candidate?.data?.message]
  return messages.some(message => typeof message === 'string' && message.toLowerCase().includes('обычная озвучка'))
}

/**
 * @param {unknown} value
 */
function normalizeRequest(value) {
  if (!value || typeof value !== 'object') {
    throw new VoiceTranslationError('invalid-request', 'Missing voice translation request')
  }

  const request = /** @type {Record<string, unknown>} */ (value)
  const videoId = typeof request.videoId === 'string' ? request.videoId : ''
  const videoUrl = typeof request.videoUrl === 'string' ? request.videoUrl : ''
  const sourceLanguage = request.sourceLanguage ?? 'en'
  const targetLanguage = request.targetLanguage
  const voiceMode = request.voiceMode ?? 'standard'

  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId) || !isMatchingYouTubeUrl(videoUrl, videoId)) {
    throw new VoiceTranslationError('invalid-request', 'Invalid YouTube video reference')
  }

  if (sourceLanguage !== 'en' || targetLanguage !== 'ru') {
    throw new VoiceTranslationError('unsupported', 'Only English to Russian voice translation is supported')
  }

  if (voiceMode !== 'standard' && voiceMode !== 'live') {
    throw new VoiceTranslationError('invalid-request', 'Invalid voice translation mode')
  }

  const duration = typeof request.duration === 'number' && Number.isFinite(request.duration) &&
    request.duration > 0 && request.duration <= MAX_VIDEO_DURATION_SECONDS
    ? request.duration
    : undefined

  return {
    videoId,
    // Do not allow renderer input to choose an arbitrary URL for the main
    // process client, even when the parsed URL was valid.
    videoUrl: `https://youtu.be/${videoId}`,
    duration,
    sourceLanguage,
    targetLanguage,
    voiceMode
  }
}

/**
 * @param {string} value
 * @param {string} videoId
 */
function isMatchingYouTubeUrl(value, videoId) {
  try {
    const url = new URL(value)

    if (url.protocol !== 'https:') {
      return false
    }

    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) === videoId
    }

    return (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
      url.pathname === '/watch' && url.searchParams.get('v') === videoId
  } catch {
    return false
  }
}

/**
 * @param {number} remainingTime
 * @param {AbortSignal} signal
 */
function waitForPollInterval(remainingTime, signal) {
  const seconds = Number.isFinite(remainingTime) && remainingTime > 0
    ? Math.min(Math.max(remainingTime, 2), MAX_POLL_INTERVAL_SECONDS)
    : DEFAULT_POLL_INTERVAL_SECONDS

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, seconds * 1000)

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(createAbortError())
    }

    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * @param {AbortSignal} signal
 */
function throwIfAborted(signal) {
  if (signal.aborted) {
    throw createAbortError()
  }
}

function createAbortError() {
  const error = new Error('Voice translation was cancelled')
  error.name = 'AbortError'
  return error
}
