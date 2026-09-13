import { AppError } from './errors.js'

export function createRecords(storage, onChange = () => {}) {
  let records = []
  const publish = () => onChange(records.map(record => ({ ...record })))
  function commit(next) {
    try { storage.write(next) } catch { throw new AppError('persist_failed', '记录保存失败，音频文件仍保留在本机。请释放存储空间后重试。') }
    records = next
    publish()
  }
  return {
    load() {
      let value
      try { value = storage.read() } catch { throw new AppError('storage_read', '历史记录暂时无法读取，请重新打开应用。') }
      if (value === '' || value == null) value = []
      if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== 'string' || typeof item.audioPath !== 'string')) {
        throw new AppError('storage_read', '历史记录格式异常，未覆盖原数据。')
      }
      records = value
      publish()
      if (records.some(record => record.status === 'generating')) {
        const recovered = records.map(record => record.status === 'generating' ? { ...record, status: 'failed', failure: '上次生成中断，可以重试。' } : record)
        try { commit(recovered) }
        catch (error) { records = recovered; publish(); throw error }
      }
    },
    list: () => records.map(record => ({ ...record })),
    get: id => { const record = records.find(item => item.id === id); return record ? { ...record } : null },
    add(record) { if (!records.some(item => item.id === record.id)) commit([record, ...records]) },
    update(id, changes) {
      if (!records.some(item => item.id === id)) throw new AppError('missing_record', '找不到这条记录。')
      commit(records.map(item => item.id === id ? { ...item, ...changes } : item))
    },
    // UI must not remain on “generating” if storage is full. Disk state is recovered on restart.
    markFailureInMemory(id, failure) {
      records = records.map(item => item.id === id ? { ...item, status: 'failed', failure } : item)
      publish()
    }
  }
}
