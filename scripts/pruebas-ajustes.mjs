/**
 * Pruebas de la lógica de Ajustes: guardado de archivos sin «directory exists»
 * y diagnóstico guiado «¿por qué no detecta?».
 *
 *   node scripts/pruebas-ajustes.mjs
 */
import { guardarArchivo, esErrorYaExiste, nombreLibre, asegurarCarpeta } from '../src/lib/guardarArchivo.js'
import { evaluarDiagnostico } from '../src/lib/diagnostico.js'
import { watch } from 'vue'

let fallos = 0
function check (etiqueta, ok, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
  if (!ok) fallos += 1
}

/**
 * Filesystem simulado que imita al de Capacitor en Android: `mkdir` RECHAZA
 * con «Directory exists» si la carpeta ya está (aunque sea recursive), `stat`
 * rechaza si no existe y `writeFile` sobrescribe.
 */
function fsFalso ({ mensajeMkdir = 'Directory exists', mkdirRaro = false } = {}) {
  const dirs = new Set()
  const archivos = new Map()
  const llamadas = []
  return {
    dirs, archivos, llamadas,
    async mkdir ({ path }) {
      llamadas.push(['mkdir', path])
      if (dirs.has(path)) throw new Error(mensajeMkdir)
      dirs.add(path)
    },
    async stat ({ path }) {
      if (archivos.has(path)) return { type: 'file' }
      if (dirs.has(path)) return { type: 'directory' }
      throw new Error('File does not exist')
    },
    async writeFile ({ path, data, encoding }) {
      llamadas.push(['writeFile', path])
      if (mkdirRaro && !dirs.has(path.split('/').slice(0, -1).join('/'))) throw new Error('sin carpeta')
      archivos.set(path, { data, encoding })
    }
  }
}

const base = { directory: 'DOCUMENTS', carpeta: 'Skippify/backups', encoding: 'utf8' }

console.log('\nExportar dos veces seguidas (el fallo «directory exists»)')
{
  const fs = fsFalso()
  const a = await guardarArchivo(fs, { ...base, nombre: 'respaldo.json', data: 'uno' })
  let segundoOk = true
  let b
  try { b = await guardarArchivo(fs, { ...base, nombre: 'respaldo-2026-11-09.json', data: 'dos' }) } catch { segundoOk = false }
  check('la primera exportación guarda el archivo', a.ruta === 'Skippify/backups/respaldo.json' && fs.archivos.get(a.ruta).data === 'uno')
  check('la segunda NO falla aunque la carpeta ya exista', segundoOk)
  check('la segunda se guarda también', !!b && fs.archivos.get(b.ruta)?.data === 'dos')
  check('el texto se escribe con su codificación', fs.archivos.get(a.ruta).encoding === 'utf8')
}

console.log('\nArchivo con el mismo nombre: no se pisa')
{
  const fs = fsFalso()
  const a = await guardarArchivo(fs, { ...base, nombre: 'r.json', data: 'uno' })
  const b = await guardarArchivo(fs, { ...base, nombre: 'r.json', data: 'dos' })
  const c = await guardarArchivo(fs, { ...base, nombre: 'r.json', data: 'tres' })
  check('el primero conserva su nombre', a.nombre === 'r.json')
  check('el segundo lleva sufijo -2', b.nombre === 'r-2.json' && b.ruta === 'Skippify/backups/r-2.json')
  check('el tercero lleva sufijo -3', c.nombre === 'r-3.json')
  check('ningún contenido se perdió', fs.archivos.get('Skippify/backups/r.json').data === 'uno' &&
    fs.archivos.get('Skippify/backups/r-2.json').data === 'dos' && fs.archivos.get('Skippify/backups/r-3.json').data === 'tres')
  check('un nombre sin extensión también', await nombreLibre(fs, 'Skippify/backups', 'r.json', 'DOCUMENTS') === 'r-4.json' &&
    await nombreLibre(fs, 'x', 'sin-extension', 'DOCUMENTS') === 'sin-extension')
}

