# 会议记录

uni-app + Vue 3 + JavaScript Android Demo：录音 → 本地保存 → 整段提交 Qwen Omni → 流式会议纪要 → 历史查看与回放。

完整功能源码、18 项自动测试、页面检查及 **Android APK 云打包已完成**。2026-09-13 产出 `apk/huiyi-0.1.0.apk`（20,293,134 字节），签名与包信息核验通过。已在 MuMu 实际检查短录音保存、播放控制及关闭应用标签后重开保留；音质与真实模型调用尚未验证。详见[MuMu 实际测试记录](docs/MuMu实际测试记录.md)。详见[开发检查记录](docs/开发检查记录.md)。

APK SHA-256：`93033BE59CE327DCD8CA5074C34AECF4A3CEACD62B6C45A8EAD847E121F85D4A`。

## 使用

在 HBuilderX 中打开本目录，项目已配置真实 DCloud AppID。包名 `com.huiyi.meetingdemo`，版本 `0.1.0`（100）。[打开、打包与 MuMu 安装说明](docs/使用与打包.md)。

录音、保存、历史、回放无需 Key。首页可填写客户名称，点击录音，手动停止或约 30 分钟自动停止。应用进入后台时停止保存，返回后手动生成。

设置中填写北京地域 API Key 和 Workspace ID，仅保留当前运行会话。已配置且联网时，正常录音保存后自动生成；否则进入“待生成”，可在详情页手动生成。结果包括摘要、关键事项、待办。失败保留音频与上次完成的纪要。

## 开发自检

```powershell
npm ci
npm test
npm run build:app
npm run build:h5
```

`build:app` 输出 `unpackage/dist/build/app-plus`，这是 **App 资源，不是 APK**。`build:h5` 仅用于页面检查，浏览器不支持本项目的 Native.js Android 录音与模型传输。

源码采用根目录的标准 HBuilderX 结构；命令行编译通过 `scripts/build.mjs` 设置输入目录。DCloud 编译器固定 `3.0.0-5020420260813003`（5.24），依赖锁文件包含在源码中。

## 结构

- `pages/`：首页和详情页；`components/SettingsDialog.vue`：设置弹窗。
- `services/`：Android 录音、文件、原生 XHR 和应用内会话。
- `core/`：大小检查、AAC 帧时长、SSE、结果校验、本地历史和单请求控制。
- `tests/`：纯逻辑及模拟原生接口测试，不等同于设备或真实模型测试。
- `scripts/`：编译、图标生成、固定签名和 HBuilderX 云打包。

无后端、OSS、独立 ASR、音频切分、自动重试或后台保活。仅支持 Android；MuMu 已完成上述基础检查，长录音、Android 真机和真实模型调用尚未执行。卸载应用/清除数据会丢失本地音频与纪要；覆盖安装须保持相同包名与签名。

旧需求和技术核查文档保留作决策背景，当前实施以用户确认的一次完整交付计划及本 README 为准。

