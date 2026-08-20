import assert from 'node:assert/strict'

import { NoDpiService } from '../src/main/noDpi/NoDpiService.js'

if (process.platform !== 'win32') {
  console.log('NoDPI lifecycle test skipped: Windows only')
  process.exit(0)
}

const service = new NoDpiService(false)

try {
  const initialStatus = await service.getStatus()
  assert.equal(initialStatus.available, true)
  assert.equal(initialStatus.enabled, false)

  const startedStatus = await service.start()
  assert.equal(startedStatus.available, true)
  assert.equal(startedStatus.enabled, true)
  assert.match(service.getProxyUrl(), /^http:\/\/127\.0\.0\.1:\d+$/)

  const repeatedStartStatus = await service.start()
  assert.equal(repeatedStartStatus.enabled, true)

  await service.stop()
  const stoppedStatus = await service.getStatus()
  assert.equal(stoppedStatus.enabled, false)
  assert.equal(service.getProxyUrl(), undefined)

  console.log('NoDPI lifecycle test passed')
} finally {
  await service.stop()
}
