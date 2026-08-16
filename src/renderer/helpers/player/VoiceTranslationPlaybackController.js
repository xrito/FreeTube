const DRIFT_THRESHOLD_SECONDS = 0.25
const DRIFT_CHECK_INTERVAL_MS = 500

export class VoiceTranslationPlaybackController {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {() => void} onAudioError
   */
  constructor(videoElement, onAudioError) {
    this.videoElement = videoElement
    this.onAudioError = onAudioError
    this.audioElement = new Audio()
    this.audioElement.preload = 'auto'
    this.audioElement.volume = 1
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
    this.videoElement.volume = 0.15
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
