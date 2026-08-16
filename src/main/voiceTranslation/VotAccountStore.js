import { safeStorage } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const TOKEN_FILE_NAME = 'vot-yandex-oauth-token.bin'
const MAX_TOKEN_LENGTH = 4096

export class VotAccountStore {
  /**
   * @param {string} userDataPath
   */
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, TOKEN_FILE_NAME)
  }

  async getStatus() {
    return {
      available: safeStorage.isEncryptionAvailable(),
      hasToken: Boolean(await this.getToken())
    }
  }

  async getToken() {
    if (!safeStorage.isEncryptionAvailable()) {
      return undefined
    }

    try {
      const encryptedValue = await readFile(this.filePath, 'utf8')
      const token = safeStorage.decryptString(Buffer.from(encryptedValue, 'base64')).trim()
      return isValidToken(token) ? token : undefined
    } catch {
      return undefined
    }
  }

  /**
   * @param {unknown} value
   */
  async saveToken(value) {
    const token = typeof value === 'string' ? value.trim() : ''

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encrypted credential storage is unavailable')
    }

    if (!isValidToken(token)) {
      throw new Error('Invalid Yandex OAuth token')
    }

    const encryptedValue = safeStorage.encryptString(token).toString('base64')
    await writeFile(this.filePath, encryptedValue, { encoding: 'utf8', mode: 0o600 })
  }

  async clearToken() {
    try {
      await unlink(this.filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

/**
 * @param {string} value
 */
function isValidToken(value) {
  return value.length >= 16 && value.length <= MAX_TOKEN_LENGTH && !/[\r\n]/.test(value)
}
