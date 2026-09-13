import { AppError } from './errors.js'

// Transport chunks are not SSE events. Keep incomplete lines and events until their delimiter.
export function createSseParser(onEvent) {
  let buffer = ''
  let lines = []
  function line(value) {
    if (value === '') {
      if (lines.length) { const data = lines.join('\n'); lines = []; onEvent(data) }
    } else if (value.startsWith('data:')) {
      lines.push(value.slice(5).replace(/^ /, ''))
    }
  }
  return {
    push(chunk) {
      buffer += chunk
      if (buffer.length > 1_000_000) throw new AppError('stream_invalid', '模型响应格式异常，请重试。')
      let start = 0
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i]
        if (char !== '\n' && char !== '\r') continue
        if (char === '\r' && i === buffer.length - 1) break
        line(buffer.slice(start, i))
        if (char === '\r' && buffer[i + 1] === '\n') i++
        start = i + 1
      }
      buffer = buffer.slice(start)
    },
    finish() {
      if (buffer === '\r') { line(''); buffer = '' }
      if (buffer.trim() || lines.length) throw new AppError('stream_incomplete', '生成过程中断，请重试。原音频已保留。')
    }
  }
}

export function createOmniStream(onText = () => {}) {
  let text = ''
  let stopped = false
  let done = false
  const parser = createSseParser(data => {
    if (done) throw new AppError('stream_invalid', '模型结束事件异常，请重试。')
    if (data === '[DONE]') { done = true; return }
    let event
    try { event = JSON.parse(data) } catch { throw new AppError('stream_invalid', '模型响应格式异常，请重试。') }
    if (!event || typeof event !== 'object' || event.error) throw new AppError('api_failed', '模型处理失败，请稍后重试。')
    if (!Array.isArray(event.choices)) throw new AppError('stream_invalid', '模型响应格式异常，请重试。')
    for (const choice of event.choices) {
      if (choice.index !== undefined && choice.index !== 0) continue
      const content = choice.delta?.content
      if (content != null && typeof content !== 'string') throw new AppError('stream_invalid', '模型响应格式异常，请重试。')
      if (content) {
        if (stopped) throw new AppError('stream_invalid', '模型结束事件异常，请重试。')
        text += content
        if (text.length > 120_000) throw new AppError('stream_invalid', '纪要内容过长，请重试。')
        onText(text)
      }
      if (choice.finish_reason != null) {
        if (choice.finish_reason !== 'stop') throw new AppError('stream_incomplete', '模型输出未完整结束，请重试。')
        stopped = true
      }
    }
  })
  return {
    push: chunk => parser.push(chunk),
    finish() {
      parser.finish()
      if (!done || !stopped || !text.trim()) throw new AppError('stream_incomplete', '生成过程中断或结果为空，请重试。原音频已保留。')
      return text
    }
  }
}
