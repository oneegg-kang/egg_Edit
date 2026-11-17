import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 는 https://<계정>.github.io/<저장소>/ 아래에서 열리므로, 배포할 때만 경로를 바꾼다.
  base: process.env.BASE_PATH ?? '/',
})
