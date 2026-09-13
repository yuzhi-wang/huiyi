import { AppError, friendlyError } from './errors.js'
import { parseMeetingResult } from './meeting-result.js'

export function createGeneration({ records, prepare, request, onActive = () => {}, onText = () => {} }) {
  let activeId = ''
  return {
    get activeId() { return activeId },
    async run(id, config) {
      if (activeId) throw new AppError('busy', '已有纪要正在生成，请稍候。')
      if (!config.key || !config.workspaceId) throw new AppError('config_missing', '请先在设置中填写 API Key 和 Workspace ID。')
      const record = records.get(id)
      if (!record) throw new AppError('missing_record', '找不到这条记录。')
      activeId = id
      onActive(id)
      try {
        records.update(id, { status: 'generating', failure: '' })
        const body = await prepare(record, config)
        const raw = await request(body, config, value => onText(id, value))
        const result = parseMeetingResult(raw)
        records.update(id, { status: 'succeeded', failure: '', result })
        return result
      } catch (error) {
        let message = friendlyError(error, '生成失败，请重试。原音频已保留。')
        try { records.update(id, { status: 'failed', failure: message }) }
        catch { message = '结果未能保存，请释放存储空间后重试。原音频已保留。'; records.markFailureInMemory(id, message) }
        throw new AppError('generation_failed', message)
      } finally {
        activeId = ''
        onActive('')
        onText('', '')
      }
    }
  }
}
