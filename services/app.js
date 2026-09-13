import { reactive } from 'vue'
import { createRecords } from '../core/records.js'
import { createGeneration } from '../core/generation.js'
import { AppError, friendlyError } from '../core/errors.js'
import { createRecorder } from './recorder.android.js'
import { findUnindexedAudio } from './audio-files.js'
import { getNetworkType } from './native.js'
import { prepareRequest, requestOmni, validateConfig } from './omni.js'

const STORAGE_KEY = 'huiyi.records.v1'
let config = { key: '', workspaceId: '' }
let initialized = false
let recoveryDone = false
let recoveryBusy = false
let foreground = true
export const view = reactive({ records: [], phase: 'idle', startedAt: 0, activeId: '', partialText: '',
  configured: false, notice: '', ready: false })
const records = createRecords({ read: () => uni.getStorageSync(STORAGE_KEY), write: value => uni.setStorageSync(STORAGE_KEY, value) },
  value => { view.records = value })
const generation = createGeneration({ records, prepare: prepareRequest, request: requestOmni,
  onActive: id => { view.activeId = id }, onText: (_id, value) => { view.partialText = value } })

const recorder = createRecorder({
  canStart: () => foreground,
  onState: (phase, time) => { view.phase = phase; view.startedAt = time },
  onFailure: error => { view.notice = friendlyError(error) },
  onSaved: async (record, interrupted) => {
    records.add(record)
    view.notice = interrupted ? '已停止并保存录音；返回后可手动生成纪要。' : '录音已保存。'
    // Do not keep the recorder's save operation open while waiting for the model.
    if (!interrupted && foreground && view.configured && !view.activeId) {
      const network = await getNetworkType()
      if (network !== 'none' && foreground) void generate(record.id).catch(error => { view.notice = friendlyError(error) })
    }
  }
})

export async function initialize() {
  if (!initialized) {
    try { records.load(); initialized = true; view.ready = true }
    catch (error) { view.notice = friendlyError(error, '历史记录读取失败，请重新打开应用。'); return }
  }
  if (!recoveryDone && !recoveryBusy && typeof plus !== 'undefined' && plus.os.name === 'Android') {
    recoveryBusy = true
    try {
      const { recovered, skipped } = await findUnindexedAudio(new Set(records.list().map(item => item.id)))
      for (const record of recovered) records.add(record)
      if (recovered.length) view.notice = '已找回此前保存或中断的音频，请回放确认。'
      if (skipped) view.notice = '部分临时录音无法读取，文件仍保留；其他录音可正常使用。'
      recoveryDone = true
    } catch (error) { view.notice = friendlyError(error, '部分录音未能恢复，重新打开应用后会再次尝试。') }
    finally { recoveryBusy = false }
  }
}
export function updateAudioDuration(id, milliseconds) {
  const record = records.get(id)
  if (record && !record.durationMs && Number.isFinite(milliseconds) && milliseconds > 0) {
    records.update(id, { durationMs: Math.round(milliseconds) })
  }
}
export function getConfig() { return { ...config } }
export function saveConfig(key, workspaceId) { config = validateConfig(key, workspaceId); view.configured = true }
export function clearConfig() { config = { key: '', workspaceId: '' }; view.configured = false }
export async function startRecording(customerName) {
  if (!view.ready) throw new AppError('initializing', '历史记录尚未就绪，请重新打开应用。')
  if (view.activeId) throw new AppError('busy', '请等待当前纪要生成完成。')
  view.notice = ''
  await recorder.start(customerName.trim())
}
export const stopRecording = () => recorder.stop()
export async function generate(id) {
  if (view.phase === 'recording' || view.phase === 'starting') throw new AppError('busy', '请先结束录音。')
  const snapshot = { ...config }
  if (!snapshot.key || !snapshot.workspaceId) throw new AppError('config_missing', '请先在设置中填写 API Key 和 Workspace ID。')
  if (await getNetworkType() === 'none') throw new AppError('offline', '当前未联网，音频已保存，联网后再生成。')
  if (view.phase === 'recording' || view.phase === 'starting') throw new AppError('busy', '请先结束录音。')
  return generation.run(id, snapshot)
}
export function onAppHide() { foreground = false; void recorder.stopOnHide() }
export function onAppShow() { foreground = true; void initialize() }
