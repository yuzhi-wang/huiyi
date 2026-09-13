<script>
import { initialize, onAppHide, onAppShow } from './services/app.js'
export default {
  onLaunch() { initialize() },
  onShow() { onAppShow() },
  onHide() { onAppHide() }
}
</script>

<style>
page { background: #f7f8fa; color: #17232d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 28rpx; }
view, text, input, button { box-sizing: border-box; }
button { font-size: 28rpx; border-radius: 18rpx; margin: 0; }
button::after { border: 0; }
button[disabled] { opacity: .45; }
.page { padding: 36rpx 36rpx calc(40rpx + env(safe-area-inset-bottom)); }
.muted { color: #7a8790; font-size: 25rpx; line-height: 1.7; }
.primary { background: #21796b; color: #fff; font-weight: 600; }
.secondary { background: #edf3f1; color: #21796b; }
.notice { margin-top: 24rpx; color: #805731; background: #fff5e9; padding: 22rpx 26rpx; border-radius: 16rpx; font-size: 25rpx; line-height: 1.6; }
.card { background: #fff; border: 1rpx solid #e9eeec; border-radius: 24rpx; padding: 30rpx; margin-bottom: 24rpx; }
.section-title { font-size: 30rpx; font-weight: 600; margin-bottom: 22rpx; }
.badge { font-size: 22rpx; color: #748079; background: #f0f3f2; padding: 7rpx 15rpx; border-radius: 9rpx; flex-shrink: 0; }
.badge.succeeded { color: #21796b; background: #eaf5ef; }
.badge.failed { color: #966239; background: #fff2e4; }
.badge.generating { color: #21796b; background: #eaf5ef; }
</style>
