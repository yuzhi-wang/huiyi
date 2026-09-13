import { AppError } from './errors.js'

export const INPUT_LIMIT = 10_000_000
export const MAX_RECORD_MS = 30 * 60 * 1000

export function base64Length(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new AppError('empty_audio', '音频为空或文件大小无效，请重新录音。')
  return 4 * Math.ceil(bytes / 3)
}

export function assertAudioSize(bytes) {
  const length = base64Length(bytes)
  if (length >= INPUT_LIMIT) throw new AppError('too_large', '录音超出整段分析大小限制，音频已保留，可以继续回放。')
  return length
}

export function utf8Length(text) {
  let bytes = 0
  for (const character of text) {
    const value = character.codePointAt(0)
    bytes += value < 0x80 ? 1 : value < 0x800 ? 2 : value < 0x10000 ? 3 : 4
  }
  return bytes
}

export function extractBase64(dataUrl, bytes, enforceUploadLimit = true) {
  const expected = enforceUploadLimit ? assertAudioSize(bytes) : base64Length(bytes)
  const match = /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl)
  if (!match || match[1].length !== expected) throw new AppError('read_audio', '音频读取不完整，请重新生成。原文件已保留。')
  return match[1]
}

export function assertRequestSize(body) {
  if (utf8Length(body) >= INPUT_LIMIT) throw new AppError('too_large', '音频请求超出大小限制，原音频已保留。')
}
