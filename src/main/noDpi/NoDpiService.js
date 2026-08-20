import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import treeKill from '@magda/tree-kill'

const HOST = '127.0.0.1'
const MIN_EXECUTABLE_SIZE = 1024 * 1024
const START_TIMEOUT_MS = 8000

export class NoDpiError extends Error {
  /**
   * @param {'unsupported-platform'|'dependency-unavailable'|'start-failed'|'startup-timeout'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'NoDpiError'
    this.code = code
  }
}

export class NoDpiService {
  /**
   * @param {boolean} isPackaged
   * @param {{ onUnexpectedExit?: (details: { proxyUrl?: string, exitCode: number | null }) => void }} options
   */
  constructor(isPackaged, { onUnexpectedExit = () => {} } = {}) {
    this.resourceDirectory = isPackaged
      ? path.join(process.resourcesPath, 'nodpi')
      : path.join(process.cwd(), '.cache', 'freetube', 'nodpi')
    this.onUnexpectedExit = onUnexpectedExit
    this.child = null
    this.proxyUrl = undefined
    this.startPromise = null
    this.stopRequested = false
    this.lastErrorCode = undefined
  }

  getProxyUrl() {
    return this.proxyUrl
  }

  async getStatus() {
    return {
      available: await this.#dependenciesAvailable(),
      enabled: Boolean(this.child && this.proxyUrl),
      version: '2.2',
      errorCode: this.lastErrorCode,
    }
  }

  async start() {
    if (this.startPromise) return this.startPromise
    if (this.child && this.proxyUrl) return this.getStatus()

    this.startPromise = this.#start()
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async #start() {
    if (process.platform !== 'win32') {
      throw new NoDpiError('unsupported-platform', 'NoDPI is available only on Windows')
    }

    const executablePath = path.join(this.resourceDirectory, 'nodpi.exe')
    const blacklistPath = path.join(this.resourceDirectory, 'blacklist.txt')
    await validateDependency(executablePath, MIN_EXECUTABLE_SIZE)
    await validateDependency(blacklistPath, 1)

    const port = await findAvailablePort()
    const child = spawn(executablePath, [
      '--host', HOST,
      '--port', String(port),
      '--blacklist', blacklistPath,
      '--fragment-method', 'sni',
      '--domain-matching', 'strict',
      '--quiet',
    ], {
      cwd: this.resourceDirectory,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })

    this.child = child
    this.stopRequested = false
    let stderr = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', chunk => {
      if (stderr.length < 2000) stderr += chunk
    })

    try {
      await waitForProxy(child, port, () => stderr)
    } catch (error) {
      this.lastErrorCode = error instanceof NoDpiError ? error.code : 'start-failed'
      await terminateChild(child)
      if (this.child === child) this.child = null
      throw error
    }

    this.proxyUrl = `http://${HOST}:${port}`
    this.lastErrorCode = undefined
    child.once('close', (exitCode) => {
      if (this.child !== child) return

      const previousProxyUrl = this.proxyUrl
      this.child = null
      this.proxyUrl = undefined
      if (!this.stopRequested) {
        this.lastErrorCode = 'unexpected-exit'
        this.onUnexpectedExit({ proxyUrl: previousProxyUrl, exitCode })
      }
    })

    if (child.exitCode !== null) {
      this.child = null
      this.proxyUrl = undefined
      this.lastErrorCode = 'start-failed'
      throw new NoDpiError('start-failed', 'NoDPI exited during startup')
    }

    return this.getStatus()
  }

  async stop() {
    if (this.startPromise) {
      await this.startPromise.catch(() => {})
    }

    const child = this.child
    const previousProxyUrl = this.proxyUrl
    if (!child) return previousProxyUrl

    this.stopRequested = true
    await terminateChild(child)
    if (this.child === child) {
      this.child = null
      this.proxyUrl = undefined
    }
    this.stopRequested = false
    return previousProxyUrl
  }

  async #dependenciesAvailable() {
    if (process.platform !== 'win32') return false

    try {
      await validateDependency(path.join(this.resourceDirectory, 'nodpi.exe'), MIN_EXECUTABLE_SIZE)
      await validateDependency(path.join(this.resourceDirectory, 'blacklist.txt'), 1)
      return true
    } catch {
      return false
    }
  }
}

async function validateDependency(filePath, minimumSize) {
  try {
    const stats = await fs.stat(filePath)
    if (stats.isFile() && stats.size >= minimumSize) return
  } catch {
    // Convert filesystem details to a stable application error below.
  }

  throw new NoDpiError('dependency-unavailable', 'The NoDPI dependency is unavailable')
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => {
        if (error || port === 0) {
          reject(error ?? new Error('Unable to allocate a local port'))
        } else {
          resolve(port)
        }
      })
    })
  })
}

function waitForProxy(child, port, getStderr) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + START_TIMEOUT_MS
    let settled = false
    let retryTimer
    let socket

    const cleanup = () => {
      if (retryTimer) clearTimeout(retryTimer)
      socket?.destroy()
      child.removeListener('error', onError)
      child.removeListener('close', onClose)
    }
    const finish = (callback) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onError = () => finish(() => reject(new NoDpiError('start-failed', 'Unable to start NoDPI')))
    const onClose = () => {
      const details = getStderr().trim().slice(-300)
      finish(() => reject(new NoDpiError('start-failed', details || 'NoDPI exited during startup')))
    }
    const tryConnect = () => {
      if (Date.now() >= deadline) {
        finish(() => reject(new NoDpiError('startup-timeout', 'NoDPI did not become ready in time')))
        return
      }

      socket = net.createConnection({ host: HOST, port })
      socket.once('connect', () => finish(resolve))
      socket.once('error', () => {
        socket?.destroy()
        retryTimer = setTimeout(tryConnect, 100)
      })
    }

    child.once('error', onError)
    child.once('close', onClose)
    tryConnect()
  })
}

function terminateChild(child) {
  return new Promise(resolve => {
    if (child.exitCode !== null || !child.pid) {
      resolve()
      return
    }

    const timeout = setTimeout(() => {
      child.kill()
      resolve()
    }, 2500)
    treeKill(child.pid, () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}
