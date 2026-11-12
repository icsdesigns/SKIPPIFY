import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
const appVersion = process.env.SKIPPIFY_APP_VERSION || 'v3'

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // bg.html: página sin interfaz del servicio en segundo plano (LocalHost).
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bg: resolve(__dirname, 'bg.html')
      }
    }
  },
  server: {
    port: 5173
  }
})
