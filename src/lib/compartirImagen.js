/**
 * Compartir o guardar una imagen PNG.
 *
 *  1. Si el navegador / WebView admite `navigator.share` con archivos, se abre
 *     el menú de compartir del sistema.
 *  2. Si no, en la app nativa se guarda en Documentos/Skippify/wrapped (con
 *     @capacitor/filesystem, ya instalado) y se devuelve la ruta para avisar.
 *  3. Si no, en el navegador se descarga el PNG.
 *
 * Devuelve `{ estado: 'compartido' | 'cancelado' | 'guardado' | 'descargado', ruta? }`.
 * `entorno` sólo existe para poder probar la lógica sin navegador.
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

function blobABase64 (blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',')[1] || '')
    lector.onerror = () => reject(lector.error || new Error('No se pudo leer la imagen'))
    lector.readAsDataURL(blob)
  })
}

export async function compartirPng (blob, nombre, { titulo = '', texto = '' } = {}, entorno = {}) {
  const nav = entorno.navigator ?? (typeof navigator !== 'undefined' ? navigator : null)
  const archivo = new File([blob], nombre, { type: 'image/png' })

  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    let puede = false
    try { puede = nav.canShare({ files: [archivo] }) } catch { puede = false }
    if (puede) {
      try {
        await nav.share({ files: [archivo], title: titulo, text: texto })
        return { estado: 'compartido' }
      } catch (e) {
        if (e && e.name === 'AbortError') return { estado: 'cancelado' }
        // Cualquier otro fallo (permiso, WebView sin soporte real): se guarda.
      }
    }
  }

  return guardarPng(blob, nombre, entorno)
}

/** Guarda (app nativa) o descarga (navegador) el PNG, sin pasar por el menú de compartir. */
export async function guardarPng (blob, nombre, entorno = {}) {
  const nativo = entorno.nativo ?? Capacitor.isNativePlatform()
  if (nativo) {
    const dir = 'Skippify/wrapped'
    const guardar = entorno.guardar ?? (async (b, n) => {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true }).catch(() => {})
      await Filesystem.writeFile({
        path: `${dir}/${n}`,
        data: await blobABase64(b),
        directory: Directory.Documents
      })
    })
    await guardar(blob, nombre)
    return { estado: 'guardado', ruta: `Documents/${dir}/${nombre}` }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return { estado: 'descargado' }
}
