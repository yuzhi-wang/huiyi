import { AppError } from '../core/errors.js'

export function requireAndroid() {
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') {
    throw new AppError('platform', '录音和生成请在 Android 安装包中使用。')
  }
  return plus
}

export function getNetworkType() {
  return new Promise(resolve => uni.getNetworkType({ success: result => resolve(result.networkType), fail: () => resolve('unknown') }))
}
