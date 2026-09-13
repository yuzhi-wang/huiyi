import { AppError } from '../core/errors.js'
import { assertAudioSize, extractBase64 } from '../core/audio-size.js'
import { requireAndroid } from './native.js'
import { inspectAdts } from '../core/adts.js'

export function resolveEntry(path) {
  const platform = requireAndroid()
  return new Promise((resolve, reject) => platform.io.resolveLocalFileSystemURL(path, resolve,
    () => reject(new AppError('missing_audio', '找不到音频文件，请检查应用数据是否被清除。'))))
}

export async function audioDirectory() {
  const root = await resolveEntry('_doc/')
  return new Promise((resolve, reject) => root.getDirectory('meetings', { create: true }, resolve,
    () => reject(new AppError('storage', '无法创建录音目录，请检查存储空间。'))))
}

export async function fileInfo(path) {
  const entry = await resolveEntry(path)
  const file = await new Promise((resolve, reject) => entry.file(resolve,
    () => reject(new AppError('read_audio', '无法读取音频文件，原路径已保留。'))))
  if (!file.size) throw new AppError('empty_audio', '录音文件为空，请检查麦克风后重新录音。')
  return { entry, file, sizeBytes: file.size }
}

export function mediaDuration(path) {
  const platform = requireAndroid()
  let metadata
  try {
    const Retriever = platform.android.importClass('android.media.MediaMetadataRetriever')
    metadata = new Retriever()
    metadata.setDataSource(platform.io.convertLocalFileSystemURL(path))
    const value = Number(metadata.extractMetadata(9)) // METADATA_KEY_DURATION
    return Number.isFinite(value) && value > 0 ? value : null
  } catch { return null }
  finally { try { metadata?.release() } catch {} }
}

export async function persistRecording(id, tempPath) {
  const { entry, sizeBytes } = await fileInfo(tempPath)
  const directory = await audioDirectory()
  const finalEntry = await new Promise((resolve, reject) => entry.moveTo(directory, `${id}.aac`, resolve,
    () => reject(new AppError('save_audio', '录音保存未完成，临时文件仍在本机，请释放存储空间后重试。'))))
  const audioPath = finalEntry.toLocalURL()
  return { audioPath, sizeBytes, durationMs: await actualDuration(audioPath), format: 'aac' }
}

export async function readAudioBase64(path) {
  const { file, sizeBytes } = await fileInfo(path)
  assertAudioSize(sizeBytes)
  return readBase64File(file, sizeBytes)
}

function readBase64File(file, sizeBytes) {
  return new Promise((resolve, reject) => {
    const reader = new plus.io.FileReader()
    let settled = false
    const finish = (error, data) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reader.onloadend = null
      reader.onerror = null
      error ? reject(error) : resolve(data)
    }
    const timer = setTimeout(() => { finish(new AppError('read_audio', '音频读取超时，请重试。')); try { reader.abort() } catch {} }, 60000)
    reader.onerror = () => finish(new AppError('read_audio', '无法读取完整音频，请重试。'))
    reader.onloadend = () => {
      try { finish(null, extractBase64(reader.result, sizeBytes, false)) } catch (error) { finish(error) }
    }
    try { reader.readAsDataURL(file) } catch { finish(new AppError('read_audio', '无法读取音频，请重试。')) }
  })
}

async function actualDuration(path) {
  const nativeDuration = mediaDuration(path)
  if (nativeDuration) return nativeDuration
  try {
    const { file, sizeBytes } = await fileInfo(path)
    // A normal 30-minute recording is about 5.5 MB. Bound corrupt-file reads.
    if (sizeBytes > 32000000) return null
    return inspectAdts(await readBase64File(file, sizeBytes)).durationMs
  } catch { return null }
}

// Recover audio saved before a metadata write was interrupted; never overwrite an existing row.
export async function findUnindexedAudio(knownIds) {
  const directory = await audioDirectory()
  const reader = directory.createReader()
  const entries = []
  const seen = new Set()
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    const fresh = batch.filter(entry => !seen.has(entry.name))
    if (!fresh.length) break
    for (const entry of fresh) { seen.add(entry.name); entries.push(entry) }
  }
  const recovered = []
  let skipped = 0
  for (const entry of entries) {
    if (!entry.isFile || !/^meeting-\d+-[a-z0-9]+(?:\.recording)?\.aac$/.test(entry.name)) continue
    const id = entry.name.replace(/(?:\.recording)?\.aac$/, '')
    if (knownIds.has(id)) continue
    try {
      const interrupted = entry.name.endsWith('.recording.aac')
      const { sizeBytes } = await fileInfo(entry.toLocalURL())
      const durationMs = await actualDuration(entry.toLocalURL())
      if (interrupted && !durationMs) { skipped++; continue }
      recovered.push({ id, createdAt: Number(id.split('-')[1]), customerName: '', audioPath: entry.toLocalURL(),
        sizeBytes, durationMs, format: 'aac', status: interrupted ? 'failed' : 'saved',
        failure: interrupted ? '已找回中断的录音，请先回放确认完整性，再手动生成。' : '', result: null })
      knownIds.add(id)
    } catch { skipped++ }
  }
  return { recovered, skipped }
}
