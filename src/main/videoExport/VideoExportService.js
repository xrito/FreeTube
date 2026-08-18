import { spawn } from 'node:child_process'
import treeKill from '@magda/tree-kill'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

const MIN_BINARY_SIZE = 1024 * 1024

export class VideoExportError extends Error {
  /**
   * @param {'invalid-request'|'downloader-unavailable'|'source-download-failed'|'ffmpeg-unavailable'|'cancelled'|'export-failed'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'VideoExportError'
    this.code = code
  }
}

export class VideoExportService {
  /**
   * @param {import('electron').Dialog} dialog
   * @param {boolean} isPackaged
   */
  constructor(dialog, isPackaged) {
    this.dialog = dialog
    this.isPackaged = isPackaged
  }

  /**
   * Downloads the public YouTube source separately from the active FreeTube
   * player. The player can use SABR, which FFmpeg cannot consume directly.
   *
   * @param {{ videoId: string, translationAudioUrl: string, title: string, originalVolume: number, translationVolume: number }} request
   * @param {AbortSignal} signal
   * @returns {Promise<{ cancelled: boolean, filePath?: string }>}
   */
  async exportWithTranslation(request, signal, onProgress = () => {}) {
    const normalizedRequest = normalizeRequest(request)
    const result = await this.dialog.showSaveDialog({
      title: 'Save video with Russian voice translation',
      defaultPath: `${sanitizeFilename(normalizedRequest.title)}.mkv`,
      filters: [{ name: 'Matroska video', extensions: ['mkv'] }]
    })

    if (result.canceled || !result.filePath) {
      return { cancelled: true }
    }

    onProgress({ videoId: normalizedRequest.videoId, stage: 'downloading-source' })
    const [ffmpegPath, ytDlpPath] = await Promise.all([
      getFfmpegPath(this.isPackaged),
      getYtDlpPath(this.isPackaged)
    ])
    const tempDirectory = await fs.mkdtemp(path.join(tmpdir(), 'freetube-vot-export-'))
    const partialFilePath = `${result.filePath}.partial-${randomUUID()}.mkv`

    try {
      const sourcePath = await downloadYouTubeSource({
        ytDlpPath,
        ffmpegPath,
        videoId: normalizedRequest.videoId,
        tempDirectory,
        signal,
        onProgress
      })
      onProgress({ videoId: normalizedRequest.videoId, stage: 'adding-translation' })
      await muxVoiceTranslation({
        ffmpegPath,
        sourcePath,
        translationAudioUrl: normalizedRequest.translationAudioUrl,
        originalVolume: normalizedRequest.originalVolume,
        translationVolume: normalizedRequest.translationVolume,
        outputPath: partialFilePath,
        signal
      })
      onProgress({ videoId: normalizedRequest.videoId, stage: 'finishing' })
      await fs.rename(partialFilePath, result.filePath)
      return { cancelled: false, filePath: result.filePath }
    } catch (error) {
      await fs.rm(partialFilePath, { force: true }).catch(() => {})
      throw error
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function getFfmpegPath(isPackaged) {
  const ffmpegPath = isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')

  return getUsableBinary(ffmpegPath, 'ffmpeg-unavailable', 'FFmpeg is unavailable in this build')
}

async function getYtDlpPath(isPackaged) {
  const ytDlpPath = isPackaged
    ? path.join(process.resourcesPath, 'yt-dlp', 'yt-dlp.exe')
    : path.join(process.cwd(), '.cache', 'freetube', 'yt-dlp', 'yt-dlp.exe')

  return getUsableBinary(ytDlpPath, 'downloader-unavailable', 'The YouTube downloader is unavailable in this build')
}

async function getUsableBinary(binaryPath, code, message) {
  try {
    const binaryStats = await fs.stat(binaryPath)
    if (binaryStats.size >= MIN_BINARY_SIZE) return binaryPath
  } catch {
    // Convert a missing executable to a user-safe error below.
  }

  throw new VideoExportError(code, message)
}

async function downloadYouTubeSource({ ytDlpPath, ffmpegPath, videoId, tempDirectory, signal, onProgress }) {
  const outputTemplate = path.join(tempDirectory, 'source.%(ext)s')
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

  await runProcess({
    executablePath: ytDlpPath,
    args: [
      '--no-playlist',
      '--no-part',
      '--newline',
      '--no-write-info-json',
      '--no-write-thumbnail',
      '--extractor-args', 'youtube:player_client=android',
      '--socket-timeout', '30',
      '--retries', '2',
      '--ffmpeg-location', path.dirname(ffmpegPath),
      '--format', 'bv*+ba/b',
      '--merge-output-format', 'mkv',
      '--remux-video', 'mkv',
      '--output', outputTemplate,
      youtubeUrl
    ],
    signal,
    failureCode: 'source-download-failed',
    processName: 'yt-dlp',
    onStdout: (line) => {
      const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
      if (match) onProgress({ videoId, stage: 'downloading-source', percent: Number(match[1]) })
    }
  })

  const entries = await fs.readdir(tempDirectory, { withFileTypes: true })
  const sourceEntry = entries.find((entry) => entry.isFile() && /^source\.(mkv|webm|mp4)$/i.test(entry.name))
  if (!sourceEntry) {
    throw new VideoExportError('source-download-failed', 'yt-dlp finished without producing a source video')
  }

  return path.join(tempDirectory, sourceEntry.name)
}

function muxVoiceTranslation({ ffmpegPath, sourcePath, translationAudioUrl, originalVolume, translationVolume, outputPath, signal }) {
  return runProcess({
    executablePath: ffmpegPath,
    args: [
      '-y',
      '-i', sourcePath,
      '-i', translationAudioUrl,
      '-filter_complex',
      `[0:a:0]volume=${originalVolume / 100}[original];[1:a:0]volume=${translationVolume / 100}[translation];[original][translation]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]`,
      '-map', '0:v:0',
      '-map', '[mixed]',
      '-c:v', 'copy',
      '-c:a', 'libopus',
      '-metadata:s:a:0', 'language=rus',
      '-metadata:s:a:0', 'title=Original audio with Russian voice translation',
      '-disposition:a:0', 'default',
      outputPath
    ],
    signal,
    failureCode: 'export-failed',
    processName: 'FFmpeg'
  })
}

function runProcess({ executablePath, args, signal, failureCode, processName, onStdout }) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let settled = false

    if (signal.aborted) {
      reject(new VideoExportError('cancelled', 'Export cancelled'))
      return
    }

    const child = spawn(executablePath, args, { windowsHide: true })
    const settle = (callback) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => {
      if (child.pid) treeKill(child.pid)
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      for (const line of chunk.split(/\r?\n/)) onStdout?.(line)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk
    })
    signal.addEventListener('abort', abort, { once: true })
    child.on('error', () => settle(() => reject(new VideoExportError(failureCode, `Unable to start ${processName}`))))
    child.on('close', (code) => {
      if (signal.aborted) {
        settle(() => reject(new VideoExportError('cancelled', 'Export cancelled')))
      } else if (code === 0) {
        settle(resolve)
      } else {
        settle(() => reject(new VideoExportError(failureCode, sanitizeProcessError(stderr, processName))))
      }
    })
  })
}

