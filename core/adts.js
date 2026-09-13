// Duration comes from complete AAC frames, never the screen's wall clock.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
export function inspectAdts(base64) {
  const size = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
  const byte = offset => {
    const bit = offset * 8
    const index = Math.floor(bit / 6)
    const pair = (alphabet.indexOf(base64[index]) << 6) | alphabet.indexOf(base64[index + 1])
    return (pair >> (4 - bit % 6)) & 255
  }
  let offset = 0
  let seconds = 0
  let frames = 0
  while (offset + 7 <= size) {
    if (byte(offset) !== 255 || (byte(offset + 1) & 246) !== 240) break
    const rate = rates[(byte(offset + 2) >> 2) & 15]
    const length = ((byte(offset + 3) & 3) << 11) | (byte(offset + 4) << 3) | (byte(offset + 5) >> 5)
    const headerLength = byte(offset + 1) & 1 ? 7 : 9
    if (!rate || length <= headerLength || offset + length > size) break
    seconds += 1024 * ((byte(offset + 6) & 3) + 1) / rate
    offset += length
    frames++
  }
  if (!frames) throw new Error('No complete ADTS frames')
  return { durationMs: Math.round(seconds * 1000), incomplete: offset !== size }
}
