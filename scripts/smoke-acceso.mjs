/**
 * Guía del acceso a notificaciones: qué pasos ve cada dispositivo.
 *
 *   node scripts/smoke-acceso.mjs
 *
 * Lo que se protege es el orden de los pasos con «ajustes restringidos»
 * (Android 13+ con la APK instalada desde un archivo): la opción para
 * desbloquearlos no aparece hasta haber intentado activar el interruptor, así
 * que el intento tiene que ir antes. Y que una instalación de tienda o un
 * Android antiguo no vea pasos que no le aplican.
 */
import {
  construirGuia,
  describirDispositivo,
  familiaDispositivo,
  requiereAjustesRestringidos
} from '../src/lib/guiaAccesoNotificaciones.js'

let fallos = 0
let total = 0

function check (etiqueta, real, esperado) {
  total += 1
  const ok = Object.is(real, esperado)
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : `\n      esperado: ${esperado}\n      recibido: ${real}`}`)
  if (!ok) fallos += 1
}

function titulo (s) {
  console.log()
  console.log(s)
}

const xiaomi = {
  manufacturer: 'Xiaomi', brand: 'Redmi', model: '23090RA98G', sdkInt: 34, release: '14',
  rom: 'hyperos', romVersion: 'OS1.0', installer: 'com.google.android.packageinstaller',
  packageSource: 'local-file', restrictedSettings: 'restricted'
}
const samsungTienda = {
  manufacturer: 'samsung', brand: 'samsung', model: 'SM-S918B', sdkInt: 34, release: '14',
  rom: 'oneui', romVersion: '60100', installer: 'com.android.vending',
  packageSource: 'store', restrictedSettings: 'allowed'
}
const pixelDesconocido = {
  manufacturer: 'Google', brand: 'google', model: 'Pixel 8', sdkInt: 35, release: '15',
  rom: '', romVersion: '', installer: '', packageSource: '', restrictedSettings: 'unknown'
}
const huaweiViejo = {
  manufacturer: 'HUAWEI', brand: 'HUAWEI', model: 'ELS-NX9', sdkInt: 29, release: '10',
  rom: 'emui', romVersion: 'EmotionUI_12.0.0', installer: '', packageSource: '', restrictedSettings: 'n/a'
}

titulo('Familias')
check('HyperOS → xiaomi', familiaDispositivo(xiaomi), 'xiaomi')
check('Samsung → samsung', familiaDispositivo(samsungTienda), 'samsung')
check('Realme por marca → oppo', familiaDispositivo({ manufacturer: 'realme' }), 'oppo')
check('OnePlus → oppo', familiaDispositivo({ manufacturer: 'OnePlus', rom: 'oxygenos' }), 'oppo')
check('Honor → honor', familiaDispositivo({ manufacturer: 'HONOR', rom: 'magicos' }), 'honor')
check('Pixel → pixel', familiaDispositivo(pixelDesconocido), 'pixel')
check('Sin datos → generico', familiaDispositivo(null), 'generico')

titulo('Ajustes restringidos')
check('APK local en Android 14, AppOp bloqueado', requiereAjustesRestringidos(xiaomi), true)
check('Play Store y permitido', requiereAjustesRestringidos(samsungTienda), false)
check('Android 15 sin poder leerlo → condicional', requiereAjustesRestringidos(pixelDesconocido), null)
check('Android 10 → no aplica', requiereAjustesRestringidos(huaweiViejo), false)
check('Nativo antiguo sin datos → condicional', requiereAjustesRestringidos(null), null)
check('AppOp ya permitido gana a la APK local',
  requiereAjustesRestringidos({ ...xiaomi, restrictedSettings: 'allowed' }), false)

titulo('Pasos')
const g1 = construirGuia(xiaomi)
check('restringido: tres pasos', g1.pasos.length, 3)
check('el intento va primero', g1.pasos[0].id, 'intento')
check('luego los ajustes restringidos', g1.pasos[1].id, 'restringidos')
check('y abre la información de la app', g1.pasos[1].accion, 'info-app')
check('la ruta es la de Xiaomi', g1.pasos[1].ruta.includes('Administrar aplicaciones'), true)
check('sin aviso condicional', g1.condicional, '')
check('consejo de Autoinicio', g1.consejo.includes('Autoinicio'), true)

const g2 = construirGuia(samsungTienda)
check('tienda: un solo paso', g2.pasos.length, 1)
check('ese paso abre el acceso', g2.pasos[0].accion, 'acceso')

const g3 = construirGuia(pixelDesconocido)
check('desconocido: un paso + condicional', g3.pasos.length === 1 && g3.condicional.length > 0, true)
check('la ruta manual sugiere el buscador', g3.rutaManual.includes('buscador de Ajustes'), true)

titulo('Dispositivo')
check('Xiaomi', describirDispositivo(xiaomi), 'Xiaomi 23090RA98G · HyperOS 1.0 · Android 14')
check('One UI 60100 → 6.1', describirDispositivo(samsungTienda), 'Samsung SM-S918B · One UI 6.1 · Android 14')
check('EMUI', describirDispositivo(huaweiViejo), 'HUAWEI ELS-NX9 · EMUI 12.0.0 · Android 10')
check('Pixel sin capa', describirDispositivo(pixelDesconocido), 'Google Pixel 8 · Android 15')

console.log()
console.log(fallos ? `✗ ${fallos} de ${total} comprobaciones fallan` : `✓ ${total} comprobaciones correctas`)
if (fallos) process.exit(1)
