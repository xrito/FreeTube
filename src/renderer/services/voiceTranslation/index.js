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

export async function exportVoiceTranslationVideo(request) {
  if (!process.env.IS_ELECTRON || !window.ftElectron?.exportVoiceTranslationVideo) {
    throw new VoiceTranslationClientError('unsupported', 'Video export is available only in the desktop app')
  }
  const response = await window.ftElectron.exportVoiceTranslationVideo(request)
  if (!response?.ok) {
    throw new VoiceTranslationClientError(response?.error?.code ?? 'export-failed', 'Unable to export video')
  }
  return response.result
}

export async function cancelVoiceTranslationExport() {
  if (process.env.IS_ELECTRON && window.ftElectron?.cancelVoiceTranslationExport) {
    await window.ftElectron.cancelVoiceTranslationExport()
  }
}

export function subscribeVoiceTranslationExportProgress(handler) {
  if (!process.env.IS_ELECTRON || !window.ftElectron?.onVoiceTranslationExportProgress) {
    return () => {}
  }

  return window.ftElectron.onVoiceTranslationExportProgress(handler)
}
export async function getVoiceTranslationAccountStatus() {
  if (!process.env.IS_ELECTRON || !window.ftElectron?.getVoiceTranslationAccountStatus) {
    return { available: false, hasToken: false }
  }

  return window.ftElectron.getVoiceTranslationAccountStatus()
}

/**
 * @param {string} token
 */
export async function saveVoiceTranslationAccountToken(token) {
  if (!process.env.IS_ELECTRON || !window.ftElectron?.saveVoiceTranslationAccountToken) {
    throw new VoiceTranslationClientError('unsupported', 'Voice translation is available only in the desktop app')
  }

  const response = await window.ftElectron.saveVoiceTranslationAccountToken(token)
  if (!response?.ok) {
    throw new VoiceTranslationClientError(response?.error?.code ?? 'invalid-token', 'Unable to save Yandex OAuth token')
  }
}

export async function clearVoiceTranslationAccountToken() {
  if (!process.env.IS_ELECTRON || !window.ftElectron?.clearVoiceTranslationAccountToken) {
    return false
  }

  return window.ftElectron.clearVoiceTranslationAccountToken()
}
