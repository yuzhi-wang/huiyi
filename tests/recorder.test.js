import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecorder } from '../services/recorder.android.js'

function fixture({ denied = false, stopFailure = false, foreground = true } = {}) {
  const calls = { start: 0, stop: 0, release: 0, saved: [], failures: [], fileWrites: 0 }
  class MediaRecorder {
    setAudioSource() {} setOutputFormat() {} setAudioEncoder() {} setAudioChannels() {}
    setAudioSamplingRate() {} setAudioEncodingBitRate() {} setOutputFile() {} setMaxDuration() {}
    setOnInfoListener() {} setOnErrorListener() {} prepare() {}
    start() { calls.start++ }
    stop() { calls.stop++; if (stopFailure) throw new Error('native-stop-failure') }
    release() { calls.release++ }
  }
  const platform = { io: { convertLocalFileSystemURL: path => path }, android: {
    requestPermissions: (_permissions, callback) => callback(denied ? { granted: [], deniedAlways: ['microphone'] } : { granted: ['android.permission.RECORD_AUDIO'] }),
    importClass: name => name.includes('Build') ? { SDK_INT: 35 } : MediaRecorder,
    runtimeMainActivity: () => ({}), implements: (_name, listener) => listener
  } }
  const recorder = createRecorder({ onState: () => {}, onSaved: async record => { calls.saved.push(record) },
    onFailure: error => calls.failures.push(error), canStart: () => foreground }, {
    getPlatform: () => platform, getDirectory: async () => ({ toLocalURL: () => '_doc/meetings/' }),
    saveAudio: async () => { calls.fileWrites++; await Promise.resolve(); return { audioPath: '_doc/final.aac', durationMs: 1024, sizeBytes: 4000, format: 'aac' } }
  })
  return { recorder, calls }
}

test('Repeated recording start/stop saves once and releases native resources', async () => {
  const { recorder, calls } = fixture()
  await recorder.start('示例客户')
  await assert.rejects(recorder.start('重复'), /请稍候/)
  await Promise.all([recorder.stop(), recorder.stop()])
  assert.equal(calls.start, 1); assert.equal(calls.stop, 1); assert.equal(calls.release, 1)
  assert.equal(calls.saved.length, 1); assert.equal(calls.saved[0].durationMs, 1024)
  assert.equal(recorder.phase, 'idle')
})

test('Permission denial or background during preparation never starts a recording', async () => {
  for (const options of [{ denied: true }, { foreground: false }]) {
    const { recorder, calls } = fixture(options)
    await assert.rejects(recorder.start(''))
    assert.equal(calls.start, 0); assert.equal(calls.fileWrites, 0); assert.equal(recorder.phase, 'idle')
  }
})

test('Native stop failure releases recorder without reporting a saved recording', async () => {
  const { recorder, calls } = fixture({ stopFailure: true })
  await recorder.start('')
  await recorder.stop()
  assert.equal(calls.saved.length, 0); assert.equal(calls.fileWrites, 0)
  assert.equal(calls.failures.length, 1); assert.equal(calls.release, 1)
  assert.equal(recorder.phase, 'idle')
})
