<template>
  <view class="page detail">
    <template v-if="record">
      <view class="heading"><text class="title">{{ record.customerName || '未命名会议' }}</text><text class="badge" :class="record.status">{{ statusText(record.status) }}</text></view>
      <text class="muted metadata">{{ dateText(record.createdAt) }} · {{ durationText(record.durationMs || audioDuration * 1000 || null) }} · {{ sizeText(record.sizeBytes) }}</text>
      <view class="card player">
        <button class="play-button secondary" :disabled="loadingAudio" @tap="togglePlay">{{ loadingAudio ? '…' : playing ? '暂停' : '播放' }}</button>
        <view class="timeline"><slider :value="currentTime" :max="Math.max(audioDuration, 1)" :disabled="audioDuration <= 0" activeColor="#21796b" backgroundColor="#e8eeeb" :block-size="16" @change="seek" /><view class="times"><text>{{ durationText(currentTime * 1000) }}</text><text>{{ durationText(audioDuration ? audioDuration * 1000 : record.durationMs) }}</text></view></view>
      </view>
      <view v-if="error || record.failure" class="notice error-notice">{{ error || record.failure }}</view>
      <view v-if="record.status === 'generating'" class="card">
        <view class="section-title">正在生成纪要…</view>
        <text class="muted">{{ active ? '请保持应用在前台，完成后会自动保存。' : '正在处理，请稍候。' }}</text>
        <text v-if="active && view.partialText" class="partial" selectable>{{ view.partialText }}</text>
      </view>
      <template v-if="record.result">
        <text v-if="record.status !== 'succeeded'" class="muted previous">以下是上次已保存的纪要</text>
        <view class="card"><view class="section-title">会议摘要</view><text class="body" selectable>{{ record.result.summary }}</text></view>
        <view class="card"><view class="section-title">关键事项</view><text v-if="!record.result.keyPoints.length" class="muted">未提取到明确事项</text><view v-for="(point, index) in record.result.keyPoints" :key="index" class="point"><text class="bullet">·</text><text class="body" selectable>{{ point }}</text></view></view>
        <view class="card"><view class="section-title">待办事项</view><text v-if="!record.result.todos.length" class="muted">未发现明确待办</text><view v-for="(todo, index) in record.result.todos" :key="index" class="todo"><text class="body" selectable>{{ todo.content }}</text><text class="todo-meta">负责人：{{ todo.owner || '未明确' }}　截止：{{ todo.dueDate || '未明确' }}</text></view></view>
      </template>
      <view v-else-if="record.status !== 'generating'" class="empty-result"><text class="section-title">录音已保存</text><text class="muted">{{ view.configured ? '生成纪要，提取摘要与待办。' : '先填写模型配置，即可生成纪要。' }}</text></view>
      <button class="primary generate" :disabled="!!view.activeId || generating" @tap="makeMinutes">{{ active || generating ? '生成中…' : !view.configured ? '配置模型并生成' : record.result ? '重新生成' : record.status === 'failed' ? '重试生成' : '生成纪要' }}</button>
      <text class="bottom-note muted">纪要由 AI 生成，请对照录音核对重要事项。</text>
    </template>
    <view v-else class="empty-result"><text>找不到这条记录</text><text class="muted">请返回首页重试。</text></view>
    <SettingsDialog :open="settingsOpen" @close="closeSettings" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onHide, onUnload } from '@dcloudio/uni-app'
