/**
 * useLocalLeague — Comunidad sin base de datos (modo LocalHost).
 *
 * Alternativa a useLeague.js (Firebase), que no se toca. Aquí cada grupo vive
 * en los propios móviles: el kit `localhost-core` guarda una copia completa del
 * grupo en IndexedDB y la sincroniza cifrada por relays públicos de Nostr.
 * No hay cuenta, ni servidor propio, ni Cloud Function.
 *
 * Diferencias con el modo Firebase que conviene tener presentes:
 *   · El ranking lo calcula cada móvil con las escuchas que ha recibido (misma
 *     puntuación: firebase/functions/scoring.js), así que es «provisional»
 *     hasta que todos los miembros han sincronizado.
 *   · Las escuchas se publican desde JS, al abrir la app o al volver a ella: no
 *     hay subida con la app cerrada (eso es LigaBackground, sólo de Firebase).
 *   · El registro es de sólo añadir: una escucha se publica cuando ya terminó,
 *     con sus cifras definitivas, y no se corrige después.
 *
 * El núcleo (libsodium en WASM) se importa bajo demanda: quien no usa este
 * modo no paga su peso en el arranque.
 */
import { computed, reactive, ref } from 'vue'
import { useEventStore } from '@/stores/events'
import { IdbStorage, deleteSlot } from '@/lib/localhost/idbStorage'
import { NostrTransport, DEFAULT_RELAYS } from '@/lib/localhost/nostrTransport'
import { esCodigoExpres, formatearCodigo, generarCodigo, publicarExpres, resolverExpres, EXPRES_TTL_MS } from '@/lib/localhost/expres'
import { actividadPorPersona, elegirExpulsados, LATIDO_MS, REVISION_MS } from '@/lib/localhost/inactividad'
import { PERIODOS, DIAS_PUBLICADOS, decodeEscuchas, encodeEscuchas, partirEnLotes, ventanaPeriodo, puntuarSemana } from '@/lib/localhost/escuchas'
import {
  COLL_FUNCIONALIDAD, TOPE_FILAS, SUBIDA_TRAS_RESPUESTA_MS, desempaquetarRegistro, empaquetarRegistro,
  puedeComprimir, registroMeta, registrosDeSubida, resumirFuncionalidad, tocaSubir
} from '@/lib/localhost/funcionalidad'

const STATE_KEY = 'skippify-localhost-state'
const MAX_GROUPS = 5
const COLL = 'escuchas'
const COLL_GRUPO = 'grupo'
const COLL_PERFIL = 'perfil'
const COLL_PRESENCIA = 'presencia'
const SYNC_INTERVAL_MS = 60_000
/** Cada cuánto se mira si toca sincronizar (el ritmo real lo decide `tick`). */
const TICK_MS = 15_000
/**
 * Mientras alguien espera —un invitado que aún no ha entrado, o un admin que
 * acaba de dar una invitación— se sincroniza cada tick en vez de cada minuto:
 * la entrada depende de que los dos móviles coincidan en los relays.
 */
const FAST_WINDOW_MS = 10 * 60_000
/**
 * Tras pedir entrar (invitación, vinculación o copia) no se espera al ritmo
 * normal ni a que el usuario pulse «Actualizar»: se sincroniza cada pocos
 * segundos hasta que el grupo queda listo, o durante este tiempo como máximo.
 * Pasado el plazo sigue el vigilante de siempre.
 */
const ENTRADA_CADA_MS = 4_000
const ENTRADA_DURANTE_MS = 3 * 60_000
/**
 * Sólo se publican las escuchas de los últimos días. El ranking mira la semana y
 * el mes en curso: con 40 días el mes natural más largo (31) cabe entero. Como el
 * registro deduplica por id de escucha, ampliar la ventana hace que cada móvil
 * publique por sí solo lo que le faltaba del mes (una sola vez).
 */
const PUBLISH_WINDOW_MS = DIAS_PUBLICADOS * 24 * 3600 * 1000
/** Margen tras el final teórico de la canción para dar su `ms_played` por definitivo. */
const FINAL_GRACE_MS = 3 * 60 * 1000

const state = ref({
  displayName: '',
  /** [{ groupId, name, role, relays, kitGroupId }] — `groupId` es la ranura local (`lh_…`). */
  groups: [],
  activeGroupId: '',
  lastSyncAt: null
})

const syncing = ref(false)
const error = ref('')
const message = ref('')
/** { [groupId]: 'ready' | 'joining' | 'restoring' } */
const statuses = reactive({})
/** { [groupId]: [{ uid, displayName, role, you }] } */
const members = reactive({})
/** { [groupId]: { weekKey, members, provisional, cual } } — la última consultada. */
const leaderboards = reactive({})
/** { [groupId]: { semana, mes } } — cada periodo con la forma de arriba. */
const semanas = reactive({})
/** { [groupId]: ms de la última sincronización con éxito } */
const lastSyncByGroup = reactive({})
/** { [groupId]: [{ id, nombre, yo, version, subidoEn, filas, total }] } — registros de funcionalidad. */
const funcionalidad = reactive({})

const runtimes = new Map()
let kitPromise = null
let watchTimer = null
let lastFullSync = 0
let fastUntil = 0
let syncAllPromise = null

function loadState () {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STATE_KEY) : null
    if (!raw) return
    const parsed = JSON.parse(raw)
    state.value = {
      ...state.value,
      ...parsed,
      groups: Array.isArray(parsed.groups) ? parsed.groups.filter(g => g?.groupId) : []
    }
  } catch { /* estado ilegible: se empieza limpio */ }
}

function saveState () {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state.value))
  } catch { /* sin almacenamiento: se pierde sólo la caché de la lista */ }
  void avisarServicio()
}

