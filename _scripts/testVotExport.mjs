import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

import { createVoiceTranslationMixFilter, createYouTubeAccessArguments, createYouTubeFormatSelector } from '../src/main/videoExport/VideoExportService.js'

const temporaryDirectory = await fs.mkdtemp(path.join(tmpdir(), `freetube-vot-export-test-${randomUUID()}-`))
const sourcePath = path.join(temporaryDirectory, 'source.mkv')
const translationPath = path.join(temporaryDirectory, 'translation.opus')
const outputPath = path.join(temporaryDirectory, 'output.mkv')

try {
  const filter = createVoiceTranslationMixFilter(15, 100, true)
  if (!filter.includes('volume=0.15') || !filter.includes('volume=1') || !filter.includes('amix=inputs=2') || !filter.includes('alimiter=limit=0.95:level=false')) {
    throw new Error(`Unexpected audio mix filter: ${filter}`)
  }

  if (createYouTubeFormatSelector('1080') !== 'bv*[height<=1080]+ba/b[height<=1080]' || createYouTubeFormatSelector('best') !== 'bv*+ba/b' || createYouTubeFormatSelector('invalid') !== 'bv*[height<=1080]+ba/b[height<=1080]') {
    throw new Error('Unexpected YouTube video quality selector')
  }

  const accessArguments = createYouTubeAccessArguments('C:\\Program Files\\FreeTube VOT\\resources\\node\\node.exe')
  const expectedAccessArguments = [
    '--remote-components', 'ejs:github',
    '--js-runtimes', 'node:C:\\Program Files\\FreeTube VOT\\resources\\node\\node.exe',
    '--extractor-args', 'youtube:player_client=web_embedded'
  ]
  if (JSON.stringify(accessArguments) !== JSON.stringify(expectedAccessArguments)) {
    throw new Error('Unexpected YouTube EJS access arguments')
  }

  await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '1', '-ac', '2', '-c:v', 'mpeg4', '-c:a', 'libopus', sourcePath
  ])
  await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
    '-t', '1', '-c:a', 'libopus', translationPath
  ])
  await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', sourcePath,
    '-i', translationPath,
    '-filter_complex', filter,
    '-map', '0:v:0',
    '-map', '[mixed]',
    '-c:v', 'copy',
    '-c:a', 'libopus',
    '-metadata:s:a:0', 'language=rus',
    '-metadata:s:a:0', 'title=Original audio with Russian voice translation',
    '-disposition:a:0', 'default',
    outputPath
  ])

  const streamReport = await runFfmpeg(['-hide_banner', '-i', outputPath], { allowFailure: true })
  const audioStreams = streamReport.match(/^\s*Stream #0:\d+(?:\([^)]*\))?: Audio:/gm) ?? []
  const hasVideo = /^\s*Stream #0:\d+(?:\([^)]*\))?: Video:/m.test(streamReport)
  const hasRussianMix = /Stream #0:\d+\(rus\): Audio: .*stereo.*\(default\)/.test(streamReport)

  if (!hasVideo || audioStreams.length !== 1 || !hasRussianMix) {
    throw new Error(`Unexpected exported MKV streams:\n${streamReport}`)
  }

  console.log('VOT export smoke test passed: one mixed Russian stereo audio stream')
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}

function runFfmpeg(args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let output = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0 || allowFailure) {
        resolve(output)
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${output.slice(-1000)}`))
      }
    })
  })
}