import SettingsDialog from '../../components/SettingsDialog.vue'
import { view, generate, updateAudioDuration } from '../../services/app.js'
import { dateText, durationText, sizeText, statusText } from '../../core/format.js'
import { friendlyError } from '../../core/errors.js'
const id = ref('')
const record = computed(() => view.records.find(item => item.id === id.value))
const active = computed(() => view.activeId === id.value && !!id.value)
const playing = ref(false)
const loadingAudio = ref(false)
const currentTime = ref(0)
const audioDuration = ref(0)
const settingsOpen = ref(false)
const generating = ref(false)
const error = ref('')
let audio
let loadTimer
let pendingGeneration = false
onLoad(options => { id.value = options.id || '' })
function createAudio() {
  if (audio || !record.value) return
  audio = uni.createInnerAudioContext()
  audio.autoplay = false
  audio.onCanplay(() => { loadingAudio.value = false; clearTimeout(loadTimer); audioDuration.value = audio.duration || 0 })
  audio.onPlay(() => { playing.value = true; loadingAudio.value = false; clearTimeout(loadTimer) })
  audio.onPause(() => { playing.value = false })
  audio.onEnded(() => { playing.value = false; currentTime.value = 0 })
  audio.onTimeUpdate(() => {
    currentTime.value = audio.currentTime || 0; audioDuration.value = audio.duration || audioDuration.value
    try { updateAudioDuration(id.value, audioDuration.value * 1000) } catch { error.value = '音频可回放，但时长未能保存。' }
  })
  audio.onError(() => { playing.value = false; loadingAudio.value = false; clearTimeout(loadTimer); error.value = '无法播放音频，请检查文件是否仍存在。'; audio.destroy(); audio = null })
  audio.src = record.value.audioPath
}
function togglePlay() {
  error.value = ''
  try {
    createAudio()
    if (!audio) return
    if (playing.value) audio.pause()
    else { loadingAudio.value = true; loadTimer = setTimeout(() => { loadingAudio.value = false; error.value = '音频加载超时，请重试。'; if (audio) { audio.destroy(); audio = null } }, 15000); audio.play() }
  } catch { loadingAudio.value = false; error.value = '播放失败，请重试。' }
}
function seek(event) { if (audio) { audio.seek(event.detail.value); currentTime.value = event.detail.value } }
function pauseAudio() { if (audio) audio.pause() }
onHide(pauseAudio)
onUnload(() => { clearTimeout(loadTimer); if (audio) audio.destroy(); audio = null })
function confirmRegenerate() {
  return new Promise(resolve => uni.showModal({ title: '重新生成纪要', content: '将再次提交录音并产生模型调用费用。失败时保留原纪要。', confirmText: '重新生成', success: result => resolve(result.confirm), fail: () => resolve(false) }))
}
async function makeMinutes() {
  if (!record.value || generating.value || view.activeId) return
  if (!view.configured) { pendingGeneration = true; settingsOpen.value = true; return }
  if (record.value.result && !await confirmRegenerate()) return
  pauseAudio()
  error.value = ''
  generating.value = true
  try { await generate(id.value) } catch (reason) { error.value = friendlyError(reason) }
  finally { generating.value = false }
}
function closeSettings() {
  settingsOpen.value = false
  if (pendingGeneration && view.configured) { pendingGeneration = false; makeMinutes() }
  else pendingGeneration = false
}
</script>

<style scoped>
.detail { max-width: 900px; margin: 0 auto; }
.heading { display: flex; align-items: center; gap: 20rpx; justify-content: space-between; margin-bottom: 12rpx; }
.title { font-size: 40rpx; font-weight: 600; overflow-wrap: anywhere; }
.metadata { display: block; margin-bottom: 32rpx; }
.player { display: flex; align-items: center; gap: 20rpx; padding: 24rpx; }
.play-button { width: 100rpx; height: 82rpx; line-height: 82rpx; padding: 0; font-size: 25rpx; flex-shrink: 0; }
.timeline { flex: 1; min-width: 0; }
.timeline slider { margin: 4rpx 0 10rpx; }
.times { display: flex; justify-content: space-between; font-size: 22rpx; color: #88938e; }
.body { font-size: 28rpx; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; }
.point { display: flex; gap: 15rpx; margin-top: 16rpx; }
.bullet { color: #21796b; font-size: 34rpx; line-height: 1.5; }
.todo { padding: 22rpx 0; border-top: 1rpx solid #eff2f0; }
.todo:first-of-type { padding-top: 0; }
.todo-meta { display: block; color: #7a8790; font-size: 24rpx; line-height: 1.7; margin-top: 12rpx; }
.partial { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 24rpx; line-height: 1.8; margin-top: 22rpx; color: #67756c; }
.empty-result { text-align: center; padding: 64rpx 0; }
.empty-result text { display: block; }
.generate { margin-top: 28rpx; }
.bottom-note { display: block; text-align: center; margin-top: 24rpx; font-size: 22rpx; }
.error-notice { margin: 0 0 24rpx; }
.previous { display: block; margin-bottom: 18rpx; }
</style>
