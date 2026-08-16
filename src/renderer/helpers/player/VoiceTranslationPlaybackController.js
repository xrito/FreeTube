const DRIFT_THRESHOLD_SECONDS = 0.25
const DRIFT_CHECK_INTERVAL_MS = 500
const DEFAULT_ORIGINAL_VOLUME = 15
const DEFAULT_TRANSLATION_VOLUME = 100

function normalizeVolume(volume, fallback) {
  const value = Number.isFinite(volume) ? volume : fallback
  return Math.min(Math.max(value, 0), 100) / 100
}

export class VoiceTranslationPlaybackController {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {() => void} onAudioError
   * @param {{ originalVolume?: number, translationVolume?: number }} [volumes]
   */
  constructor(videoElement, onAudioError, volumes = {}) {
    this.videoElement = videoElement
    this.onAudioError = onAudioError
    this.audioElement = new Audio()
    this.audioElement.preload = 'auto'
    this.originalVolume = normalizeVolume(volumes.originalVolume, DEFAULT_ORIGINAL_VOLUME)
    this.translationVolume = normalizeVolume(volumes.translationVolume, DEFAULT_TRANSLATION_VOLUME)
    this.audioElement.volume = this.translationVolume
    this.originalVideoVolume = null
    this.originalVideoMuted = null
    this.driftCheckInterval = null

    this.handleVideoPlay = this.handleVideoPlay.bind(this)
    this.handleVideoPause = this.handleVideoPause.bind(this)
    this.handleVideoSeek = this.handleVideoSeek.bind(this)
    this.handleVideoRateChange = this.handleVideoRateChange.bind(this)
    this.handleVideoEnded = this.handleVideoEnded.bind(this)
    this.handleAudioError = this.handleAudioError.bind(this)
  }

  /**
   * @param {string} audioUrl
   */
  async enable(audioUrl) {
    if (typeof audioUrl !== 'string' || audioUrl.length === 0) {
      throw new TypeError('A voice translation audio URL is required')
    }

    this.saveAndLowerOriginalVolume()
    this.addListeners()
    this.audioElement.src = audioUrl
    this.audioElement.playbackRate = this.videoElement.playbackRate
    this.audioElement.load()
    this.syncCurrentTime(true)
    this.startDriftCheck()

    if (!this.videoElement.paused && !await this.playAudio()) {
      throw new Error('Voice translation audio could not start')
    }
  }

  disable() {
    this.stopDriftCheck()
    this.removeListeners()
    this.audioElement.pause()
    this.audioElement.removeAttribute('src')
    this.audioElement.load()
    this.restoreOriginalVolume()
  }

  /**
   * @param {number} originalVolume
   * @param {number} translationVolume
   */
  setVolumes(originalVolume, translationVolume) {
    this.originalVolume = normalizeVolume(originalVolume, DEFAULT_ORIGINAL_VOLUME)
    this.translationVolume = normalizeVolume(translationVolume, DEFAULT_TRANSLATION_VOLUME)
    this.audioElement.volume = this.translationVolume

    if (this.originalVideoVolume !== null) {
      this.videoElement.volume = this.originalVolume
    }
  }

  handleVideoPlay() {
    this.syncCurrentTime(true)
    this.playAudio().catch(() => {})
  }

  handleVideoPause() {
    this.audioElement.pause()
  }

  handleVideoSeek() {
    this.syncCurrentTime(true)
  }

  handleVideoRateChange() {
    this.audioElement.playbackRate = this.videoElement.playbackRate
  }

  handleVideoEnded() {
    this.audioElement.pause()
  }

  handleAudioError() {
    this.onAudioError()
  }

  async playAudio() {
    try {
      await this.audioElement.play()
      return true
    } catch {
      this.onAudioError()
      return false
    }
  }

  /**
   * @param {boolean} force
   */
  syncCurrentTime(force) {
    const videoTime = this.videoElement.currentTime
    const audioTime = this.audioElement.currentTime

    if (!Number.isFinite(videoTime) || !Number.isFinite(audioTime)) {
      return
    }

    if (force || Math.abs(videoTime - audioTime) > DRIFT_THRESHOLD_SECONDS) {
      try {
        this.audioElement.currentTime = videoTime
      } catch {
        // The browser may reject a seek until remote media metadata is ready.
        // A later seek, play event or drift check will retry once it is ready.
      }
    }
  }

  startDriftCheck() {
    this.stopDriftCheck()
    this.driftCheckInterval = setInterval(() => {
      if (!this.videoElement.paused && !this.audioElement.paused) {
        this.syncCurrentTime(false)
      }
    }, DRIFT_CHECK_INTERVAL_MS)
  }

  stopDriftCheck() {
    if (this.driftCheckInterval !== null) {
      clearInterval(this.driftCheckInterval)
      this.driftCheckInterval = null
    }
  }

  addListeners() {
    this.videoElement.addEventListener('play', this.handleVideoPlay)
    this.videoElement.addEventListener('pause', this.handleVideoPause)
    this.videoElement.addEventListener('seeking', this.handleVideoSeek)
    this.videoElement.addEventListener('seeked', this.handleVideoSeek)
    this.videoElement.addEventListener('ratechange', this.handleVideoRateChange)
    this.videoElement.addEventListener('ended', this.handleVideoEnded)
    this.audioElement.addEventListener('error', this.handleAudioError)
  }

  removeListeners() {
    this.videoElement.removeEventListener('play', this.handleVideoPlay)
    this.videoElement.removeEventListener('pause', this.handleVideoPause)
    this.videoElement.removeEventListener('seeking', this.handleVideoSeek)
    this.videoElement.removeEventListener('seeked', this.handleVideoSeek)
    this.videoElement.removeEventListener('ratechange', this.handleVideoRateChange)
    this.videoElement.removeEventListener('ended', this.handleVideoEnded)
    this.audioElement.removeEventListener('error', this.handleAudioError)
  }

  saveAndLowerOriginalVolume() {
    if (this.originalVideoVolume !== null) {
      return
    }

    this.originalVideoVolume = this.videoElement.volume
    this.originalVideoMuted = this.videoElement.muted
    this.videoElement.volume = this.originalVolume
  }

  restoreOriginalVolume() {
    if (this.originalVideoVolume === null) {
      return
    }

    this.videoElement.volume = this.originalVideoVolume
    this.videoElement.muted = this.originalVideoMuted
    this.originalVideoVolume = null
    this.originalVideoMuted = null
  }
}