// ── Servicio en segundo plano (Android) ─────────────────────────────────────
//
// Con la app cerrada, un WebView sin interfaz que vive en el servicio en primer
// plano (LocalHostBackground.java, página bg.html) sigue sincronizando, para que
// una invitación se acepte en segundos aunque nadie tenga la app abierta. Sólo
// UNO de los dos mundos escribe a la vez: el nativo para al volver la app a
// primer plano y `acquire()` espera a que haya parado. Si el servicio llegó a
// escribir, los grupos que esta página tenía en memoria están desfasados (llaves
// y miembros nuevos) y se vuelven a abrir desde IndexedDB.

function pluginBg () {
  return typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LocalHostBg : null
}

async function avisarServicio () {
  const bg = pluginBg()
  if (!bg?.configure) return
  try { await bg.configure({ enabled: state.value.groups.length > 0 }) } catch { /* versión nativa sin servicio */ }
}

let acquirePromise = null

function ensureMain () {
  if (acquirePromise) return acquirePromise
  const bg = pluginBg()
  if (!bg?.acquire) return Promise.resolve()
  acquirePromise = (async () => {
    try {
      const r = await bg.acquire()
      if (r?.bgRan) liberarRuntimes()
    } catch { /* sin servicio: nada que esperar */ }
  })()
  return acquirePromise
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    // Al pasar a segundo plano el servicio nativo puede tomar el relevo.
    if (document.visibilityState === 'hidden') acquirePromise = null
  })
}

loadState()

function loadKit () {
  if (!kitPromise) {
    kitPromise = Promise.all([
      import('@/vendor/localhost-core/index.ts'),
      import('@/vendor/localhost-core/invite.ts')
    ]).then(([core, invite]) => ({ ...core, decodeInvite: invite.decodeInvite, decodeLinkCode: invite.decodeLinkCode }))
  }
  return kitPromise
}

