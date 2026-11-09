/**
 * Diagnóstico guiado «¿por qué no detecta?».
 *
 * Lógica pura: dado el estado que lee la pantalla (permisos del sistema, sesión
 * de Spotify, lectura por API) decide qué comprobaciones salen bien, cuáles no y
 * qué arreglo de un toque se ofrece. No toca el plugin ni el DOM; la pantalla
 * (DiagnosticoPanel.vue) lee el estado, llama a esto y ejecuta el arreglo.
 *
 * Estados de cada comprobación:
 *   ok     correcto
 *   fallo  problema que impide detectar
 *   aviso  problema menor o recomendación
 *   info   neutro (opcional y apagado)
 *   nd     «No disponible aquí» (no se puede comprobar fuera de la app instalada)
 *
 * Arreglos (`arreglo.id`): reconectar | abrir-acceso | pedir-notificaciones |
 * excluir-bateria | ir-spotify. Sólo se ofrece uno cuando de verdad se puede.
 */

export const SCOPE_HISTORIAL = 'user-read-recently-played'
export const SCOPES_REPRODUCCION = ['user-read-playback-state', 'user-modify-playback-state']

const ERRORES_API = {
  'no-session': { texto: 'La sesión de Spotify ya no es válida.', vincular: true },
  'missing-scope': { texto: 'La sesión no incluye el permiso para leer el historial.', vincular: true },
  forbidden: { texto: 'Spotify rechaza la consulta: tu cuenta no está autorizada.', vincular: false },
  'rate-limit': { texto: 'Spotify ha pedido esperar un poco; se reintenta sola.', vincular: false },
  network: { texto: 'No se pudo consultar a Spotify; se reintenta sola.', vincular: false },
  error: { texto: 'La última consulta falló; se reintenta sola.', vincular: false }
}

const NO_DISPONIBLE = 'No disponible aquí: sólo se puede comprobar en la app instalada.'

function item (id, estado, titulo, detalle, arreglo = null) {
  return { id, estado, titulo, detalle, arreglo }
}

/** Permisos concedidos como lista; `null` si la sesión no los dice (token antiguo). */
export function permisosDeSesion (scope) {
  if (typeof scope !== 'string' || !scope.trim()) return null
  return scope.trim().split(/\s+/)
}

function comprobarServicio (estado) {
  const p = estado.permisos
  if (!estado.nativo || !p) {
    return item('servicio', 'nd', 'Servicio de notificaciones', NO_DISPONIBLE)
  }
  if (!p.listenerEnabled) {
    return item('servicio', 'fallo', 'Sin acceso a notificaciones',
      'Sin él, Skippify no ve qué suena. Concédelo en los ajustes del sistema.',
      { id: 'abrir-acceso', etiqueta: 'Abrir el acceso' })
  }
  if (!p.listenerConnected) {
    if (estado.capacidades?.reconectar !== false) {
      return item('servicio', 'fallo', 'Servicio sin conectar',
        'Android no ha enlazado el servicio y no llega ninguna canción.',
        { id: 'reconectar', etiqueta: 'Reconectar' })
    }
    // Servicio nativo antiguo, sin el método de reconexión: lo que queda a mano
    // es apagar y encender el acceso en los ajustes.
    return item('servicio', 'fallo', 'Servicio sin conectar',
      'Apaga y vuelve a encender el acceso de Skippify.',
      { id: 'abrir-acceso', etiqueta: 'Abrir el acceso' })
  }
  return item('servicio', 'ok', 'Servicio conectado', 'Android entrega a Skippify las notificaciones.')
}

function comprobarNotificaciones (estado) {
  const p = estado.permisos
  if (!estado.nativo || !p) {
    return item('notificaciones', 'nd', 'Mostrar notificaciones', NO_DISPONIBLE)
  }
  if (!p.postNotificationsGranted) {
    return item('notificaciones', 'fallo', 'Notificaciones bloqueadas',
      'Sin él, Android puede parar el servicio en segundo plano.',
      { id: 'pedir-notificaciones', etiqueta: 'Permitir notificaciones' })
  }
  return item('notificaciones', 'ok', 'Notificaciones permitidas', 'El servicio puede mantenerse activo en segundo plano.')
}

