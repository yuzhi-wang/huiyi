import { AppError } from '../core/errors.js'
import { assertRequestSize } from '../core/audio-size.js'
import { MEETING_PROMPT } from '../core/meeting-result.js'
import { createOmniStream } from '../core/sse.js'
import { readAudioBase64 } from './audio-files.js'
import { requireAndroid } from './native.js'

export function validateConfig(key, workspaceId) {
  key = key.trim()
  workspaceId = workspaceId.trim()
  if (!key || /\s/.test(key)) throw new AppError('config', '请输入有效的 API Key，不要包含空格或换行。')
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(workspaceId)) {
    throw new AppError('config', '请输入 Workspace ID 本身，不要填写网址。')
  }
  return { key, workspaceId }
}

export async function prepareRequest(record) {
  const base64 = await readAudioBase64(record.audioPath)
  const body = JSON.stringify({
    model: 'qwen3.5-omni-plus',
    messages: [{ role: 'user', content: [
      { type: 'input_audio', input_audio: { data: `data:;base64,${base64}`, format: record.format } },
      { type: 'text', text: MEETING_PROMPT }
    ] }],
    modalities: ['text'], stream: true, stream_options: { include_usage: true }
  })
  assertRequestSize(body)
  return body
}

function httpError(status) {
  const messages = {
    400: '音频或请求参数不被模型接受，请核对实际音频格式与配置。',
    401: 'API Key 无效，请在设置中检查北京地域 Key。',
    403: '当前 Key 没有调用权限，请检查业务空间与模型权限。',
    404: '未找到模型接口，请检查 Workspace ID 和模型可用性。',
    413: '音频请求超出服务限制，原音频已保留。',
    429: '调用受限或额度不足，请检查额度后稍后重试。'
  }
  return new AppError('http_error', messages[status] || (status >= 500 ? '模型服务暂时不可用，请稍后重试。' : '网络请求失败，请检查网络与业务空间配置。'))
}

export function requestOmni(body, config, onText, createXhr = () => new (requireAndroid().net.XMLHttpRequest)()) {
  return new Promise((resolve, reject) => {
    let xhr
    let consumed = 0
    let settled = false
    const stream = createOmniStream(onText)
    let timer
    function settle(error, result) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (xhr) {
        xhr.onreadystatechange = xhr.onprogress = xhr.onerror = xhr.ontimeout = xhr.onabort = null
        if (error) { try { xhr.abort() } catch {} }
      }
      body = ''
      xhr = null
      error ? reject(error) : resolve(result)
    }
    function receive() {
      if (settled || !xhr) return
      try {
        if (xhr.readyState < 3) return
        if (xhr.status !== 200) { settle(httpError(xhr.status)); return }
        const value = xhr.responseText || ''
        if (value.length < consumed || value.length > 2_000_000) throw new AppError('stream_invalid', '模型响应异常，请重试。')
        stream.push(value.slice(consumed))
        consumed = value.length
        if (xhr.readyState === 4) settle(null, stream.finish())
      } catch (error) { settle(error) }
    }
    try {
      const validated = validateConfig(config.key, config.workspaceId)
      xhr = createXhr()
      xhr.open('POST', `https://${validated.workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`)
      xhr.responseType = 'text'
      xhr.timeout = 600000
      xhr.setRequestHeader('Authorization', `Bearer ${validated.key}`)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.setRequestHeader('Accept', 'text/event-stream')
      xhr.onreadystatechange = receive
      xhr.onprogress = receive
      xhr.onerror = () => settle(new AppError('network', '网络中断，请检查网络后重试。原音频已保留。'))
      xhr.ontimeout = () => settle(new AppError('timeout', '生成超过 10 分钟，请稍后重试。'))
      xhr.onabort = () => settle(new AppError('aborted', '生成已中断，可以重新生成。'))
      timer = setTimeout(() => settle(new AppError('timeout', '生成超过 10 分钟，请稍后重试。')), 600000)
      xhr.send(body)
      body = ''
    } catch (error) { settle(error) }
  })
}
