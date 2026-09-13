import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.argv[2] || 'app'
if (!['app', 'h5'].includes(platform)) throw new Error('Unsupported build platform')
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build', '-p', platform], {
  cwd: root, stdio: 'inherit', env: { ...process.env, UNI_INPUT_DIR: root, UNI_OUTPUT_DIR: path.join(root, 'unpackage/dist/build', platform === 'app' ? 'app-plus' : 'h5') }
})
process.exit(result.status ?? 1)