function newSlot () {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return 'lh_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

function findGroup (groupId) {
  return state.value.groups.find(g => g.groupId === groupId) || null
}

function clearStatus () {
  error.value = ''
  message.value = ''
}

function mapError (err, fallback = 'Ocurrió un error inesperado.') {
  const text = (err?.message || '').toString()
  if (/sincronizando/i.test(text)) return 'Sincronizando… Este móvil aún no tiene la llave del grupo; reintenta en un momento.'
  if (/restaurando/i.test(text)) return 'Restaurando: sincroniza primero para poder escribir.'
  if (/ningún relay/i.test(text)) return 'No hay conexión con los relays. Se reintentará solo.'
  return text || fallback
}

function normalizeName (value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ')
}

function validateName (name) {
  if (name.length < 3) {
    error.value = 'Escribe un nombre de usuario de al menos 3 caracteres.'
    return false
  }
  return true
}

/** Abre (o reutiliza) el grupo del kit asociado a una ranura. */
/** Cierra los grupos abiertos: la próxima vez se leen de nuevo de IndexedDB. */
function liberarRuntimes () {
  for (const rt of runtimes.values()) {
    try { rt.storage.close() } catch { /* nada */ }
  }
  runtimes.clear()
}

async function openRuntime (groupId) {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') await ensureMain()
  const cached = runtimes.get(groupId)
  if (cached) return cached
  const meta = findGroup(groupId)
  if (!meta) throw new Error('Grupo desconocido.')
  const kit = await loadKit()
  const storage = new IdbStorage(groupId)
  const transport = new NostrTransport(() => (meta.relays?.length ? meta.relays : DEFAULT_RELAYS))
  const group = await kit.LocalHost.openGroup({ storage, transport })
  const rt = { kit, storage, transport, group }
  runtimes.set(groupId, rt)
  statuses[groupId] = estadoDe(group)
  return rt
}

/** Estado del grupo para la interfaz: `expelled` si ya no somos miembros. */
function estadoDe (group) {
  try { if (group.removedInOwnView()) return 'expelled' } catch { /* sin vista aún */ }
  return group.status
}

/**
 * Nombre del grupo, de la colección `grupo`. Lo pone el creador al crearlo y
 * cualquier administrador puede cambiarlo anotando uno nuevo: manda la anotación
 * más reciente de un administrador. Las de quien no lo es se ignoran (cualquier
 * miembro puede escribir en la colección), y si ninguna es de un administrador
 * —grupos de versiones anteriores— se queda la más antigua, como antes.
 */
function nombreDelGrupo (group) {
  const items = group.records(COLL_GRUPO).items().filter(i => !i.removed && typeof i.data?.nombre === 'string')
  if (!items.length) return ''
  const porHlc = (a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0)
  // El autor de una anotación es el dispositivo, no la persona.
  const admins = new Set(group.members().filter(m => !m.removed && m.admin).flatMap(m => [m.person, ...(m.devices || [])]))
  const deAdmin = items.filter(i => admins.has(i.author)).sort(porHlc)
  if (deAdmin.length) return deAdmin[deAdmin.length - 1].data.nombre
  return items.sort(porHlc)[0].data.nombre
}

/**
 * Nombre visible de cada persona. El del kit sólo existe para quien entra por
 * invitación (el creador no tiene), así que cada miembro anota el suyo en la
 * colección `perfil`; gana la anotación más reciente de cada persona.
 */
function nombresDe (group) {
  const porPersona = new Map()
  for (const item of group.records(COLL_PERFIL).items()) {
    if (item.removed || typeof item.data?.u !== 'string' || typeof item.data?.nombre !== 'string') continue
    const previo = porPersona.get(item.data.u)
    if (!previo || item.hlc > previo.hlc) porPersona.set(item.data.u, { hlc: item.hlc, nombre: item.data.nombre })
  }
  return new Map(group.members().filter(m => !m.removed).map(m => [m.person, porPersona.get(m.person)?.nombre || m.name || '']))
}

/** Si el nombre anotado no coincide con el que tengo, lo anoto (una sola vez por cambio). */
async function asegurarPerfil (group) {
  const mio = nombresDe(group).get(group.me.person)
  const quiero = state.value.displayName
  if (!quiero || mio === quiero || group.status !== 'ready' || !group.canSeal()) return
  await group.records(COLL_PERFIL).add({ u: group.me.person, nombre: quiero })
}

function refreshMembers (groupId, group) {
  statuses[groupId] = estadoDe(group)
  const nombres = nombresDe(group)
  const list = group.members()
    .filter(m => !m.removed)
    .map(m => ({
      uid: m.person,
      displayName: nombres.get(m.person) || m.name,
      role: m.admin ? 'owner' : 'member',
      you: m.person === group.me.person
    }))
  members[groupId] = list
  try { refrescarFuncionalidad(groupId, group, nombres) } catch { /* solo informativo */ }
  const meta = findGroup(groupId)
  if (meta) {
    meta.role = list.find(m => m.you)?.role || meta.role
    const nombre = nombreDelGrupo(group)
    if (nombre) meta.name = nombre
    saveState()
  }
}

async function createGroup ({ displayName, groupName } = {}) {
  clearStatus()
  const name = normalizeName(displayName)
  if (!validateName(name)) return null
  if (state.value.groups.length >= MAX_GROUPS) {
    error.value = `Puedes estar en ${MAX_GROUPS} grupos como máximo.`
    return null
  }
  const slot = newSlot()
  try {
    const kit = await loadKit()
    const storage = new IdbStorage(slot)
    const transport = new NostrTransport(() => DEFAULT_RELAYS)
    const label = normalizeName(groupName) || `Grupo de ${name}`
    const group = await kit.LocalHost.createGroup(
      { storage, transport },
      { name: label, relays: DEFAULT_RELAYS, deviceName: name }
    )
    await group.records(COLL_GRUPO).add({ nombre: label })
    await asegurarPerfil(group)
    state.value.displayName = name
    state.value.groups = [...state.value.groups, {
      groupId: slot, name: label, role: 'owner', relays: [...DEFAULT_RELAYS], kitGroupId: group.id
    }]
    state.value.activeGroupId = slot
    saveState()
    runtimes.set(slot, { kit, storage, transport, group })
    refreshMembers(slot, group)
    message.value = 'Grupo creado. Genera una invitación para tus amigos.'
    startWatch()
    return slot
  } catch (err) {
    await deleteSlot(slot)
    error.value = mapError(err, 'No fue posible crear el grupo.')
    return null
  }
}

async function joinGroup ({ inviteCode, displayName } = {}) {
  clearStatus()
  const name = normalizeName(displayName)
  if (!validateName(name)) return null
  if (state.value.groups.length >= MAX_GROUPS) {
    error.value = `Puedes estar en ${MAX_GROUPS} grupos como máximo.`
    return null
  }
  let code = (inviteCode || '').toString().trim()
  const slot = newSlot()
  try {
    const kit = await loadKit()
    if (esCodigoExpres(code)) {
      // Código corto: la invitación larga está cifrada en los relays bajo ese código.
      let hallada = null
      try {
        hallada = await resolverExpres(new NostrTransport(() => DEFAULT_RELAYS), code)
      } catch {
        error.value = 'No hay conexión con los relays. Inténtalo de nuevo en un momento.'
        return null
      }
      if (!hallada) {
        error.value = 'No encontramos ese código: puede haber caducado (valen 1 hora) o estar mal escrito.'
        return null
      }
      code = hallada.invitacion
    }
    let invite
    try {
      invite = kit.decodeInvite(code)
    } catch {
      error.value = 'El código de invitación no es válido.'
      return null
    }
    if (state.value.groups.some(g => g.kitGroupId === invite.group)) {
      error.value = 'Ya perteneces a ese grupo.'
      return null
    }
    const relays = invite.relays?.length ? invite.relays : DEFAULT_RELAYS
    const storage = new IdbStorage(slot)
    const transport = new NostrTransport(() => relays)
    const group = await kit.LocalHost.joinGroup({ storage, transport }, code, name)
    state.value.displayName = name
    state.value.groups = [...state.value.groups, {
      groupId: slot, name: 'Uniéndose…', role: 'member', relays: [...relays], kitGroupId: group.id
    }]
    state.value.activeGroupId = slot
    saveState()
    runtimes.set(slot, { kit, storage, transport, group })
    statuses[slot] = estadoDe(group)
    message.value = 'Solicitud enviada. Entrarás cuando algún miembro del grupo abra la app.'
    void vigilarEntrada(slot)
    acelerar()
    return slot
  } catch (err) {
    await deleteSlot(slot)
    error.value = mapError(err, 'No fue posible unirse al grupo.')
    return null
  }
}

/** Salir = olvidar la copia local. Los demás siguen viéndote hasta que un admin te expulse. */
async function leaveGroup (groupId) {
  clearStatus()
  const rt = runtimes.get(groupId)
  try { rt?.storage.close() } catch { /* nada */ }
  runtimes.delete(groupId)
  await deleteSlot(groupId)
  state.value.groups = state.value.groups.filter(g => g.groupId !== groupId)
  if (state.value.activeGroupId === groupId) state.value.activeGroupId = state.value.groups[0]?.groupId || ''
  delete members[groupId]
  delete leaderboards[groupId]
  delete semanas[groupId]
  delete statuses[groupId]
  saveState()
  message.value = 'Has salido del grupo. Para volver a entrar necesitas otra invitación.'
  return true
}

/**
 * Expulsa a un miembro (sólo administradores). El kit rota la llave del grupo,
 * así que el expulsado deja de poder leer lo que se publique a partir de ahora.
 */
async function expulsarMiembro (uid, groupId = state.value.activeGroupId) {
  clearStatus()
  try {
    const { group } = await openRuntime(groupId)
    const nombre = nombresDe(group).get(uid) || 'Miembro'
    await group.removePerson(uid)
    refreshMembers(groupId, group)
    acelerar()
    message.value = `${nombre} ya no está en el grupo.`
    return true
  } catch (err) {
    error.value = mapError(err, 'No fue posible expulsar al miembro (sólo pueden los administradores).')
    return false
  }
}

/** Cambia el nombre del grupo (sólo administradores: el resto de miembros lo ignora). */
async function renombrarGrupo (nuevo, groupId = state.value.activeGroupId) {
  clearStatus()
  const nombre = normalizeName(nuevo).slice(0, 32)
  if (nombre.length < 3) {
    error.value = 'El nombre del grupo debe tener al menos 3 caracteres.'
    return false
  }
  try {
    const { group } = await openRuntime(groupId)
    if (!group.me || !group.members().some(m => m.person === group.me.person && m.admin && !m.removed)) {
      error.value = 'Sólo un administrador puede cambiar el nombre del grupo.'
      return false
    }
    if (group.status !== 'ready' || !group.canSeal()) {
      error.value = 'El grupo aún no está listo: inténtalo cuando termine de sincronizar.'
      return false
    }
    await group.records(COLL_GRUPO).add({ nombre })
    refreshMembers(groupId, group)
    acelerar()
    message.value = 'Nombre del grupo cambiado.'
    return true
  } catch (err) {
    error.value = mapError(err, 'No fue posible cambiar el nombre del grupo.')
    return false
  }
}

function setActiveGroup (groupId) {
  if (findGroup(groupId)) {
    state.value.activeGroupId = groupId
    saveState()
  }
}

async function createInvite (groupId = state.value.activeGroupId) {
  clearStatus()
  try {
    const { group } = await openRuntime(groupId)
    const code = await group.createInvite()
    acelerar()
    return code
  } catch (err) {
    error.value = mapError(err, 'No fue posible crear la invitación (sólo pueden los administradores).')
    return ''
  }
}

/**
 * Invitación exprés: un código corto de un solo uso y 1 hora. Debajo va una
 * invitación normal del kit; el código sólo sirve para encontrarla en los relays.
 * Devuelve { codigo, caduca } o null (y deja el motivo en `error`).
 */
async function createExpressInvite (groupId = state.value.activeGroupId) {
  clearStatus()
  const meta = findGroup(groupId)
  const mismos = (a, b) => a.length === b.length && a.every((r, i) => r === b[i])
  if (meta?.relays?.length && !mismos(meta.relays, DEFAULT_RELAYS)) {
    error.value = 'Este grupo usa relays propios: el código exprés sólo funciona con los de siempre. Usa la invitación larga.'
    return null
  }
  try {
    const { group, transport } = await openRuntime(groupId)
    const invitacion = await group.createInvite()
    const codigo = generarCodigo()
    const { caduca } = await publicarExpres(transport, invitacion, codigo)
    acelerar()
    return { codigo: formatearCodigo(codigo), caduca }
  } catch (err) {
    error.value = /relay/i.test(err?.message || '')
      ? 'No se pudo publicar el código: sin conexión con los relays. Inténtalo de nuevo.'
      : mapError(err, 'No fue posible crear la invitación exprés (sólo pueden los administradores).')
    return null
  }
}

async function createLinkCode (groupId = state.value.activeGroupId) {
  clearStatus()
  try {
    const { group } = await openRuntime(groupId)
    const code = await group.createLinkCode()
    acelerar()
    return code
  } catch (err) {
    error.value = mapError(err, 'No fue posible crear el código de vinculación.')
    return ''
  }
}

/** Añade este móvil a una persona que ya está en un grupo (código del móvil antiguo). */
async function linkDevice ({ code, displayName } = {}) {
  clearStatus()
  const name = normalizeName(displayName) || state.value.displayName
  if (!validateName(name)) return null
  const slot = newSlot()
  try {
    const kit = await loadKit()
    const limpio = (code || '').toString().trim()
    let link
    try {
      link = kit.decodeLinkCode(limpio)
    } catch {
      error.value = 'El código de vinculación no es válido.'
      return null
    }
    const relays = link.relays?.length ? link.relays : DEFAULT_RELAYS
    const storage = new IdbStorage(slot)
    const transport = new NostrTransport(() => relays)
    const group = await kit.LocalHost.linkDevice({ storage, transport }, limpio, name)
    state.value.groups = [...state.value.groups, {
      groupId: slot, name: 'Vinculando…', role: 'member', relays: [...relays], kitGroupId: group.id
    }]
    state.value.activeGroupId = slot
    saveState()
    runtimes.set(slot, { kit, storage, transport, group })
    statuses[slot] = estadoDe(group)
    void vigilarEntrada(slot)
    acelerar()
    return slot
  } catch (err) {
    await deleteSlot(slot)
    error.value = mapError(err, 'No fue posible vincular este dispositivo.')
    return null
  }
}

async function exportBackup (password, groupId = state.value.activeGroupId) {
  clearStatus()
  if ((password || '').length < 8) {
    error.value = 'Elige una contraseña de al menos 8 caracteres.'
    return ''
  }
  try {
    const { group } = await openRuntime(groupId)
    return await group.exportBackup(password)
  } catch (err) {
    error.value = mapError(err, 'No fue posible crear la copia de seguridad.')
    return ''
  }
}

async function restoreBackup ({ backup, password, displayName } = {}) {
  clearStatus()
  const name = normalizeName(displayName) || state.value.displayName
  if (!validateName(name)) return null
  const slot = newSlot()
  try {
    const kit = await loadKit()
    const storage = new IdbStorage(slot)
    const transport = new NostrTransport(() => DEFAULT_RELAYS)
    const group = await kit.LocalHost.restore({ storage, transport }, backup, password, name)
    state.value.groups = [...state.value.groups, {
      groupId: slot, name: 'Restaurando…', role: 'member', relays: [...DEFAULT_RELAYS], kitGroupId: group.id
    }]
    state.value.activeGroupId = slot
    saveState()
    runtimes.set(slot, { kit, storage, transport, group })
    statuses[slot] = estadoDe(group)
    void vigilarEntrada(slot)
    acelerar()
    return slot
  } catch (err) {
    await deleteSlot(slot)
    error.value = /contraseña|password|decrypt|descifr/i.test(err?.message || '')
      ? 'La contraseña no es correcta o la copia está dañada.'
      : mapError(err, 'No fue posible restaurar la copia.')
    return null
  }
}

// ── Escuchas ────────────────────────────────────────────────────────────────

function hashId (input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Escuchas locales ya terminadas, en el formato compacto del grupo. */
function escuchasTerminadas (person, ahora, desdeAlmacen = false) {
  const { state: eventState } = useEventStore()
  const events = desdeAlmacen ? eventosDeAlmacen() : (Array.isArray(eventState.events) ? eventState.events : [])
  const out = []
  for (const ev of events) {
    const playedAt = Date.parse(ev?.played_at)
    if (!Number.isFinite(playedAt)) continue
    if (ahora - playedAt > PUBLISH_WINDOW_MS) continue
    const duration = Number(ev?.duration_ms || 0)
    if (ahora < playedAt + Math.max(duration, 0) + FINAL_GRACE_MS) continue
    const msPlayed = Number(ev?.ms_played || 0)
    const measured = Math.max(msPlayed, Number(ev?.resume_anchor_ms || 0))
    const eid = hashId(`${person}|${ev.played_at}|${ev.track || ''}|${ev.artist || ''}|${duration}`)
    out.push([eid, playedAt, (ev.track || '').toString(), (ev.artist || '').toString(), duration, msPlayed, measured])
  }
  return out
}

/**
 * Historial leído directamente de localStorage. El WebView del servicio no ve
 * los cambios que la app hace en su store en memoria, pero sí lo que ha
 * guardado: comparten origen.
 */
function eventosDeAlmacen () {
  try {
    const parsed = JSON.parse(localStorage.getItem('skippify-events') || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Escuchas captadas con la app cerrada, que sólo el código nativo ve (log
 * crudo del listener, ya troceado como hace la subida a Firebase). Sólo existe
 * en el WebView del servicio, que recibe el puente `SkippifyLh`.
 */
function escuchasNativas (person, ahora) {
  try {
    const crudo = window.SkippifyLh?.escuchas?.()
    if (!crudo) return []
    const lista = JSON.parse(crudo)
    const out = []
    for (const e of lista) {
      if (!Number.isFinite(e.playedAtMs) || ahora - e.playedAtMs > PUBLISH_WINDOW_MS) continue
      const eid = hashId(`${person}|${e.playedAt}|${e.track}|${e.artist}|${e.durationMs}`)
      out.push([eid, e.playedAtMs, e.track || '', e.artist || '', e.durationMs || 0, e.msPlayed || 0, e.msPlayed || 0])
    }
    return out
  } catch {
    return []
  }
}

/** Todas las escuchas del grupo, ya decodificadas y sin duplicados: Map persona → tupla[]. */
async function leerEscuchas (group) {
  const porPersona = new Map()
  const vistos = new Set()
  for (const item of group.records(COLL).items()) {
    if (item.removed || !item.data) continue
    const lote = await decodeEscuchas(item.data)
    if (!lote) continue
    for (const tupla of lote.l) {
      const key = `${lote.u}|${tupla[0]}`
      if (vistos.has(key)) continue
      vistos.add(key)
      if (!porPersona.has(lote.u)) porPersona.set(lote.u, [])
      porPersona.get(lote.u).push(tupla)
    }
  }
  return porPersona
}

async function publicarEscuchas (groupId, { desdeFondo = false } = {}) {
  const rt = runtimes.get(groupId)
  if (!rt || rt.group.status !== 'ready' || !rt.group.canSeal()) return 0
  const person = rt.group.me.person
  const propias = await leerEscuchas(rt.group)
  const yaPublicadas = new Set((propias.get(person) || []).map(t => t[0]))
  const ahora = Date.now()
  const candidatas = escuchasTerminadas(person, ahora, desdeFondo)
  if (desdeFondo) candidatas.push(...escuchasNativas(person, ahora))
  const vistas = new Set()
  const nuevas = candidatas.filter((t) => {
    if (yaPublicadas.has(t[0]) || vistas.has(t[0])) return false
    vistas.add(t[0])
    return true
  })
  if (!nuevas.length) return 0
  nuevas.sort((a, b) => a[1] - b[1])
  let publicadas = 0
  for (const lote of partirEnLotes(nuevas)) {
    await rt.group.records(COLL).add(await encodeEscuchas(person, lote))
    publicadas += lote.length
  }
  return publicadas
}

// ── Registros de funcionalidad ──────────────────────────────────────────────
//
// Cada miembro publica la versión de su app (siempre) y, si lo permite en
// Ajustes, su registro de funcionalidad (formato y límites en
// lib/localhost/funcionalidad.js). Todo es secundario respecto al ranking: nunca
// se espera a ello desde la sincronización y cualquier fallo se ignora y se
// reintenta más tarde.

const FUNC_KEY = 'skippify-funcionalidad-subida'
let subiendoFuncionalidad = false

function leerEstadoSubida () {
  try {
    const parsed = JSON.parse(localStorage.getItem(FUNC_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function guardarEstadoSubida (estado) {
  try { localStorage.setItem(FUNC_KEY, JSON.stringify(estado)) } catch { /* se reintentará */ }
}

/** Registros de la colección con la persona sacada de la firma del evento, no del contenido. */
function entradasFuncionalidad (group) {
  const vista = group.membershipView()
  const out = []
  for (const item of group.records(COLL_FUNCIONALIDAD).items()) {
    if (item.removed || !item.data) continue
    const persona = vista.personOf(item.author)
    if (persona) out.push({ id: item.id, persona, hlc: item.hlc, data: item.data })
  }
  return out
}

function refrescarFuncionalidad (groupId, group, nombres = nombresDe(group)) {
  const resumen = resumirFuncionalidad(entradasFuncionalidad(group))
  funcionalidad[groupId] = group.members()
    .filter(m => !m.removed)
    .map((m) => {
      const r = resumen.get(m.person)
      return {
        id: m.person,
        nombre: nombres.get(m.person) || m.name || 'Sin nombre',
        yo: m.person === group.me.person,
        version: r?.version || '',
        subidoEn: r?.completa ? r.subidaEn : 0,
        filas: r?.completa ? r.filas : 0,
        total: r?.completa ? r.total : 0
      }
    })
}

async function publicarFuncionalidad (groupId) {
  // Con la app en segundo plano (WebView del servicio) no hay puente al registro.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  const rt = runtimes.get(groupId)
  if (!rt || rt.group.status !== 'ready' || !rt.group.canSeal() || rt.group.removedInOwnView()) return
  const { group } = rt
  const coll = group.records(COLL_FUNCIONALIDAD)
  const mio = resumirFuncionalidad(entradasFuncionalidad(group)).get(group.me.person)
  const ahora = Date.now()

  // 1. La versión, se comparta o no el registro: se anota al cambiar y se retira la anterior.
  const app = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
  if (app && mio?.version !== app) {
    await coll.add(registroMeta(app, ahora))
    for (const id of mio?.ids.meta || []) await coll.remove(id)
  }

  const reg = await import('@/composables/usePlayLog')
  const { compartir } = await reg.leerAjustesFundido()

  // 2. Compartir apagado: lo ya publicado se retira del grupo.
  if (!compartir) {
    for (const id of mio?.ids.trozos || []) await coll.remove(id)
    // Sin registro publicado no hay "última subida" que respetar: al volver a
    // activarlo se sube en la siguiente sincronización, no a las 6 horas.
    const estadoPrevio = leerEstadoSubida()
    if (estadoPrevio[groupId]) {
      delete estadoPrevio[groupId]
      guardarEstadoSubida(estadoPrevio)
    }
    return
  }
  if (!puedeComprimir()) return

  // 3. Aún no toca: ni se lee el registro.
  const estado = leerEstadoSubida()
  const previo = estado[groupId]
  if (previo?.at && !previo.fallo && ahora - previo.at < SUBIDA_TRAS_RESPUESTA_MS) return
  const resumenLocal = await reg.leerResumenRegistro()
  if (!resumenLocal || !tocaSubir(previo, { filas: resumenLocal.filas, respuestaMasReciente: resumenLocal.respuestaMasReciente }, ahora)) return

  try {
    const local = await reg.leerRegistroParaGrupos(TOPE_FILAS)
    if (!local || !local.filas.length) return
    const emp = await empaquetarRegistro({ filas: local.filas, sesiones: local.sesiones, total: local.total }, ahora)
    if (!emp) return
    const trozosViejos = mio?.ids.trozos || []
    for (const dato of registrosDeSubida(emp.piezas, { app, filas: emp.filas, total: local.total }, ahora)) {
      await coll.add(dato)
    }
    // Los trozos de la subida anterior se retiran DESPUÉS de publicar los nuevos.
    for (const id of trozosViejos) await coll.remove(id)
    estado[groupId] = { at: ahora, respuestaAt: local.respuestaMasReciente }
  } catch {
    // Sin red o relays caídos: se anota el fallo y se reintenta pasado un rato.
    estado[groupId] = { ...(previo || {}), fallo: ahora }
  }
  guardarEstadoSubida(estado)
}

/** Lanza la publicación sin esperarla: solo una a la vez y sin que un error llegue a nadie. */
function publicarFuncionalidadEnSegundoPlano (groupId) {
  if (subiendoFuncionalidad) return
  subiendoFuncionalidad = true
  publicarFuncionalidad(groupId)
    .catch(() => { /* en silencio: se reintenta en la siguiente sincronización */ })
    .finally(() => { subiendoFuncionalidad = false })
}

/**
 * Descarga como JSON el registro de un miembro (o de todos si `uid` es null).
 * Devuelve la ruta del fichero. La clave de descarga se pide en la interfaz.
 */
async function descargarFuncionalidad (groupId, uid = null) {
  const rt = runtimes.get(groupId)
  if (!rt) throw new Error('Abre el grupo para descargar sus registros.')
  const resumen = resumirFuncionalidad(entradasFuncionalidad(rt.group))
  const nombres = nombresDe(rt.group)
  const iso = ms => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null)

  const miembros = []
  for (const persona of uid ? [uid] : [...resumen.keys()]) {
    const r = resumen.get(persona)
    if (!r?.completa) continue
    const reg = await desempaquetarRegistro(r.piezas)
    if (!reg) continue
    miembros.push({
      miembro: nombres.get(persona) || 'Sin nombre',
      versionApp: r.version,
      subidoEn: iso(r.subidaEn),
      filasSubidas: reg.filas.length,
      filasEnSuMovil: reg.total,
      sesionesDeEscucha: reg.sesiones.map(x => ({ ...x, inicio: iso(x.inicio), fin: iso(x.fin), respuestaEn: iso(x.respuestaEn) })),
      registro: reg.filas.map(x => ({ ...x, startedAt: iso(x.startedAt), endedAt: iso(x.endedAt) }))
    })
  }
  if (!miembros.length) throw new Error(uid ? 'Ese miembro no ha subido su registro.' : 'Nadie ha subido su registro todavía.')

  const grupo = (findGroup(groupId)?.name || 'grupo').toString()
  const limpio = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 30)
  const reglas = await import('@/composables/usePlayLog')
  const payload = {
    schema: 'skippify-play-log-grupo',
    version: 1,
    descargadoEn: new Date().toISOString(),
    grupo,
    miembros
  }
  return reglas.saveJson(
    `skippify-registro-funcionalidad-${limpio(grupo)}-${uid ? limpio(miembros[0].miembro) : 'todos'}-${reglas.stampDeFichero()}.json`,
    JSON.stringify(payload, null, 2)
  )
}

// ── Ranking ─────────────────────────────────────────────────────────────────

async function calcularRanking (groupId, cual = 'semana', leidas = null) {
  const rt = runtimes.get(groupId)
  if (!rt) return null
  const { group } = rt
  const ventana = ventanaPeriodo(cual, new Date())
  const escuchas = leidas || await leerEscuchas(group)
  const nombres = nombresDe(group)
  const lista = [...nombres.entries()].map(([uid, displayName]) =>
    puntuarSemana(uid, displayName, escuchas.get(uid) || [], ventana))
  // Por tiempo de escucha: ya no se enseñan puntos.
  lista.sort((a, b) => (b.totalMinutes - a.totalMinutes) || String(a.displayName).localeCompare(String(b.displayName), 'es'))
  return {
    weekKey: ventana.weekKey,
    weekStart: ventana.weekStartIso,
    weekEnd: ventana.weekEndIso,
    // La semana y el mes en curso siguen abiertos; una semana cerrada aún puede
    // moverse hasta un día después: los demás móviles publican sus últimas
    // escuchas al abrir la app.
    provisional: cual === 'semana' || cual === 'mes' || cual === 'actual' || Date.now() < Date.parse(ventana.weekEndIso) + 24 * 3600 * 1000,
    members: lista
  }
}

async function loadLeaderboard (options = {}) {
  const groupId = options?.groupId || state.value.activeGroupId
  const cual = options?.cual || 'semana'
  if (!groupId) return null
  try { await openRuntime(groupId) } catch { return null }
  const result = await calcularRanking(groupId, cual)
  if (result) {
    leaderboards[groupId] = { ...result, cual }
    semanas[groupId] = { ...(semanas[groupId] || {}), [cual]: { ...result, cual } }
  }
  return result
}

/** La semana y el mes en curso de un grupo, leyendo las escuchas una sola vez. */
async function loadSemanas (groupId = state.value.activeGroupId) {
  if (!groupId) return null
  try { await openRuntime(groupId) } catch { return null }
  const rt = runtimes.get(groupId)
  if (!rt) return null
  const escuchas = await leerEscuchas(rt.group)
  const nuevas = {}
  for (const cual of PERIODOS) {
    const r = await calcularRanking(groupId, cual, escuchas)
    if (r) nuevas[cual] = { ...r, cual }
  }
  semanas[groupId] = nuevas
  if (nuevas.semana) leaderboards[groupId] = nuevas.semana
  return nuevas
}

// ── Presencia y expulsión por inactividad ───────────────────────────────────
//
// Un dispositivo que no envía nada en 30 días sale del grupo. Cada móvil
// anota como mucho una vez al día que sigue vivo (colección `presencia`), y el
// primer administrador activo revisa cada pocas horas quién lleva demasiado
// callado y lo expulsa con el mecanismo normal del kit (cambio de llave
// incluido). Las reglas de decisión viven en lib/localhost/inactividad.js.

async function latidoDePresencia (group, ahora) {
  const yo = group.me.person
  let ultimo = 0
  for (const item of group.records(COLL_PRESENCIA).items()) {
    if (!item.removed && item.data?.u === yo && Number.isFinite(item.data.t)) ultimo = Math.max(ultimo, item.data.t)
  }
  if (ahora - ultimo < LATIDO_MS) return
  await group.records(COLL_PRESENCIA).add({ u: yo, t: ahora })
}

async function revisarInactivos (groupId, rt, report, ahora) {
  const meta = findGroup(groupId)
  const { group } = rt
  if (!meta || ahora - (meta.ultimaRevision || 0) < REVISION_MS) return
  // Sólo con una vista fiable: casi todos los relays contestaron y el reloj de
  // este móvil no se aleja del del grupo. Si no, otros parecerían callados sólo
  // porque aquí falta lo que han publicado.
  const fallados = (report?.failedRelays || []).length
  const total = (meta.relays?.length || DEFAULT_RELAYS.length)
  if (!report || fallados > Math.floor(total / 2)) return
  if (Math.abs(group.groupTime() - ahora) > 24 * 3600 * 1000) return

  meta.ultimaRevision = ahora
  const yo = group.members().find(m => m.person === group.me.person)
  if (!yo?.admin) { saveState(); return }

  const eventos = await rt.storage.getEvents({})
  const actividad = actividadPorPersona(eventos, d => group.membershipView().personOf(d), ahora)
  const nombres = nombresDe(group)
  const lista = elegirExpulsados({ miembros: group.members(), actividad, ahora, yo: group.me.person })
  const hechas = []
  for (const persona of lista) {
    try {
      await group.removePerson(persona)
      hechas.push({ nombre: nombres.get(persona) || 'Miembro', at: ahora })
    } catch { /* ya expulsado, o es un administrador superior: no pasa nada */ }
  }
  if (hechas.length) meta.expulsados = [...hechas, ...(meta.expulsados || [])].slice(0, 10)
  saveState()
  if (hechas.length) refreshMembers(groupId, group)
}

async function mantenimiento (groupId, rt, report) {
  const { group } = rt
  if (group.status !== 'ready' || !group.canSeal() || group.removedInOwnView()) return
  const ahora = Date.now()
  await latidoDePresencia(group, ahora)
  await revisarInactivos(groupId, rt, report, ahora)
}

// ── Sincronización ──────────────────────────────────────────────────────────

async function syncGroup (groupId, { silent = true } = {}) {
  let rt
  try {
    rt = await openRuntime(groupId)
  } catch (err) {
    if (!silent) error.value = mapError(err)
    return null
  }
  try {
    const report = await rt.group.sync()
    if (rt.group.status === 'ready' && !rt.group.removedInOwnView()) {
      await asegurarPerfil(rt.group)
      await publicarEscuchas(groupId)
      publicarFuncionalidadEnSegundoPlano(groupId)
      try { await mantenimiento(groupId, rt, report) } catch { /* se reintenta en la siguiente */ }
    }
    refreshMembers(groupId, rt.group)
    lastSyncByGroup[groupId] = Date.now()
    state.value.lastSyncAt = new Date().toISOString()
    saveState()
    return report
  } catch (err) {
    if (!silent) error.value = mapError(err, 'No fue posible sincronizar.')
    return null
  }
}

/** groupId → promesa del bucle que insiste hasta que el grupo queda listo. */
const entrando = new Map()

/**
 * Fuerza sincronizaciones repetidas mientras el grupo no está listo y avisa
 * cuando entra. Es idempotente: una segunda llamada para el mismo grupo no
 * abre otro bucle.
 */
function vigilarEntrada (groupId) {
  if (entrando.has(groupId)) return entrando.get(groupId)
  const hasta = Date.now() + ENTRADA_DURANTE_MS
  const espera = ms => new Promise(resolve => setTimeout(resolve, ms))
  const listo = () => ['ready', 'expelled'].includes(statuses[groupId] || 'ready')
  const bucle = (async () => {
    while (findGroup(groupId) && !listo() && Date.now() < hasta) {
      await syncAll({ silent: true })
      if (!findGroup(groupId) || listo()) break
      await espera(ENTRADA_CADA_MS)
    }
    const meta = findGroup(groupId)
    if (!meta) return
    if (listo()) {
      message.value = `Ya estás dentro de «${meta.name}».`
      error.value = ''
    } else {
      message.value = 'Todavía no te han dejado entrar. Se sigue comprobando mientras la app esté abierta: avisa a un miembro de que abra Skippify.'
    }
  })().finally(() => entrando.delete(groupId))
  entrando.set(groupId, bucle)
  return bucle
}

/** Activa el ritmo rápido y se asegura de que el vigilante está en marcha. */
function acelerar () {
  fastUntil = Date.now() + FAST_WINDOW_MS
  startWatch()
}

function syncAll (options = {}) {
  if (syncAllPromise) return syncAllPromise
  if (!state.value.groups.length) return Promise.resolve(0)
  lastFullSync = Date.now()
  syncing.value = true
  syncAllPromise = (async () => {
    let n = 0
    for (const g of [...state.value.groups]) {
      if (statuses[g.groupId] === 'expelled') continue
      const r = await syncGroup(g.groupId, options)
      if (r) n += 1
    }
    // Todos los grupos llevan sus cifras de la semana: las tarjetas las enseñan.
    for (const g of state.value.groups) {
      if (!runtimes.has(g.groupId)) continue
      try { await loadSemanas(g.groupId) } catch { /* sin datos aún */ }
    }
    return n
  })().finally(() => { syncing.value = false; syncAllPromise = null })
  return syncAllPromise
}

async function refreshAll (options = {}) {
  if (!options?.silent) clearStatus()
  const n = await syncAll({ silent: !!options?.silent })
  if (!options?.silent && !error.value) {
    message.value = n ? 'Sincronizado con los relays.' : 'No se pudo sincronizar ahora.'
  }
  return n
}

/**
 * Arranca el vigilante. Idempotente. Antes sólo se armaba si ya había grupos al
 * abrir la app, así que quien creaba o se unía al primer grupo en esa sesión no
 * sincronizaba nunca hasta reiniciarla: la invitación se quedaba sin atender.
 */
function startWatch () {
  // El lado nativo se entera de si hay grupos ya al abrir la app (sincronización
  // en segundo plano y aviso de los domingos), aunque la primera sincronización falle.
  void avisarServicio()
  if (state.value.groups.length) void syncAll()
  if (watchTimer || typeof window === 'undefined') return
  watchTimer = setInterval(tick, TICK_MS)
}

function tick () {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (!state.value.groups.length) return
  const ahora = Date.now()
  const esperando = state.value.groups.some(g => ['joining', 'restoring'].includes(statuses[g.groupId]))
  if (esperando || ahora < fastUntil || ahora - lastFullSync >= SYNC_INTERVAL_MS) void syncAll()
}

function stopWatch () {
  if (!watchTimer) return
  clearInterval(watchTimer)
  watchTimer = null
}

/**
 * Tanda de sincronización del servicio en segundo plano (la llama bg.html).
 * Sólo sincroniza: no publica escuchas ni perfil, no avisa y no toca la
 * pantalla. Devuelve en cuánto volver a llamar: rápido si alguien espera
 * (un invitado sin entrar, o una invitación aún válida), lento si no.
 */
export async function backgroundTick () {
  loadState()
  const vivos = new Set(state.value.groups.map(g => g.groupId))
  for (const [id, rt] of [...runtimes]) {
    if (!vivos.has(id)) {
      try { rt.storage.close() } catch { /* nada */ }
      runtimes.delete(id)
    }
  }
  let rapido = false
  for (const g of state.value.groups) {
    try {
      const rt = await openRuntime(g.groupId)
      const report = await rt.group.sync()
      if (rt.group.removedInOwnView()) continue
      if (rt.group.status !== 'ready') rapido = true
      else {
        try { await mantenimiento(g.groupId, rt, report) } catch { /* se reintenta */ }
        // Las estadísticas del grupo se mantienen al día aunque la app esté cerrada.
        try { await publicarEscuchas(g.groupId, { desdeFondo: true }) } catch { /* se reintenta */ }
        if (rt.group.membershipView().activeInvites(Date.now()).length) rapido = true
      }
    } catch { /* un grupo sin red no frena a los demás */ }
  }
  return rapido ? 15_000 : 300_000
}

/** Cierra todo lo abierto antes de ceder el paso a la app (bg.html). */
export function backgroundRelease () {
  liberarRuntimes()
}

export function useLocalLeague () {
  const activeGroup = computed(() => findGroup(state.value.activeGroupId))
  return {
    MAX_GROUPS,
    DEFAULT_RELAYS,
    state,
    groups: computed(() => state.value.groups),
    activeGroup,
    activeGroupId: computed(() => state.value.activeGroupId),
    hasGroups: computed(() => state.value.groups.length > 0),
    statuses,
    members,
    leaderboards,
    semanas,
    lastSyncByGroup,
    funcionalidad,
    descargarFuncionalidad,
    activeMembers: computed(() => members[state.value.activeGroupId] || []),
    activeLeaderboard: computed(() => leaderboards[state.value.activeGroupId] || null),
    syncing,
    error,
    message,
    clearStatus,
    createGroup,
    joinGroup,
    leaveGroup,
    setActiveGroup,
    createInvite,
    createExpressInvite,
    EXPRES_TTL_MS,
    createLinkCode,
    linkDevice,
    exportBackup,
    restoreBackup,
    loadLeaderboard,
    loadSemanas,
    expulsarMiembro,
    renombrarGrupo,
    refreshAll,
    syncAll,
    startWatch,
    stopWatch
  }
}
