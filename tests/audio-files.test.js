import test from 'node:test'
import assert from 'node:assert/strict'
import { findUnindexedAudio } from '../services/audio-files.js'

test('Recovery tolerates repeated native directory batches, empty files and unfinished recordings', async () => {
  const previous = globalThis.plus
  let reads = 0
  const entries = ['meeting-1-a.aac', 'meeting-2-b.aac', 'meeting-3-c.aac', 'meeting-4-d.recording.aac'].map((name, index) => ({
    name, isFile: true, toLocalURL: () => '_doc/meetings/' + name,
    file: callback => callback({ size: index === 2 ? 0 : 4000 })
  }))
  const directory = { createReader: () => ({ readEntries: callback => { reads++; callback(entries) } }) }
  globalThis.plus = { os: { name: 'Android' }, io: {
    convertLocalFileSystemURL: value => value,
    resolveLocalFileSystemURL: (path, success) => success(path === '_doc/' ? { getDirectory: (_name, _options, cb) => cb(directory) } : entries.find(entry => entry.toLocalURL() === path))
  }, android: { importClass: () => class { setDataSource() {} extractMetadata() { return '1000' } release() {} } } }
  try {
    const { recovered, skipped } = await findUnindexedAudio(new Set(['meeting-1-a']))
    assert.equal(reads, 2)
    assert.equal(skipped, 1)
    assert.deepEqual(recovered.map(row => row.id), ['meeting-2-b', 'meeting-4-d'])
    assert.equal(recovered[1].status, 'failed')
    assert.equal(recovered[1].durationMs, 1000)
    assert.match(recovered[1].failure, /回放/)
    assert.match(recovered[1].audioPath, /recording\.aac$/)
  } finally { globalThis.plus = previous }
})