console.log('\nOtros mensajes de «ya existe» y errores reales')
{
  for (const m of ['Directory exists', 'directory exists', 'Directory already exists', 'La carpeta ya existe', 'EEXIST: file already exists']) {
    check(`«${m}» se reconoce`, esErrorYaExiste(new Error(m)))
  }
  check('un error cualquiera no se confunde', !esErrorYaExiste(new Error('Permission denied')) && !esErrorYaExiste(null))

  // Mensaje que no se reconoce, pero la carpeta está: stat lo resuelve.
  const fs = fsFalso({ mensajeMkdir: 'Error de E/S 17' })
  fs.dirs.add('Skippify/backups')
  let ok = true
  try { await asegurarCarpeta(fs, 'Skippify/backups', 'DOCUMENTS') } catch { ok = false }
  check('mkdir rechaza con un texto raro pero la carpeta existe: éxito', ok)

  // Fallo real: mkdir falla y la carpeta no existe → se propaga.
  const roto = fsFalso()
  roto.mkdir = async () => { throw new Error('Permission denied') }
  let propaga = false
  try { await guardarArchivo(roto, { ...base, nombre: 'x.json', data: '1' }) } catch (e) { propaga = e.message === 'Permission denied' }
  check('un fallo real (permiso) sigue avisando', propaga)
}

console.log('\nImágenes (sin codificación, base64)')
{
  const fs = fsFalso()
  await guardarArchivo(fs, { directory: 'DOCUMENTS', carpeta: 'Skippify/wrapped', nombre: 'w.png', data: 'AAAA' })
  const r = await guardarArchivo(fs, { directory: 'DOCUMENTS', carpeta: 'Skippify/wrapped', nombre: 'w.png', data: 'BBBB' })
  check('no se pasa codificación al guardar binario', fs.archivos.get('Skippify/wrapped/w.png').encoding === undefined)
  check('la segunda imagen no pisa la primera', r.nombre === 'w-2.png' && fs.archivos.get('Skippify/wrapped/w.png').data === 'AAAA')
}

console.log('\nDiagnóstico: todo correcto')
{
  const ok = {
    nativo: true,
    permisos: { listenerEnabled: true, listenerConnected: true, postNotificationsGranted: true, batteryOptimizationIgnored: true },
    spotify: { conectada: true, scope: 'user-read-recently-played user-read-playback-state user-modify-playback-state', tieneRefresh: true, expiresAt: 2_000 },
    api: { enabled: true, lastError: '' }
  }
  const d = evaluarDiagnostico(ok, 1_000)
  check('cinco comprobaciones, todas correctas', d.items.length === 5 && d.items.every(i => i.estado === 'ok'))
  check('sin problemas ni arreglos', d.problemas === 0 && d.items.every(i => !i.arreglo))

  const id = (estado) => evaluarDiagnostico(estado, 1_000).items
  const de = (items, k) => items.find(i => i.id === k)

  let it = id({ ...ok, permisos: { ...ok.permisos, listenerEnabled: false, listenerConnected: false } })
  check('sin acceso: fallo con «abrir el acceso»', de(it, 'servicio').estado === 'fallo' && de(it, 'servicio').arreglo.id === 'abrir-acceso')

  it = id({ ...ok, permisos: { ...ok.permisos, listenerConnected: false } })
  check('acceso dado pero servicio sin conectar: «Reconectar»', de(it, 'servicio').estado === 'fallo' && de(it, 'servicio').arreglo.id === 'reconectar')

  it = id({ ...ok, permisos: { ...ok.permisos, listenerConnected: false }, capacidades: { reconectar: false } })
  check('nativo antiguo sin reconexión: se cae a abrir el acceso', de(it, 'servicio').arreglo.id === 'abrir-acceso')

  it = id({ ...ok, permisos: { ...ok.permisos, postNotificationsGranted: false } })
  check('notificaciones bloqueadas: pedir permiso', de(it, 'notificaciones').estado === 'fallo' && de(it, 'notificaciones').arreglo.id === 'pedir-notificaciones')

  it = id({ ...ok, permisos: { ...ok.permisos, batteryOptimizationIgnored: false } })
  check('batería sin excluir: aviso con arreglo', de(it, 'bateria').estado === 'aviso' && de(it, 'bateria').arreglo.id === 'excluir-bateria')

  it = id({ ...ok, spotify: { conectada: false } })
  check('Spotify sin vincular: aviso que lleva a Inicio', de(it, 'spotify').estado === 'aviso' && de(it, 'spotify').arreglo.id === 'ir-spotify')

  it = id({ ...ok, spotify: { ...ok.spotify, expiresAt: 500, tieneRefresh: false } })
  check('token caducado sin refresh: fallo', de(it, 'spotify').estado === 'fallo')
  it = id({ ...ok, spotify: { ...ok.spotify, expiresAt: 500, tieneRefresh: true } })
  check('token caducado con refresh: se renueva solo, correcto', de(it, 'spotify').estado === 'ok')

  it = id({ ...ok, spotify: { ...ok.spotify, scope: 'user-read-playback-state user-modify-playback-state' } })
  check('sin permiso de historial: aviso', de(it, 'spotify').estado === 'aviso' && /historial/.test(de(it, 'spotify').titulo))
  it = id({ ...ok, spotify: { ...ok.spotify, scope: 'user-read-recently-played' } })
  check('sin permiso de reproducción: aviso', de(it, 'spotify').estado === 'aviso' && /reproducción/.test(de(it, 'spotify').titulo))
  it = id({ ...ok, spotify: { ...ok.spotify, scope: '' } })
  check('token antiguo sin lista de permisos: no se acusa en falso', de(it, 'spotify').estado === 'ok')

  it = id({ ...ok, api: { enabled: false } })
  check('lectura por API apagada: neutra, no cuenta como problema', de(it, 'api').estado === 'info' &&
    evaluarDiagnostico({ ...ok, api: { enabled: false } }, 1_000).problemas === 0)
  it = id({ ...ok, api: { enabled: true, lastError: 'no-session' } })
  check('API con sesión inválida: fallo con arreglo', de(it, 'api').estado === 'fallo' && de(it, 'api').arreglo?.id === 'ir-spotify')
  it = id({ ...ok, api: { enabled: true, lastError: 'network' } })
  check('API con error de red: fallo sin arreglo (se reintenta sola)', de(it, 'api').estado === 'fallo' && de(it, 'api').arreglo === null)

  const varios = evaluarDiagnostico({ ...ok, permisos: { ...ok.permisos, listenerConnected: false, batteryOptimizationIgnored: false } }, 1_000)
  check('cuenta los problemas y lo dice en plural', varios.problemas === 2 && /2 problemas/.test(varios.resumen))
}

