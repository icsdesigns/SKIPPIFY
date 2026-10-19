/**
 * Guía para conceder el acceso a notificaciones, adaptada al dispositivo.
 *
 * Funciones puras: reciben lo que devuelve `NotifListener.getDeviceInfo()` (o
 * nada, si el nativo es antiguo) y deciden qué pasos enseñar. Viven fuera del
 * componente para poder probarlas con Node a secas (scripts/smoke-acceso.mjs).
 *
 * Por qué hace falta una guía y no basta con un botón
 * ───────────────────────────────────────────────────
 * Skippify se instala desde una APK, no desde Play Store. Desde Android 13 el
 * sistema marca esas instalaciones («archivo local» o «archivo descargado») y
 * les bloquea los ajustes más delicados —acceso a notificaciones y
 * accesibilidad— con el aviso «Ajuste restringido». Se desbloquea a mano desde
 * Información de la app → menú de tres puntos → «Permitir ajustes
 * restringidos», y esa opción NO aparece hasta que el usuario ha intentado
 * activar el interruptor al menos una vez. De ahí el orden de los pasos.
 *
 * Las rutas de Ajustes cambian de una capa a otra y de una versión a otra, así
 * que se dan como orientación («suele estar en») y siempre se acompañan del
 * buscador de Ajustes, que es lo único que funciona en todas.
 */

/** Instaladores de tienda: con ellos no hay ajustes restringidos. */
const INSTALADORES_TIENDA = new Set([
  'com.android.vending', // Play Store
  'com.sec.android.app.samsungapps', // Galaxy Store
  'com.xiaomi.market', // GetApps
  'com.xiaomi.mipicks',
  'com.huawei.appmarket', // AppGallery
  'com.hihonor.appmarket',
  'com.heytap.market', // Oppo / Realme / OnePlus
  'com.oppo.market',
  'com.bbk.appstore', // vivo
  'com.amazon.venezia'
])

const NOMBRES_CAPA = {
  hyperos: 'HyperOS',
  miui: 'MIUI',
  oneui: 'One UI',
  magicos: 'MagicOS',
  emui: 'EMUI',
  realmeui: 'Realme UI',
  coloros: 'ColorOS',
  oxygenos: 'OxygenOS',
  funtouch: 'Funtouch OS',
  originos: 'OriginOS'
}

/**
 * Familia de fabricante: agrupa las marcas que comparten capa y, por tanto,
 * rutas de Ajustes.
 */
export function familiaDispositivo (info) {
  const rom = (info?.rom || '').toLowerCase()
  const marca = `${info?.manufacturer || ''} ${info?.brand || ''}`.toLowerCase()
  if (rom === 'hyperos' || rom === 'miui' || /xiaomi|redmi|poco/.test(marca)) return 'xiaomi'
  if (rom === 'oneui' || /samsung/.test(marca)) return 'samsung'
  if (rom === 'coloros' || rom === 'realmeui' || rom === 'oxygenos' || /oppo|realme|oneplus/.test(marca)) return 'oppo'
  if (rom === 'magicos' || /honor/.test(marca)) return 'honor'
  if (rom === 'emui' || /huawei/.test(marca)) return 'huawei'
  if (rom === 'funtouch' || rom === 'originos' || /vivo|iqoo/.test(marca)) return 'vivo'
  if (/motorola|lenovo/.test(marca)) return 'motorola'
  if (/google/.test(marca)) return 'pixel'
  return 'generico'
}

/** Versión legible de la capa: «V14» → «14», «EmotionUI_12.0.0» → «12.0.0». */
function versionCapa (rom, raw) {
  const v = String(raw || '').trim()
  if (!v) return ''
  if (rom === 'miui') return v.replace(/^V/i, '')
  if (rom === 'hyperos') return v.replace(/^OS/i, '')
  if (rom === 'emui') return v.replace(/^EmotionUI_?/i, '')
  if (rom === 'oneui' && /^\d{5}$/.test(v)) {
    // `ro.build.version.oneui` viene como 60100 → 6.1
    const n = Number(v)
    const mayor = Math.floor(n / 10000)
    const menor = Math.floor((n % 10000) / 100)
    return `${mayor}.${menor}`
  }
  return v.replace(/^V/i, '')
}

