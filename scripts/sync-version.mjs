// package.json 의 버전(예: 0.5.0)을 Android 앱 버전에 맞춘다.
// versionCode 는 숫자여야 하므로 0.5.0 → 500, 1.2.3 → 10203
import { readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0)
const code = major * 10000 + minor * 100 + patch
const file = new URL('../android/app/build.gradle', import.meta.url)
const gradle = readFileSync(file, 'utf8')
  .replace(/versionCode \d+/, `versionCode ${code}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`)
writeFileSync(file, gradle)
console.log(`Android 버전: ${version} (${code})`)
