import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
const appVersion = process.env.SKIPPIFY_APP_VERSION || 'v3'

/**
 * La puntuación semanal es CommonJS y vive en firebase/functions/ porque la
 * comparte la Cloud Function. Vite no convierte CommonJS fuera de node_modules,
 * así que se reescribe su única línea de exportación para poder importarla
 * desde el modo LocalHost sin mantener una segunda copia.
 */
function scoringComoEsm () {
  return {
    name: 'scoring-cjs-a-esm',
    enforce: 'pre',
    transform (code, id) {
      if (!/firebase[\\/]functions[\\/]scoring\.js$/.test(id.split('?')[0])) return null
      const out = code.replace(/module\.exports\s*=\s*\{([^}]*)\}/, 'export {$1}')
      return out === code ? null : { code: out, map: null }
    }
  }
}

export default defineConfig({
  plugins: [scoringComoEsm(), vue()],
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