/** «Xiaomi 2201117TG · HyperOS 1.0 · Android 14» */
export function describirDispositivo (info) {
  if (!info) return ''
  const fabricante = String(info.manufacturer || info.brand || '').trim()
  const fab = fabricante ? fabricante.charAt(0).toUpperCase() + fabricante.slice(1) : ''
  const modelo = String(info.model || '').trim()
  const nombre = modelo.toLowerCase().startsWith(fabricante.toLowerCase()) ? modelo : [fab, modelo].filter(Boolean).join(' ')
  const partes = [nombre]
  const rom = (info.rom || '').toLowerCase()
  if (NOMBRES_CAPA[rom]) {
    const v = versionCapa(rom, info.romVersion)
    partes.push(v ? `${NOMBRES_CAPA[rom]} ${v}` : NOMBRES_CAPA[rom])
  }
  if (info.release) partes.push(`Android ${info.release}`)
  return partes.filter(Boolean).join(' · ')
}

/** ¿Se instaló desde un archivo y no desde una tienda? */
export function instaladaDesdeApk (info) {
  if (!info) return null
  const fuente = info.packageSource || ''
  if (fuente === 'local-file' || fuente === 'downloaded-file') return true
  if (fuente === 'store') return false
  const inst = info.installer || ''
  if (INSTALADORES_TIENDA.has(inst)) return false
  return true
}

/**
 * ¿Va a encontrarse el usuario el bloqueo de «Ajuste restringido»?
 *
 * true  = sí (o ya lo tiene delante)
 * false = no: Android anterior al 13, instalación de tienda o ya permitido
 * null  = no se puede saber; la guía lo plantea como condicional
 */
export function requiereAjustesRestringidos (info) {
  if (!info || !Number.isFinite(Number(info.sdkInt))) return null
  if (Number(info.sdkInt) < 33) return false
  if (info.restrictedSettings === 'restricted') return true
  if (info.restrictedSettings === 'allowed') return false
  const apk = instaladaDesdeApk(info)
  return apk === false ? false : null
}

/**
 * Cómo llegar a la ficha de Skippify en cada capa, donde está el menú de tres
 * puntos con «Permitir ajustes restringidos».
 */
const RUTA_RESTRINGIDOS = {
  xiaomi: 'Ajustes → Aplicaciones → Administrar aplicaciones → Skippify.',
  samsung: 'Ajustes → Aplicaciones → Skippify.',
  oppo: 'Ajustes → Aplicaciones → Gestión de aplicaciones → Skippify.',
  honor: 'Ajustes → Aplicaciones → Aplicaciones → Skippify.',
  huawei: 'Ajustes → Aplicaciones → Aplicaciones → Skippify.',
  vivo: 'Ajustes → Aplicaciones → Administrar aplicaciones → Skippify.',
  motorola: 'Ajustes → Aplicaciones → Skippify.',
  pixel: 'Ajustes → Aplicaciones → Skippify.',
  generico: 'Ajustes → Aplicaciones → Skippify.'
}

/** Dónde está el acceso a notificaciones si el botón no lleva directo. */
const RUTA_ACCESO = {
  xiaomi: 'Ajustes → Privacidad y protección (en MIUI: Contraseñas y seguridad → Privacidad) → Permisos especiales → Acceso a notificaciones.',
  samsung: 'Ajustes → Notificaciones → Ajustes avanzados → Notificaciones de apps y dispositivos. En One UI antiguas: Ajustes → Aplicaciones → Acceso especial → Acceso a notificaciones.',
  oppo: 'Ajustes → Aplicaciones → Acceso especial de aplicaciones → Acceso a notificaciones.',
  honor: 'Ajustes → Aplicaciones → Acceso especial → Acceso a notificaciones.',
  huawei: 'Ajustes → Aplicaciones → Acceso especial → Acceso a notificaciones.',
  vivo: 'Ajustes → Aplicaciones → Acceso especial a aplicaciones → Acceso a notificaciones.',
  motorola: 'Ajustes → Notificaciones → Notificaciones de dispositivos y aplicaciones.',
  pixel: 'Ajustes → Notificaciones → Notificaciones de dispositivos y aplicaciones.',
  generico: 'Ajustes → Aplicaciones → Acceso especial de aplicaciones → Acceso a notificaciones.'
}

