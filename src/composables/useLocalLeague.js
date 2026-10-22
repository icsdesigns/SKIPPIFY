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
import { LocalNotifications } from '@capacitor/local-notifications'
import { useEventStore } from '@/stores/events'
import { IdbStorage, deleteSlot } from '@/lib/localhost/idbStorage'
import { NostrTransport, DEFAULT_RELAYS } from '@/lib/localhost/nostrTransport'
import { decodeEscuchas, encodeEscuchas, partirEnLotes, ventanaSemana, puntuarSemana } from '@/lib/localhost/escuchas'

const STATE_KEY = 'skippify-localhost-state'
const MAX_GROUPS = 5
const COLL = 'escuchas'
const COLL_GRUPO = 'grupo'
const COLL_PERFIL = 'perfil'
const SYNC_INTERVAL_MS = 60_000
/** Cada cuánto se mira si toca sincronizar (el ritmo real lo decide `tick`). */
const TICK_MS = 15_000
/**
 * Mientras alguien espera —un invitado que aún no ha entrado, o un admin que
 * acaba de dar una invitación— se sincroniza cada tick en vez de cada minuto:
 * la entrada depende de que los dos móviles coincidan en los relays.
 */
const FAST_WINDOW_MS = 10 * 60_000
/** Sólo se publican las escuchas de los últimos días: el ranking mira dos semanas. */
const PUBLISH_WINDOW_MS = 15 * 24 * 3600 * 1000
/** Margen tras el final teórico de la canción para dar su `ms_played` por definitivo. */
const FINAL_GRACE_MS = 3 * 60 * 1000

const state = ref({
  displayName: '',
  /** [{ groupId, name, role, relays, kitGroupId }] — `groupId` es la ranura local (`lh_…`). */
  groups: [],
  activeGroupId: '',
  lastSyncAt: null,
  /** weekKey ya visto por grupo, para avisar una sola vez. */
  lastSeenWeekKeys: {}
})

const syncing = ref(false)
const error = ref('')
const message = ref('')
/** { [groupId]: 'ready' | 'joining' | 'restoring' } */
const statuses = reactive({})
/** { [groupId]: [{ uid, displayName, role, you }] } */
const members = reactive({})
/** { [groupId]: { weekKey, members, provisional, cual } } */
const leaderboards = reactive({})
/** { [groupId]: ms de la última sincronización con éxito } */
const lastSyncByGroup = reactive({})

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
      groups: Array.isArray(parsed.groups) ? parsed.groups.filter(g => g?.groupId) : [],
      lastSeenWeekKeys: parsed.lastSeenWeekKeys || {}
    }
  } catch { /* estado ilegible: se empieza limpio */ }
}

function saveState () {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state.value))
  } catch { /* sin almacenamiento: se pierde sólo la caché de la lista */ }
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
async function openRuntime (groupId) {
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
  statuses[groupId] = group.status
  return rt
}