function comprobarBateria (estado) {
  const p = estado.permisos
  if (!estado.nativo || !p) {
    return item('bateria', 'nd', 'Optimización de batería', NO_DISPONIBLE)
  }
  if (!p.batteryOptimizationIgnored) {
    return item('bateria', 'aviso', 'Batería sin excluir',
      'Android puede pausar Skippify con la pantalla apagada.',
      { id: 'excluir-bateria', etiqueta: 'Excluir de la optimización' })
  }
  return item('bateria', 'ok', 'Batería excluida', 'Android no pausa Skippify en segundo plano.')
}

function comprobarSpotify (estado, ahora) {
  const s = estado.spotify
  if (!s || !s.conectada) {
    return item('spotify', 'aviso', 'Spotify sin vincular',
      'Sin ella no hay lectura por API ni macros; las notificaciones siguen.',
      { id: 'ir-spotify', etiqueta: 'Ir a vincular' })
  }
  const caducado = Number(s.expiresAt || 0) > 0 && Number(s.expiresAt) <= ahora
  if (caducado && !s.tieneRefresh) {
    return item('spotify', 'fallo', 'La sesión de Spotify caducó',
      'No se renueva sola: vuelve a iniciar sesión.',
      { id: 'ir-spotify', etiqueta: 'Iniciar sesión otra vez' })
  }
  const permisos = permisosDeSesion(s.scope)
  if (permisos) {
    if (!permisos.includes(SCOPE_HISTORIAL)) {
      return item('spotify', 'aviso', 'Falta el permiso de historial',
        'Inicia sesión de nuevo para concederlo.',
        { id: 'ir-spotify', etiqueta: 'Iniciar sesión otra vez' })
    }
    const sinReproduccion = SCOPES_REPRODUCCION.filter(x => !permisos.includes(x))
    if (sinReproduccion.length) {
      return item('spotify', 'aviso', 'Falta el permiso de reproducción',
        'Inicia sesión de nuevo para concederlo.',
        { id: 'ir-spotify', etiqueta: 'Iniciar sesión otra vez' })
    }
  }
  return item('spotify', 'ok', 'Sesión de Spotify correcta',
    permisos ? 'Con permiso de historial y de reproducción.' : 'Vinculada; el token no detalla sus permisos.')
}

function comprobarApi (estado) {
  const a = estado.api
  if (!estado.nativo || !a) {
    return item('api', 'nd', 'Lectura por API de Spotify', NO_DISPONIBLE)
  }
  if (!a.enabled) {
    return item('api', 'info', 'Lectura por API desactivada',
      'Opcional: recoge escuchas de otros dispositivos. Se activa en Inicio.',
      { id: 'ir-spotify', etiqueta: 'Ir a Inicio' })
  }
  if (a.lastError) {
    const e = ERRORES_API[a.lastError] || ERRORES_API.error
    return item('api', 'fallo', 'La lectura por API falla', e.texto,
      e.vincular ? { id: 'ir-spotify', etiqueta: 'Iniciar sesión otra vez' } : null)
  }
  return item('api', 'ok', 'Lectura por API activa', 'Las consultas a Spotify se hacen sin errores.')
}

/**
 * Evalúa el estado y devuelve `{ items, problemas, resumen }`.
 *
 * estado = {
 *   nativo: boolean,
 *   permisos: { listenerEnabled, listenerConnected, postNotificationsGranted, batteryOptimizationIgnored } | null,
 *   spotify: { conectada, scope, tieneRefresh, expiresAt } | null,
 *   api: { enabled, lastError } | null,
 *   capacidades: { reconectar } (opcional)
 * }
 */
export function evaluarDiagnostico (estado = {}, ahora = Date.now()) {
  const items = [
    comprobarServicio(estado),
    comprobarNotificaciones(estado),
    comprobarBateria(estado),
    comprobarSpotify(estado, ahora),
    comprobarApi(estado)
  ]
  const problemas = items.filter(i => i.estado === 'fallo' || i.estado === 'aviso').length
  const comprobadas = items.filter(i => i.estado !== 'nd').length

  let resumen
  if (!comprobadas) {
    resumen = 'Ninguna comprobación está disponible en el navegador: ábrelo en la app instalada.'
  } else if (!problemas) {
    resumen = 'Todo está en orden. Si aun así no detecta, reproduce una canción unos segundos y vuelve a comprobar.'
  } else {
    resumen = problemas === 1
      ? 'Hay 1 problema. Arréglalo con el botón de debajo.'
      : `Hay ${problemas} problemas. Arréglalos con los botones de debajo.`
  }
  return { items, problemas, resumen }
}
