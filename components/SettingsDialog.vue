<template>
  <view v-if="open" class="overlay" @tap.self="close">
    <view class="dialog">
      <view class="dialog-header"><text class="title">模型设置</text><button class="close" aria-label="关闭设置" @tap="close">×</button></view>
      <text class="helper">填写北京地域配置，用于生成纪要。录音与回放无需配置。</text>
      <text class="label">API Key</text>
      <input v-model="key" class="field" :password="true" :maxlength="256" placeholder="输入 API Key" :adjust-position="true" />
      <text class="label">Workspace ID</text>
      <input v-model="workspaceId" class="field" :maxlength="63" placeholder="输入业务空间 ID" :adjust-position="true" />
      <text class="helper footnote">配置仅在本次会话有效，关闭应用后需重新填写。生成时，录音将发送至阿里云。</text>
      <text v-if="error" class="error">{{ error }}</text>
      <view class="actions"><button class="secondary" @tap="clear">清除配置</button><button class="primary" @tap="save">保存</button></view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { clearConfig, getConfig, saveConfig } from '../services/app.js'
import { friendlyError } from '../core/errors.js'
const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const key = ref('')
const workspaceId = ref('')
const error = ref('')
watch(() => props.open, value => {
  error.value = ''
  const current = value ? getConfig() : { key: '', workspaceId: '' }
  key.value = current.key
  workspaceId.value = current.workspaceId
})
function close() { key.value = ''; workspaceId.value = ''; emit('close') }
function save() {
  try { saveConfig(key.value, workspaceId.value); close() }
  catch (reason) { error.value = friendlyError(reason) }
}
function clear() { clearConfig(); close() }
</script>

<style scoped>
.overlay { position: fixed; z-index: 100; inset: 0; background: rgba(23,35,45,.36); display: flex; align-items: center; justify-content: center; padding: 32rpx; }
.dialog { width: 100%; max-width: 600px; max-height: 86vh; overflow-y: auto; border-radius: 28rpx; background: white; padding: 32rpx; }
.dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12rpx; }
.title { font-size: 36rpx; font-weight: 600; }
.close { width: 60rpx; height: 60rpx; line-height: 55rpx; font-size: 44rpx; color: #7a8790; background: transparent; padding: 0; }
.helper { display: block; font-size: 25rpx; line-height: 1.7; color: #7a8790; }
.label { display: block; font-size: 26rpx; margin: 26rpx 0 14rpx; }
.field { height: 92rpx; background: #f7f8fa; border: 1rpx solid #e9eeec; border-radius: 14rpx; padding: 0 24rpx; font-size: 27rpx; }
.footnote { margin-top: 24rpx; font-size: 23rpx; }
.error { display: block; color: #966239; font-size: 25rpx; margin-top: 18rpx; }
.actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.actions button { flex: 1; }
</style>
