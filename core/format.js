export const statusText = status => ({ saved: '待生成', generating: '生成中', succeeded: '已完成', failed: '失败' }[status] || '待生成')
export function durationText(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '时长待读取'
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
export function dateText(value) {
  const date = new Date(value)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export const sizeText = bytes => `${(bytes / 1_000_000).toFixed(2)} MB`
