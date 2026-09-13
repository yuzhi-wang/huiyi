<template>
  <view class="page home">
    <view class="header"><view><text class="title">会议记录</text><text class="subtitle">把交流留下来</text></view><button class="settings" @tap="settingsOpen = true">设置</button></view>
    <view class="recorder-card">
      <input v-model="customerName" class="customer" placeholder="客户名称（选填）" :maxlength="60" :disabled="busy" />
      <view class="clock" :class="{ live: view.phase === 'recording' }">{{ durationText(elapsed) }}</view>
      <button class="record-button" :class="{ recording: view.phase === 'recording' }" :disabled="!view.ready || view.phase === 'starting' || view.phase === 'saving' || !!view.activeId" @tap="toggleRecording">
        <view v-if="view.phase === 'recording'" class="stop-icon" />
        <image v-else class="mic-icon" src="/static/microphone.svg" />
        <text>{{ recordLabel }}</text>
      </button>
      <text class="record-help">{{ recordHelp }}</text>
      <text v-if="!view.configured" class="config-help" @tap="settingsOpen = true">未配置模型 · 可先录音，稍后生成纪要</text>
    </view>
    <view v-if="view.notice" class="notice">{{ view.notice }}</view>
    <view class="list-title"><text>历史记录</text><text class="count">{{ view.records.length }} 条</text></view>
    <view v-if="!view.records.length" class="empty"><text class="empty-title">还没有录音</text><text class="muted">开始一次交流，纪要会留在这里。</text></view>
    <view v-for="record in view.records" :key="record.id" class="record-row" @tap="openRecord(record.id)">
      <view class="row-top"><text class="record-title">{{ record.customerName || '未命名会议' }}</text><text class="badge" :class="record.status">{{ statusText(record.status) }}</text></view>
      <view class="row-bottom"><text>{{ dateText(record.createdAt) }} · {{ durationText(record.durationMs) }}</text><text class="arrow">›</text></view>
      <text v-if="record.status === 'failed' && record.failure" class="row-failure">{{ record.failure }}</text>
    </view>
    <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import SettingsDialog from '../../components/SettingsDialog.vue'
import { view, initialize, startRecording, stopRecording } from '../../services/app.js'
import { durationText, dateText, statusText } from '../../core/format.js'
import { friendlyError } from '../../core/errors.js'
const customerName = ref('')
const settingsOpen = ref(false)
const elapsed = ref(0)
let clock
const busy = computed(() => view.phase !== 'idle' || !!view.activeId)
const recordLabel = computed(() => ({ starting: '准备录音…', recording: '停止录音', saving: '保存中…' }[view.phase] || (view.activeId ? '纪要生成中…' : '开始录音')))
const recordHelp = computed(() => view.phase === 'recording' ? '正在录音，请保持应用在前台' : '前台录音，最长约 30 分钟')
onShow(() => { initialize(); clock = setInterval(() => { elapsed.value = view.startedAt ? Date.now() - view.startedAt : 0 }, 250) })
function stopClock() { clearInterval(clock); clock = null }
onHide(stopClock)
onUnload(stopClock)
async function toggleRecording() {
  try {
    if (view.phase === 'recording') { await stopRecording(); customerName.value = '' }
    else await startRecording(customerName.value)
  } catch (error) { view.notice = friendlyError(error) }
}
function openRecord(id) {
  if (view.phase !== 'idle') { view.notice = '请先结束并保存当前录音。'; return }
  uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
}
</script>

<style scoped>
.home { padding-top: calc(var(--status-bar-height) + 40rpx); max-width: 900px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 48rpx; }
.title { display: block; font-size: 48rpx; font-weight: 650; letter-spacing: -1rpx; }
.subtitle { display: block; margin-top: 10rpx; color: #88938e; font-size: 25rpx; }
.settings { color: #21796b; background: #edf3f1; font-size: 25rpx; padding: 0 26rpx; line-height: 70rpx; }
.recorder-card { background: #fff; border: 1rpx solid #e9eeec; border-radius: 28rpx; padding: 30rpx 30rpx 36rpx; text-align: center; }
.customer { text-align: left; font-size: 27rpx; padding: 8rpx 4rpx 24rpx; border-bottom: 1rpx solid #eff2f0; height: 70rpx; }
.clock { font-size: 78rpx; font-weight: 300; font-variant-numeric: tabular-nums; letter-spacing: 4rpx; color: #37443e; margin: 42rpx 0 34rpx; }
.clock.live { color: #21796b; }
.record-button { display: flex; align-items: center; justify-content: center; gap: 20rpx; color: #fff; background: #21796b; height: 108rpx; font-size: 31rpx; font-weight: 600; }
.recording { background: #245a51; }
.mic-icon { width: 36rpx; height: 44rpx; }
.stop-icon { width: 26rpx; height: 26rpx; background: #fff; border-radius: 5rpx; }
.record-help { display: block; color: #88938e; font-size: 24rpx; margin-top: 24rpx; }
.config-help { display: block; color: #21796b; font-size: 23rpx; margin-top: 20rpx; }
.list-title { margin: 48rpx 0 24rpx; display: flex; justify-content: space-between; font-size: 30rpx; font-weight: 600; }
.count { color: #88938e; font-size: 24rpx; font-weight: 400; }
.empty { padding: 62rpx 0; text-align: center; }
.empty-title { display: block; font-size: 29rpx; color: #67756c; margin-bottom: 14rpx; }
.record-row { padding: 28rpx; background: #fff; border: 1rpx solid #e9eeec; border-radius: 20rpx; margin-bottom: 18rpx; }
.row-top { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.record-title { font-size: 30rpx; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-bottom { display: flex; justify-content: space-between; align-items: center; color: #8a948f; font-size: 24rpx; margin-top: 18rpx; }
.arrow { font-size: 36rpx; line-height: 24rpx; }
.row-failure { display: block; color: #966239; font-size: 23rpx; line-height: 1.6; margin-top: 12rpx; }
</style>