/**
 * Ajustes propios de cada capa que no desbloquean la app pero evitan que el
 * sistema retire el acceso o duerma el servicio tras reiniciar.
 */
const CONSEJOS_CAPA = {
  xiaomi: 'Activa también «Autoinicio» en la ficha de Skippify: sin él, MIUI y HyperOS pueden desconectar el acceso tras reiniciar.',
  huawei: 'En Batería → Inicio de aplicaciones, pon Skippify en «Gestionar manualmente» con las tres opciones activas.',
  honor: 'En Batería → Inicio de aplicaciones, pon Skippify en «Gestionar manualmente» con las tres opciones activas.',
  oppo: 'En la ficha de Skippify → Uso de batería, permite la actividad en segundo plano y el inicio automático.',
  vivo: 'En Batería → Alto consumo en segundo plano, permite Skippify, y activa su inicio automático.',
  samsung: 'En la ficha de Skippify → Batería, elige «Sin restricciones» para que One UI no la ponga en suspensión.'
}

/**
 * Pasos que enseña la pantalla de bloqueo.
 *
 * @returns {{
 *   familia: string,
 *   dispositivo: string,
 *   restringido: boolean|null,
 *   pasos: Array<{ id: string, titulo: string, texto: string, ruta?: string, accion: 'acceso'|'info-app', etiqueta: string }>,
 *   condicional: string,
 *   rutaManual: string,
 *   consejo: string
 * }}
 */
export function construirGuia (info) {
  const familia = familiaDispositivo(info)
  const restringido = requiereAjustesRestringidos(info)
  const pasos = []

  if (restringido) {
    pasos.push({
      id: 'intento',
      titulo: 'Intenta activarlo una vez',
      texto: 'Toca Skippify y su interruptor. Android mostrará «Ajuste restringido» porque la app no viene de Play Store: pulsa Aceptar y vuelve. Este intento es lo que hace aparecer la opción del paso siguiente.',
      accion: 'acceso',
      etiqueta: 'Abrir acceso a notificaciones'
    })
    pasos.push({
      id: 'restringidos',
      titulo: 'Permite los ajustes restringidos',
      texto: 'En la información de Skippify, abre el menú de tres puntos de arriba a la derecha y elige «Permitir ajustes restringidos». Android te pedirá el PIN o la huella.',
      ruta: `Si el botón no la abre: ${RUTA_RESTRINGIDOS[familia]}`,
      accion: 'info-app',
      etiqueta: 'Abrir información de la app'
    })
    pasos.push({
      id: 'activar',
      titulo: 'Activa el acceso',
      texto: 'Ahora el interruptor ya responde: actívalo y confirma en el aviso del sistema.',
      accion: 'acceso',
      etiqueta: 'Activar acceso a notificaciones'
    })
  } else {
    pasos.push({
      id: 'activar',
      titulo: 'Activa el acceso',
      texto: 'Busca Skippify en la lista, activa su interruptor y confirma en el aviso del sistema.',
      accion: 'acceso',
      etiqueta: 'Activar acceso a notificaciones'
    })
  }

  const condicional = restringido === null
    ? `Si el interruptor sale en gris o aparece «Ajuste restringido», es la protección de Android para apps instaladas fuera de Play Store. Pulsa Aceptar, abre la información de la app y, en el menú de tres puntos, elige «Permitir ajustes restringidos». La información de la app está en ${RUTA_RESTRINGIDOS[familia]}`
    : ''

  return {
    familia,
    dispositivo: describirDispositivo(info),
    restringido,
    pasos,
    condicional,
    rutaManual: `${RUTA_ACCESO[familia]} También puedes escribir «Acceso a notificaciones» en el buscador de Ajustes.`,
    consejo: CONSEJOS_CAPA[familia] || ''
  }
}