/** Nombre del grupo: lo escribe el creador en la colección `grupo` (gana el más antiguo). */
function nombreDelGrupo (group) {
  const items = group.records(COLL_GRUPO).items().filter(i => !i.removed && typeof i.data?.nombre === 'string')
  if (!items.length) return ''
  items.sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0))
  return items[0].data.nombre
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
  statuses[groupId] = group.status
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
  const code = (inviteCode || '').toString().trim()
  const slot = newSlot()
  try {
    const kit = await loadKit()
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
    statuses[slot] = group.status
    message.value = 'Solicitud enviada. Entrarás cuando algún miembro del grupo abra la app.'
    void syncGroup(slot)
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
  delete statuses[groupId]
  saveState()
  message.value = 'Has salido del grupo. Para volver a entrar necesitas otra invitación.'
  return true
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
    statuses[slot] = group.status
    void syncGroup(slot)
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
    statuses[slot] = group.status
    void syncGroup(slot)
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
function escuchasTerminadas (person, ahora) {
  const { state: eventState } = useEventStore()
  const events = Array.isArray(eventState.events) ? eventState.events : []
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

async function publicarEscuchas (groupId) {
  const rt = runtimes.get(groupId)
  if (!rt || rt.group.status !== 'ready' || !rt.group.canSeal()) return 0
  const person = rt.group.me.person
  const propias = await leerEscuchas(rt.group)
  const yaPublicadas = new Set((propias.get(person) || []).map(t => t[0]))
  const nuevas = escuchasTerminadas(person, Date.now()).filter(t => !yaPublicadas.has(t[0]))
  if (!nuevas.length) return 0
  nuevas.sort((a, b) => a[1] - b[1])
  let publicadas = 0
  for (const lote of partirEnLotes(nuevas)) {
    await rt.group.records(COLL).add(await encodeEscuchas(person, lote))
    publicadas += lote.length
  }
  return publicadas
}

// ── Ranking ─────────────────────────────────────────────────────────────────

async function calcularRanking (groupId, cual = 'pasada') {
  const rt = runtimes.get(groupId)
  if (!rt) return null
  const { group } = rt
  const ventana = ventanaSemana(cual, new Date())
  const escuchas = await leerEscuchas(group)
  const nombres = nombresDe(group)
  const lista = [...nombres.entries()].map(([uid, displayName]) =>
    puntuarSemana(uid, displayName, escuchas.get(uid) || [], ventana))
  lista.sort((a, b) => b.score - a.score)
  return {
    weekKey: ventana.weekKey,
    weekStart: ventana.weekStartIso,
    weekEnd: ventana.weekEndIso,
    // Hasta un día después del cierre de la semana las cifras todavía pueden
    // moverse: los demás móviles publican sus últimas escuchas al abrir la app.
    provisional: cual === 'actual' || Date.now() < Date.parse(ventana.weekEndIso) + 24 * 3600 * 1000,
    members: lista
  }
}

async function loadLeaderboard (options = {}) {
  const groupId = options?.groupId || state.value.activeGroupId
  const cual = options?.cual || 'pasada'
  if (!groupId) return null
  try { await openRuntime(groupId) } catch { return null }
  const result = await calcularRanking(groupId, cual)
  if (result) leaderboards[groupId] = { ...result, cual }
  return result
}

async function avisarSiSemanaNueva (groupId) {
  const meta = findGroup(groupId)
  const result = await calcularRanking(groupId, 'pasada')
  if (!meta || !result || !result.members.some(m => m.totalTracks > 0)) return false
  const previo = state.value.lastSeenWeekKeys?.[groupId]
  state.value.lastSeenWeekKeys = { ...state.value.lastSeenWeekKeys, [groupId]: result.weekKey }
  saveState()
  if (!previo || previo === result.weekKey) return false
  try {
    const permissions = await LocalNotifications.checkPermissions()
    if (permissions.display !== 'granted') return true
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now() % 2147483647,
        title: 'Skippify',
        body: `Ya está el resumen semanal de ${meta.name} (provisional hasta que todos sincronicen).`,
        schedule: { at: new Date(Date.now() + 1000) }
      }]
    })
  } catch { /* sin permiso o sin plugin: no es un fallo */ }
  return true
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
    if (rt.group.status === 'ready') {
      await asegurarPerfil(rt.group)
      await publicarEscuchas(groupId)
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
      const r = await syncGroup(g.groupId, options)
      if (r) n += 1
      try { await avisarSiSemanaNueva(g.groupId) } catch { /* sin datos aún */ }
    }
    const active = state.value.activeGroupId
    if (active && runtimes.has(active)) {
      await loadLeaderboard({ groupId: active, cual: leaderboards[active]?.cual || 'pasada' })
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
  if (state.value.groups.length) void syncAll()
  if (watchTimer || typeof window === 'undefined') return
  watchTimer = setInterval(tick, TICK_MS)
}

function tick () {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (!state.value.groups.length) return
  const ahora = Date.now()
  const esperando = state.value.groups.some(g => (statuses[g.groupId] || 'ready') !== 'ready')
  if (esperando || ahora < fastUntil || ahora - lastFullSync >= SYNC_INTERVAL_MS) void syncAll()
}

function stopWatch () {
  if (!watchTimer) return
  clearInterval(watchTimer)
  watchTimer = null
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
    lastSyncByGroup,
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
    createLinkCode,
    linkDevice,
    exportBackup,
    restoreBackup,
    loadLeaderboard,
    refreshAll,
    syncAll,
    startWatch,
    stopWatch
  }
}