function sanitizeProcessError(stderr, processName) {
  const lastLine = stderr.split(/\r?\n/).filter(Boolean).at(-1) ?? `${processName} could not save the video`
  return lastLine.replaceAll(/https?:\/\/\S+/g, '<media URL>').slice(0, 300)
}

function normalizeRequest(value) {
  if (!value || typeof value !== 'object') {
    throw new VideoExportError('invalid-request', 'Missing export request')
  }

  const request = /** @type {Record<string, unknown>} */ (value)
  const videoId = typeof request.videoId === 'string' ? request.videoId : ''
  const translationAudioUrl = typeof request.translationAudioUrl === 'string' ? request.translationAudioUrl : ''
  const title = typeof request.title === 'string' ? request.title : 'FreeTube video'
  const originalVolume = normalizeVolume(request.originalVolume)
  const translationVolume = normalizeVolume(request.translationVolume)

  if (!/^[\w-]{11}$/.test(videoId) || !translationAudioUrl.startsWith('https://')) {
    throw new VideoExportError('invalid-request', 'Invalid video export request')
  }

  return { videoId, translationAudioUrl, title, originalVolume, translationVolume }
}

function normalizeVolume(value) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return 100
  return Math.min(100, Math.max(0, numberValue))
}

function sanitizeFilename(value) {
  const sanitized = value.replaceAll(/[<>:"/\\|?*]/g, '_').trim()
  return sanitized.slice(0, 120) || 'FreeTube video'
}
