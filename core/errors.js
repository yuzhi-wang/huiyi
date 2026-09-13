export class AppError extends Error {
  constructor(code, message) { super(message); this.name = 'AppError'; this.code = code }
}

// Only our own errors are safe to show. Native/provider exceptions may contain payloads.
export function friendlyError(error, fallback = '操作未完成，请重试。') {
  return error instanceof AppError ? error.message : fallback
}
