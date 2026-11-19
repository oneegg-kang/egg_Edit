import type { CapacitorConfig } from '@capacitor/cli'

// egg_Edit 휴대폰 앱 (Android) 설정. 화면은 웹 앱(dist)과 똑같은 것을 쓴다.
const config: CapacitorConfig = {
  appId: 'com.oneeggkang.eggedit',
  appName: 'egg_Edit',
  webDir: 'dist',
  android: {
    // 사진·동영상을 올릴 때 큰 파일을 다루므로
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
