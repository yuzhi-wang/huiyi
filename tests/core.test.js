import test from 'node:test'
import assert from 'node:assert/strict'
import { base64Length, assertAudioSize, extractBase64, assertRequestSize, utf8Length } from '../core/audio-size.js'
import { parseMeetingResult } from '../core/meeting-result.js'
import { createSseParser, createOmniStream } from '../core/sse.js'
import { createRecords } from '../core/records.js'
import { createGeneration } from '../core/generation.js'
import { AppError } from '../core/errors.js'
import { requestOmni, validateConfig } from '../services/omni.js'
import { inspectAdts } from '../core/adts.js'

const result = { summary: '客户询问交期，尚未确认采购。', keyPoints: ['报价待确认'], todos: [] }
const raw = JSON.stringify(result)
const token = content => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`
const stop = 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
const usage = 'data: {"choices":[],"usage":{"total_tokens":42}}\n\n'
const complete = token(raw) + stop + usage + 'data: [DONE]\n\n'
const sample = () => ({ id: 'meeting-test', audioPath: '_doc/meetings/test.aac', status: 'saved', result: null })
const config = { key: 'test-only-placeholder', workspaceId: 'test-workspace' }

test('AAC duration is measured from complete frames, including truncated recording recovery', () => {
  // AAC LC, 16 kHz mono, 10-byte ADTS frame with three payload bytes.
  const frame = Buffer.from([0xff, 0xf1, 0x60, 0x40, 0x01, 0x5f, 0xfc, 1, 2, 3])
  const audio = Buffer.concat(Array.from({ length: 100 }, () => frame))
  assert.deepEqual(inspectAdts(audio.toString('base64')), { durationMs: 6400, incomplete: false })
  assert.deepEqual(inspectAdts(audio.subarray(0, -1).toString('base64')), { durationMs: 6336, incomplete: true })
  assert.throws(() => inspectAdts(Buffer.from('invalid').toString('base64')))
  assert.throws(() => inspectAdts(frame.subarray(0, 6).toString('base64')))
})

test('Base64 strict boundary, zero/invalid files and measured lengths', () => {
  assert.equal(base64Length(1), 4)
  assert.equal(assertAudioSize(7499997), 9999996)
  for (const value of [0, -1, NaN, Infinity, 1.5, 7499998, 7500000]) assert.throws(() => assertAudioSize(value))
  assert.equal(extractBase64('data:audio/aac;base64,YQ==', 1), 'YQ==')
  assert.throws(() => extractBase64('data:audio/aac;base64,YQ==', 4))
  assert.throws(() => extractBase64('data:audio/aac;base64,%%%=', 1))
  assert.equal(utf8Length('纪要🎤'), Buffer.byteLength('纪要🎤'))
  assertRequestSize('a'.repeat(9999999))
  assert.throws(() => assertRequestSize('a'.repeat(10000000)))
})

test('SSE parses every split point, Chinese, CRLF, comment and multiple data lines', () => {
  const wire = complete.replace(/\n/g, '\r\n')
  for (let cut = 0; cut <= wire.length; cut++) {
    const stream = createOmniStream()
    stream.push(wire.slice(0, cut)); stream.push(wire.slice(cut))
    assert.equal(stream.finish(), raw)
  }
  const stream = createOmniStream()
  for (const character of wire) stream.push(character)
  assert.equal(stream.finish(), raw)
  const events = []
  const parser = createSseParser(value => events.push(value))
  parser.push(': heartbeat\n\ndata: first\ndata: second\n\n')
  parser.finish()
  assert.deepEqual(events, ['first\nsecond'])
})

test('SSE requires stop AND DONE; rejects truncation, bad JSON and post-stop content', () => {
  for (const wire of [token(raw), token(raw) + stop, token(raw) + 'data: [DONE]\n\n',
    token(raw) + stop + 'data: [DONE]', token(raw) + 'data: {"choices":[{"finish_reason":"length"}]}\n\n',
    'data: not-json\n\n', 'data: {"error":{"message":"private-provider-error"}}\n\n',
    token(raw) + stop + token('unexpected') + 'data: [DONE]\n\n']) {
    assert.throws(() => { const stream = createOmniStream(); stream.push(wire); stream.finish() })
  }
})

test('Result validates null owner/date and empty todos; never repairs truncated or incomplete results', () => {
  assert.deepEqual(parseMeetingResult(raw), result)
  assert.deepEqual(parseMeetingResult('```json\n' + raw + '\n```'), result)
  const todoResult = { ...result, todos: [{ content: '确认报价', owner: null, dueDate: null }] }
  assert.deepEqual(parseMeetingResult(JSON.stringify(todoResult)), todoResult)
  for (const input of [raw.slice(0, -1), '{}', 'null', JSON.stringify({ ...result, summary: '' }),
    JSON.stringify({ ...result, keyPoints: [4] }), JSON.stringify({ ...result, todos: [{ content: '任务' }] })]) {
    assert.throws(() => parseMeetingResult(input))
  }
})

function repository(initial = [sample()]) {
  let disk = structuredClone(initial)
  let failWrites = false
  const records = createRecords({ read: () => structuredClone(disk), write: value => {
    if (failWrites) throw new Error('disk-full')
    disk = structuredClone(value)
  } })
  records.load()
  return { records, readDisk: () => disk, failWrites: value => { failWrites = value } }
}

test('Restart marks interrupted generation failed without discarding last result', () => {
  const { records, readDisk } = repository([{ ...sample(), status: 'generating', result }])
  assert.equal(records.get('meeting-test').status, 'failed')
  assert.deepEqual(readDisk()[0].result, result)
})

test('Corrupt storage is not overwritten', () => {
  let writes = 0
  const records = createRecords({ read: () => ({ bad: true }), write: () => { writes++ } })
  assert.throws(() => records.load())
  assert.equal(writes, 0)
})

test('Storage-full restart still presents interrupted generation as failed in memory', () => {
  let displayed
  const records = createRecords({ read: () => [{ ...sample(), status: 'generating', result }],
    write: () => { throw new Error('full') } }, value => { displayed = value })
  assert.throws(() => records.load())
  assert.equal(displayed[0].status, 'failed')
  assert.deepEqual(displayed[0].result, result)
})

test('Only one request; no success before full response; successful result persisted', async () => {
  const { records } = repository()
  let resolveResponse
  let calls = 0
  const gate = new Promise(resolve => { resolveResponse = resolve })
  const generation = createGeneration({ records, prepare: async () => 'body', request: () => { calls++; return gate } })
  const first = generation.run('meeting-test', config)
  await Promise.resolve()
  assert.equal(records.get('meeting-test').status, 'generating')
  await assert.rejects(generation.run('meeting-test', config), /已有/)
  assert.equal(calls, 1)
  resolveResponse(raw)
  await first
  assert.equal(records.get('meeting-test').status, 'succeeded')
  assert.deepEqual(records.get('meeting-test').result, result)
  assert.equal(generation.activeId, '')
})

test('Failed retry keeps audio and previous result; preflight failure sends no request', async () => {
  const { records } = repository([{ ...sample(), result }])
  let calls = 0
  const generation = createGeneration({ records,
    prepare: async () => { throw new AppError('too_large', '音频超限') }, request: () => { calls++; return raw } })
  await assert.rejects(generation.run('meeting-test', config), /超限/)
  assert.equal(calls, 0)
  assert.equal(records.get('meeting-test').status, 'failed')
  assert.equal(records.get('meeting-test').audioPath, sample().audioPath)
  assert.deepEqual(records.get('meeting-test').result, result)
})

test('Parse failure and persistence failure cannot be shown as success', async () => {
  for (const failSave of [false, true]) {
    const { records, failWrites } = repository([{ ...sample(), result }])
    const generation = createGeneration({ records, prepare: async () => 'body', request: async () => {
      if (failSave) failWrites(true)
      return failSave ? raw : raw.slice(0, -1)
    } })
    await assert.rejects(generation.run('meeting-test', config))
    assert.equal(records.get('meeting-test').status, 'failed')
    assert.deepEqual(records.get('meeting-test').result, result)
    assert.equal(generation.activeId, '')
  }
})

test('Key and Workspace ID cannot inject headers or replace endpoint', () => {
  assert.deepEqual(validateConfig(' test-key ', ' space-1 '), { key: 'test-key', workspaceId: 'space-1' })
  assert.throws(() => validateConfig('bad\nheader', 'space'))
  for (const id of ['https://example.com', 'a.b', '-abc', '', 'a/b']) assert.throws(() => validateConfig('test-key', id))
})

function fakeXhr() {
  return {
    readyState: 0, status: 0, responseText: '', headers: {}, aborted: false,
    open(method, url) { this.method = method; this.url = url; this.readyState = 1 },
    setRequestHeader(name, value) { this.headers[name] = value },
    send(body) { this.sent = body }, abort() { this.aborted = true },
    chunk(text, readyState = 3, status = 200) { this.responseText += text; this.readyState = readyState; this.status = status; this.onreadystatechange?.(); this.onprogress?.() }
  }
}

test('Native XHR cumulative callbacks are deduplicated and resolve only at HTTP completion', async () => {
  const xhr = fakeXhr()
  const previews = []
  let resolved = false
  const promise = requestOmni('body', config, text => previews.push(text), () => xhr).then(value => { resolved = true; return value })
  xhr.chunk(token(raw))
  assert.deepEqual(previews, [raw])
  xhr.chunk(stop + usage + 'data: [DONE]\n\n')
  await Promise.resolve()
  assert.equal(resolved, false)
  xhr.chunk('', 4)
  assert.equal(await promise, raw)
  assert.equal(xhr.method, 'POST')
  assert.match(xhr.url, /^https:\/\/test-workspace\.cn-beijing\.maas\.aliyuncs\.com\//)
})

test('XHR errors do not disclose raw response/credentials and interrupt incomplete HTTP success', async () => {
  const xhr = fakeXhr()
  const failure = requestOmni('body', config, () => {}, () => xhr)
  xhr.chunk('private-body-with-credential', 4, 401)
  await assert.rejects(failure, error => error.message.includes('Key 无效') && !error.message.includes('private-body'))
  assert.equal(xhr.aborted, true)
  const partial = fakeXhr()
  const incomplete = requestOmni('body', config, () => {}, () => partial)
  partial.chunk(token(raw), 4)
  await assert.rejects(incomplete, /中断/)
})
