import { AppError } from '../core/errors.js'
import { MAX_RECORD_MS } from '../core/audio-size.js'
import { requireAndroid } from './native.js'
import { audioDirectory, persistRecording } from './audio-files.js'

export function createRecorder({ onState, onSaved, onFailure, canStart = () => true },
  { getPlatform = requireAndroid, getDirectory = audioDirectory, saveAudio = persistRecording } = {}) {
  let recorder = null
  let infoListener = null
  let errorListener = null
  let timer = null
  let active = null
  let stopPromise = null
  let phase = 'idle'
  function setPhase(value) { phase = value; onState(value, active?.startedAt || 0) }
  function release() {
    clearTimeout(timer)
    timer = null
    if (recorder) { try { recorder.release() } catch {} }
    recorder = null
    infoListener = null
    errorListener = null
  }
  function permission(platform) {
    return new Promise((resolve, reject) => platform.android.requestPermissions(['android.permission.RECORD_AUDIO'], result => {
      if (result.granted?.includes('android.permission.RECORD_AUDIO')) resolve()
      else reject(new AppError('permission', result.deniedAlways?.length ? '麦克风权限已关闭，请在系统设置中允许后重试。' : '需要麦克风权限才能录音。'))
    }, () => reject(new AppError('permission', '麦克风权限申请失败，请重试。'))))
  }
  async function finish(nativeStopped = false, interrupted = false) {
    if (stopPromise) return stopPromise
    if (phase !== 'recording') return
    setPhase('saving')
    clearTimeout(timer)
    stopPromise = (async () => {
      try {
        if (!nativeStopped) recorder.stop()
        release()
        const audio = await saveAudio(active.id, active.tempPath)
        await onSaved({ id: active.id, createdAt: active.createdAt, customerName: active.customerName,
          ...audio, status: 'saved', failure: '', result: null }, interrupted)
      } catch (error) {
        onFailure(error instanceof AppError ? error : new AppError('record_failed', '录音未能正常结束，临时文件已保留；重开应用后会尝试恢复，请先回放确认。'))
      } finally {
        release()
        active = null
        stopPromise = null
        setPhase('idle')
      }
    })()
    return stopPromise
  }
  return {
    get phase() { return phase },
    async start(customerName) {
      if (phase !== 'idle') throw new AppError('busy', '录音正在处理中，请稍候。')
      const platform = getPlatform()
      setPhase('starting')
      try {
        await permission(platform)
        const directory = await getDirectory()
        if (!canStart()) throw new AppError('background', '应用已进入后台，返回后请重新开始录音。')
        const now = Date.now()
        const id = `meeting-${now}-${Math.random().toString(36).slice(2, 10)}`
        const tempPath = directory.toLocalURL() + `${id}.recording.aac`
        active = { id, createdAt: now, customerName, tempPath, startedAt: 0 }
        const Recorder = platform.android.importClass('android.media.MediaRecorder')
        const Build = platform.android.importClass('android.os.Build$VERSION')
        recorder = Number(Build.SDK_INT) >= 31 ? new Recorder(platform.android.runtimeMainActivity()) : new Recorder()
        recorder.setAudioSource(1) // MIC
        recorder.setOutputFormat(6) // AAC_ADTS
        recorder.setAudioEncoder(3) // AAC
        recorder.setAudioChannels(1)
        recorder.setAudioSamplingRate(16000)
        recorder.setAudioEncodingBitRate(24000)
        recorder.setOutputFile(platform.io.convertLocalFileSystemURL(tempPath))
        // Native safety limit remains effective if the JS clock is delayed.
        recorder.setMaxDuration(MAX_RECORD_MS + 1000)
        infoListener = platform.android.implements('android.media.MediaRecorder$OnInfoListener', {
          onInfo: (_recorder, what) => { if (Number(what) === 800) setTimeout(() => finish(true), 200) }
        })
        errorListener = platform.android.implements('android.media.MediaRecorder$OnErrorListener', {
          onError: () => {
            if (phase !== 'recording') return
            release(); active = null; setPhase('idle')
            onFailure(new AppError('record_failed', '系统中断了录音，已保留临时文件；重新打开应用后将尝试恢复。'))
          }
        })
        recorder.setOnInfoListener(infoListener)
        recorder.setOnErrorListener(errorListener)
        recorder.prepare()
        recorder.start()
        active.startedAt = Date.now()
        setPhase('recording')
        timer = setTimeout(() => finish(), MAX_RECORD_MS)
      } catch (error) {
        release(); active = null; setPhase('idle')
        throw error instanceof AppError ? error : new AppError('record_failed', '无法开始录音，请检查麦克风和模拟器音频设置。')
      }
    },
    stop: () => finish(),
    stopOnHide: () => phase === 'recording' ? finish(false, true) : Promise.resolve()
  }
}