console.log('\nDiagnóstico: fuera de la app (navegador)')
{
  const d = evaluarDiagnostico({ nativo: false, permisos: null, spotify: null, api: null })
  const nd = d.items.filter(i => i.estado === 'nd').map(i => i.id)
  check('servicio, notificaciones, batería y API: «No disponible aquí»', ['servicio', 'notificaciones', 'bateria', 'api'].every(k => nd.includes(k)))
  check('ninguna lleva arreglo', d.items.filter(i => i.estado === 'nd').every(i => !i.arreglo))
  check('el texto lo dice', d.items.filter(i => i.estado === 'nd').every(i => /No disponible aquí/.test(i.detalle)))
  check('la sesión de Spotify sí se puede comprobar', d.items.find(i => i.id === 'spotify').estado === 'aviso')
}

console.log('\nBuscar actualizaciones: el aviso no parpadea')
{
  // Entorno mínimo: plugin Updater falso, localStorage y fetch a la API de releases.
  const almacen = new Map()
  globalThis.localStorage = {
    getItem: k => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: k => almacen.delete(k)
  }
  globalThis.window = { Capacitor: { Plugins: { Updater: {
    getStatus: async () => ({ versionName: '4.5.5', versionCode: 455, canInstall: true }),
    addListener: async () => ({ remove () {} })
  } } } }
  let etiqueta = 'v4.6.0-b460'
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ tag_name: etiqueta, body: '', assets: [{ name: 'a.apk', browser_download_url: 'https://x/a.apk', size: 1 }] })
  })
  const { useAppUpdate } = await import('../src/composables/useAppUpdate.js')
  const u = useAppUpdate()

  check('la primera comprobación detecta la versión nueva y muestra el aviso', (await u.check({ manual: true })) === true && u.shouldPrompt.value === true)

  let avisoOculto = 0
  const parar = watch(u.shouldPrompt, v => { if (!v) avisoOculto += 1 }, { flush: 'sync' })
  const otra = await u.check({ manual: true })
  check('una comprobación manual con el aviso ya visible lo mantiene (sin pasar por «checking»)', otra === true && avisoOculto === 0 && u.status.value === 'available')

  u.status.value = 'ready'
  await u.check({ manual: true })
  check('con la APK ya descargada, comprobar de nuevo no retrocede a «available»', u.status.value === 'ready' && avisoOculto === 0)
  parar()

  u.dismiss()
  u.status.value = 'idle'
  const pasos = []
  const parar2 = watch(u.status, v => pasos.push(v), { flush: 'sync' })
  await u.check({ manual: true })
  parar2()
  check('desde el reposo sí informa «checking» y termina en «available»', pasos.join('>') === 'checking>available')

  etiqueta = 'v4.5.5-b455'
  u.status.value = 'idle'
  check('sin versión más nueva, termina en reposo y devuelve false', (await u.check({ manual: true })) === false && u.status.value === 'idle')
}

if (fallos) {
  console.error(`\n${fallos} comprobación(es) con error.`)
  process.exit(1)
}
console.log('\nLa lógica de Ajustes (guardado y diagnóstico) es correcta.')
