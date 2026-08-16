export class VoiceTranslationClientError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'VoiceTranslationClientError'
    this.code = code
  }
}

/**
 * @param {{
 *   videoId: string,
 *   videoUrl: string,
 *   duration?: number,
 *   sourceLanguage?: string,
 *   targetLanguage: string
 * }} request
 */
export async function translateVoiceVideo(request) {
  if (!process.env.IS_ELECTRON || !window.ftElectron?.translateVoiceVideo) {
    throw new VoiceTranslationClientError('unsupported', 'Voice translation is available only in the desktop app')
  }

  const response = await window.ftElectron.translateVoiceVideo(request)

  if (!response?.ok) {
    throw new VoiceTranslationClientError(
      response?.error?.code ?? (response?.aborted ? 'cancelled' : 'translation-failed'),
      response?.error?.message ?? 'Unable to get voice translation'
    )
  }

  return response.result
}

/**
 * @param {string} videoId
 */
export async function cancelVoiceTranslation(videoId) {
  if (process.env.IS_ELECTRON && window.ftElectron?.cancelVoiceTranslation) {
    await window.ftElectron.cancelVoiceTranslation(videoId)
  }
}
