/**
 * useLeague — Comunidad: grupos de amigos y resumen semanal compartido.
 *
 * Un usuario puede pertenecer a VARIOS grupos a la vez y salirse de cualquiera.
 * El estado guarda la lista completa y cuál se está mirando; los eventos de
 * escucha son del usuario (no del grupo), así que se suben una sola vez y cada
 * grupo los puntúa por su cuenta en la función programada.
 */
import { computed, reactive, ref } from 'vue'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { useEventStore } from '@/stores/events'
import { getFirebaseContext, getFirebaseDiagnostics } from '@/lib/firebaseClient'

const ctx = getFirebaseContext()
const LEAGUE_STATE_KEY = 'skippify-league-state'
const MAX_GROUPS = 5

const state = ref({
  uid: '',
  displayName: '',
  /** [{ groupId, inviteCode, name, role }] */
  groups: [],
  activeGroupId: '',
  lastSyncAt: null,
  /** weekKey ya visto, por grupo: { [groupId]: weekKey } */
  lastSeenWeekKeys: {}
})

const authReady = ref(false)
const authLoading = ref(false)
const syncing = ref(false)
const loadingLeaderboard = ref(false)
const error = ref('')
const message = ref('')
/** Resultado semanal cargado por grupo: { [groupId]: leaderboard } */
const leaderboards = reactive({})
/** Fichas de miembro por grupo: { [groupId]: [{ uid, displayName, role, joinedAt }] } */
const members = reactive({})
let authPromise = null
let syncPromise = null

const clockTick = ref(Date.now())
if (typeof window !== 'undefined') {
  setInterval(() => { clockTick.value = Date.now() }, 60_000)
}

// ── Estado persistido ────────────────────────────────────────────────────────

function normalizeGroup (raw) {
  const groupId = (raw?.groupId || '').toString()
  if (!groupId) return null
  return {
    groupId,
    inviteCode: (raw?.inviteCode || '').toString().toUpperCase(),
    name: (raw?.name || '').toString(),
    role: (raw?.role || 'member').toString()
  }
}

function loadState () {
  try {
    const raw = localStorage.getItem(LEAGUE_STATE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)

    // Migración del formato de un solo grupo (hasta la v3.3).
    const groups = Array.isArray(parsed?.groups)
      ? parsed.groups.map(normalizeGroup).filter(Boolean)
      : [normalizeGroup({ groupId: parsed?.groupId, inviteCode: parsed?.inviteCode })].filter(Boolean)

    const activeGroupId = (parsed?.activeGroupId || parsed?.groupId || groups[0]?.groupId || '').toString()

    state.value = {
      uid: (parsed?.uid || '').toString(),
      displayName: (parsed?.displayName || '').toString(),
      groups,
      activeGroupId: groups.some(g => g.groupId === activeGroupId) ? activeGroupId : (groups[0]?.groupId || ''),
      lastSyncAt: parsed?.lastSyncAt || null,
      lastSeenWeekKeys: (parsed?.lastSeenWeekKeys && typeof parsed.lastSeenWeekKeys === 'object')
        ? { ...parsed.lastSeenWeekKeys }
        // El formato antiguo guardaba una sola clave, sin saber de qué grupo era.
        : (parsed?.lastSeenWeeklyResultsWeekKey && activeGroupId
            ? { [activeGroupId]: parsed.lastSeenWeeklyResultsWeekKey.toString() }
            : {})
    }
  } catch {
    state.value = { uid: '', displayName: '', groups: [], activeGroupId: '', lastSyncAt: null, lastSeenWeekKeys: {} }
  }
}

function saveState () {
  try {
    localStorage.setItem(LEAGUE_STATE_KEY, JSON.stringify(state.value))
  } catch { /* ignored */ }
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function clearStatus () {
  error.value = ''
  message.value = ''
}

function mapFirebaseError (err, fallback = 'Ocurrió un error inesperado.') {
  const code = (err?.code || '').toString()
  const diagnostics = getFirebaseDiagnostics()
  if (code.includes('permission-denied')) {
    return 'Firebase rechazó el acceso a este grupo. Pulsa «Reparar acceso» para rehacer tu ficha de miembro. '
      + 'Si sigue igual, las reglas de Firestore del proyecto ' + (diagnostics.projectId || '(sin projectId)')
      + ' están desactualizadas: hay que desplegarlas con «npm run firebase:rules».'
  }
  if (code.includes('unavailable')) {
    return 'No hay conexión con Firebase. Verifica internet e inténtalo de nuevo.'
  }
  if (code.includes('api-key-not-valid')) {
    return `La API key de Firebase no es válida para Auth. Verifica que sea la Web API Key del proyecto ${diagnostics.projectId || '(sin projectId)'}, sin restricciones de HTTP referrer para Capacitor, y con la API Identity Toolkit habilitada.`
  }
  if (code.includes('invalid-api-key')) {
    return 'La API key de Firebase no es válida. Revisa VITE_FIREBASE_API_KEY.'
  }
  if (code.includes('network-request-failed')) {
    return 'Fallo de red al conectar con Firebase.'
  }
  return err?.message || fallback
}

function normalizeDisplayName (value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ')
}

function isPermissionDeniedError (err) {
  const code = (err?.code || '').toString().toLowerCase()
  return code.includes('permission-denied')
}

function findGroup (groupId) {
  return state.value.groups.find(item => item.groupId === groupId) || null
}

function upsertGroup (group) {
  const normalized = normalizeGroup(group)
  if (!normalized) return
  const existing = findGroup(normalized.groupId)
  if (existing) {
    Object.assign(existing, {
      inviteCode: normalized.inviteCode || existing.inviteCode,
      name: normalized.name || existing.name,
      role: normalized.role || existing.role
    })
  } else {
    state.value.groups = [...state.value.groups, normalized]
  }
  if (!state.value.activeGroupId) state.value.activeGroupId = normalized.groupId
}

function hashId (input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function eventIdFromLocalEvent (event, uid) {
  const key = `${uid}|${event?.played_at || ''}|${event?.track || ''}|${event?.artist || ''}|${event?.duration_ms || 0}`
  return hashId(key)
}

function normalizeIntervalRangeStart (date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function generateInviteCode () {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export function normalizeInviteCode (value) {
  return (value || '').toString().trim().toUpperCase().replace(/\s+/g, '')
}

function nextSunday1500Label () {
  const now = new Date()
  const day = now.getDay()
  const daysUntilSunday = (7 - day) % 7

  const target = new Date(now)
  target.setDate(now.getDate() + daysUntilSunday)
  target.setHours(15, 0, 0, 0)

  if (target <= now) {
    target.setDate(target.getDate() + 7)
  }

  return target.toLocaleString('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid'
  })
}

async function requestWeeklyResultNotification (groupName) {
  const title = 'Skippify'
  const body = groupName
    ? `Ya está el resumen semanal de ${groupName}.`
    : 'Los resultados semanales de tu grupo ya están disponibles.'

  try {
    const permissions = await LocalNotifications.checkPermissions()
    if (permissions.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions()
      if (requested.display !== 'granted') {
        throw new Error('Local notifications permission not granted')
      }
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body,
          schedule: { at: new Date(Date.now() + 1000) }
        }
      ]
    })
    return
  } catch {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return

    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body })
      } catch { /* ignored */ }
      return
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          try {
            new Notification(title, { body })
          } catch { /* ignored */ }
        }
      }).catch(() => {})
    }
  }
}

// ── Autenticación ────────────────────────────────────────────────────────────

async function ensureAuth () {
  if (!ctx.enabled || !ctx.auth) {
    authReady.value = true
    return false
  }

  if (authReady.value && state.value.uid) return true

  // Varias vistas llaman a ensureAuth() a la vez (onMounted + auto-sync). Sin
  // esta guarda se lanzaban varios signInAnonymously en paralelo.
  if (authPromise) return authPromise

  authLoading.value = true

  authPromise = new Promise((resolve) => {
    let settled = false
    let unsub = null

    const finish = () => {
      if (settled) return
      settled = true
      authReady.value = true
      authLoading.value = false
      saveState()
      // `unsub` puede seguir sin asignarse si el callback se dispara de forma
      // síncrona: por eso se comprueba antes de invocarlo.
      if (typeof unsub === 'function') unsub()
      clearTimeout(timeoutId)
      resolve(!!state.value.uid)
    }

    // Si Firebase nunca responde (sin red, DNS bloqueado) la promesa se quedaba
    // colgada para siempre y la vista se congelaba en "Conectando...".
    const timeoutId = setTimeout(() => {
      if (settled) return
      error.value = 'No fue posible conectar con Firebase (tiempo de espera agotado).'
      finish()
    }, 20000)

    try {
      unsub = onAuthStateChanged(
        ctx.auth,
        async (user) => {
          if (!user) {
            try {
              const cred = await signInAnonymously(ctx.auth)
              state.value.uid = cred.user.uid
            } catch (err) {
              error.value = mapFirebaseError(err, 'No fue posible iniciar sesión en Firebase.')
            }
          } else {
            state.value.uid = user.uid
          }
          finish()
        },
        (err) => {
          error.value = mapFirebaseError(err, 'No fue posible iniciar sesión en Firebase.')
          finish()
        }
      )
    } catch (err) {
      error.value = mapFirebaseError(err, 'No fue posible iniciar sesión en Firebase.')
      finish()
    }
  }).finally(() => { authPromise = null })

  return authPromise
}

/** Rehace la ficha de miembro cuando las reglas rechazan una lectura. */
async function repairMembershipIfNeeded (groupId) {
  if (!ctx.enabled || !ctx.db || !groupId || !state.value.uid) return false

  const safeName = normalizeDisplayName(state.value.displayName) || `Player-${state.value.uid.slice(0, 6)}`
  const memberRef = doc(ctx.db, 'friend_groups', groupId, 'members', state.value.uid)
  const userRef = doc(ctx.db, 'users', state.value.uid)

  try {
    const batch = writeBatch(ctx.db)
    batch.set(memberRef, {
      uid: state.value.uid,
      displayName: safeName,
      updatedAt: serverTimestamp()
    }, { merge: true })
    batch.set(userRef, {
      uid: state.value.uid,
      displayName: safeName,
      activeGroupId: state.value.activeGroupId || groupId,
      groupIds: state.value.groups.map(item => item.groupId),
      updatedAt: serverTimestamp()
    }, { merge: true })
    await batch.commit()
    state.value.displayName = safeName
    saveState()
    return true
  } catch {
    return false
  }
}

/**
 * Reparación a petición del usuario. Rehace la ficha de miembro y vuelve a
 * cargar el grupo: es la salida cuando el uid anónimo cambió (reinstalación,
 * datos borrados) y el estado local sigue apuntando al grupo.
 */
async function repararAcceso (groupId = state.value.activeGroupId) {
  clearStatus()
  if (!requireFirebase()) return false
  if (!groupId) {
    error.value = 'No hay ningún grupo seleccionado que reparar.'
    return false
  }

  const ok = await ensureAuth()
  if (!ok) return false

  if (!await repairMembershipIfNeeded(groupId)) {
    error.value = mapFirebaseError({ code: 'permission-denied' }, 'No fue posible reparar el acceso.')
    return false
  }

  await loadCurrentGroupInfo(groupId)
  await loadGroupMembers(groupId)
  await loadLeaderboard({ silent: true, groupId })
  if (!error.value) message.value = 'Acceso reparado: tu ficha de miembro se ha vuelto a crear.'
  return true
}

// ── Grupos ───────────────────────────────────────────────────────────────────

function validateName (displayName) {
  const safeName = normalizeDisplayName(displayName || state.value.displayName)
  if (!safeName || safeName.length < 3) {
    error.value = 'Introduce un nombre de usuario de al menos 3 caracteres.'
    return null
  }
  return safeName
}

function requireFirebase () {
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no está configurado. Define las variables VITE_FIREBASE_*.'
    return false
  }
  return true
}

async function createGroup ({ displayName, groupName } = {}) {
  clearStatus()
  if (!requireFirebase()) return null

  const ok = await ensureAuth()
  if (!ok) return null

  const safeName = validateName(displayName)
  if (!safeName) return null

  if (state.value.groups.length >= MAX_GROUPS) {
    error.value = `Ya perteneces a ${MAX_GROUPS} grupos, el máximo. Sal de uno para crear otro.`
    return null
  }

  const groupId = doc(collection(ctx.db, 'friend_groups')).id
  const inviteCode = generateInviteCode()
  const name = normalizeDisplayName(groupName) || `${safeName} Squad`

  const batch = writeBatch(ctx.db)
  batch.set(doc(ctx.db, 'friend_groups', groupId), {
    name,
    ownerUid: state.value.uid,
    inviteCode,
    createdAt: serverTimestamp(),
    publishSchedule: 'SUNDAYS_15_EUROPE_MADRID'
  })
  batch.set(doc(ctx.db, 'friend_groups', groupId, 'members', state.value.uid), {
    uid: state.value.uid,
    displayName: safeName,
    role: 'owner',
    joinedAt: serverTimestamp()
  })
  batch.set(doc(ctx.db, 'users', state.value.uid), {
    uid: state.value.uid,
    displayName: safeName,
    activeGroupId: groupId,
    groupIds: [...state.value.groups.map(item => item.groupId), groupId],
    updatedAt: serverTimestamp()
  }, { merge: true })

  try {
    await batch.commit()
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible crear el grupo.')
    return null
  }

  state.value.displayName = safeName
  upsertGroup({ groupId, inviteCode, name, role: 'owner' })
  state.value.activeGroupId = groupId
  saveState()
  message.value = `Grupo creado. Código de invitación: ${inviteCode}`
  return groupId
}

async function joinGroup ({ inviteCode, displayName } = {}) {
  clearStatus()
  if (!requireFirebase()) return null

  const ok = await ensureAuth()
  if (!ok) return null

  const safeName = validateName(displayName)
  if (!safeName) return null

  const code = normalizeInviteCode(inviteCode)
  if (code.length !== 6) {
    error.value = 'El código de invitación debe tener exactamente 6 caracteres.'
    return null
  }

  const already = state.value.groups.find(item => item.inviteCode === code)
  if (already) {
    state.value.activeGroupId = already.groupId
    saveState()
    message.value = 'Ya pertenecías a ese grupo: lo hemos puesto como activo.'
    return already.groupId
  }

  if (state.value.groups.length >= MAX_GROUPS) {
    error.value = `Ya perteneces a ${MAX_GROUPS} grupos, el máximo. Sal de uno para entrar en otro.`
    return null
  }

  let snap
  try {
    snap = await getDocs(query(
      collection(ctx.db, 'friend_groups'),
      where('inviteCode', '==', code),
      limit(1)
    ))
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible buscar el grupo por código.')
    return null
  }

  if (snap.empty) {
    error.value = 'No existe ningún grupo con ese código.'
    return null
  }

  const groupDoc = snap.docs[0]
  const groupId = groupDoc.id
  const groupName = (groupDoc.data()?.name || '').toString()

  const batch = writeBatch(ctx.db)
  batch.set(doc(ctx.db, 'friend_groups', groupId, 'members', state.value.uid), {
    uid: state.value.uid,
    displayName: safeName,
    role: 'member',
    joinedAt: serverTimestamp()
  }, { merge: true })
  batch.set(doc(ctx.db, 'users', state.value.uid), {
    uid: state.value.uid,
    displayName: safeName,
    activeGroupId: groupId,
    groupIds: [...state.value.groups.map(item => item.groupId), groupId],
    updatedAt: serverTimestamp()
  }, { merge: true })

  try {
    await batch.commit()
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible unirte al grupo.')
    return null
  }

  state.value.displayName = safeName
  upsertGroup({ groupId, inviteCode: code, name: groupName, role: 'member' })
  state.value.activeGroupId = groupId
  saveState()
  message.value = `Te uniste a ${groupName || 'el grupo'} correctamente.`
  return groupId
}

/**
 * Sale de un grupo: borra la ficha de miembro (las reglas permiten borrar la
 * propia) y lo quita del estado local. Los eventos de escucha son del usuario,
 * así que no se toca nada más.
 */
async function leaveGroup (groupId) {
  clearStatus()
  if (!requireFirebase()) return false

  const group = findGroup(groupId)
  if (!group) return false

  const ok = await ensureAuth()
  if (!ok) return false

  try {
    await deleteDoc(doc(ctx.db, 'friend_groups', groupId, 'members', state.value.uid))
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible salir del grupo.')
    return false
  }

  const remaining = state.value.groups.filter(item => item.groupId !== groupId)
  state.value.groups = remaining
  if (state.value.activeGroupId === groupId) {
    state.value.activeGroupId = remaining[0]?.groupId || ''
  }
  delete leaderboards[groupId]
  delete members[groupId]
  const seen = { ...state.value.lastSeenWeekKeys }
  delete seen[groupId]
  state.value.lastSeenWeekKeys = seen
  saveState()

  try {
    await setDoc(doc(ctx.db, 'users', state.value.uid), {
      uid: state.value.uid,
      activeGroupId: state.value.activeGroupId,
      groupIds: remaining.map(item => item.groupId),
      updatedAt: serverTimestamp()
    }, { merge: true })
  } catch { /* el borrado ya surtió efecto: no se bloquea al usuario por esto */ }

  message.value = `Has salido de ${group.name || 'el grupo'}.`
  return true
}

function setActiveGroup (groupId) {
  if (!findGroup(groupId)) return
  state.value.activeGroupId = groupId
  saveState()
}

/** Refresca nombre y código del grupo. No limpia mensajes: los pisaba. */
async function loadCurrentGroupInfo (groupId = state.value.activeGroupId) {
  if (!ctx.enabled || !ctx.db || !groupId) return null

  const readGroup = async () => {
    const snap = await getDoc(doc(ctx.db, 'friend_groups', groupId))
    if (!snap.exists()) return null
    const data = snap.data()
    upsertGroup({
      groupId,
      inviteCode: data?.inviteCode || findGroup(groupId)?.inviteCode || '',
      name: data?.name || '',
      role: data?.ownerUid === state.value.uid ? 'owner' : findGroup(groupId)?.role
    })
    saveState()
    return data
  }

  try {
    return await readGroup()
  } catch (err) {
    if (isPermissionDeniedError(err) && await repairMembershipIfNeeded(groupId)) {
      try {
        return await readGroup()
      } catch (retryErr) {
        error.value = mapFirebaseError(retryErr, 'No fue posible cargar el grupo.')
        return null
      }
    }
    error.value = mapFirebaseError(err, 'No fue posible cargar el grupo.')
    return null
  }
}

/** Fecha de una marca de Firestore, que llega como Timestamp o como ISO. */
export function toDate (value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  const d = new Date(typeof value === 'number' ? value : value.toString())
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Lista quién compone el grupo. Se lee la subcolección `members`, que es la
 * misma que usa la función semanal para puntuar: si alguien sale aquí, cuenta
 * en el ranking. El dueño va primero y el resto por nombre.
 */
async function loadGroupMembers (groupId = state.value.activeGroupId, options = {}) {
  const silent = options?.silent !== false
  if (!ctx.enabled || !ctx.db || !groupId) return []

  const ok = await ensureAuth()
  if (!ok) return []

  const leer = async () => {
    const snap = await getDocs(collection(ctx.db, 'friend_groups', groupId, 'members'))
    const lista = snap.docs.map((docSnap) => {
      const data = docSnap.data() || {}
      return {
        uid: docSnap.id,
        displayName: (data.displayName || '').toString(),
        role: (data.role || '').toString(),
        joinedAt: toDate(data.joinedAt) || toDate(data.updatedAt)
      }
    })

    lista.sort((a, b) => {
      if ((a.role === 'owner') !== (b.role === 'owner')) return a.role === 'owner' ? -1 : 1
      return (a.displayName || a.uid).localeCompare(b.displayName || b.uid, 'es')
    })

    members[groupId] = lista
    return lista
  }

  try {
    return await leer()
  } catch (err) {
    if (isPermissionDeniedError(err) && await repairMembershipIfNeeded(groupId)) {
      try {
        return await leer()
      } catch { /* se cae al aviso de abajo */ }
    }
    if (!silent) error.value = mapFirebaseError(err, 'No fue posible leer los miembros del grupo.')
    return members[groupId] || []
  }
}

// ── Sincronización de escuchas ───────────────────────────────────────────────

async function syncLocalEvents (options = {}) {
  // Evita solapes entre el auto-sync de 30 min y una pulsación manual.
  if (syncPromise) return syncPromise
  syncPromise = _syncLocalEvents(options).finally(() => { syncPromise = null })
  return syncPromise
}

async function _syncLocalEvents (options = {}) {
  const silent = !!options?.silent
  if (!silent) clearStatus()
  else error.value = ''

  if (!requireFirebase()) return 0

  const ok = await ensureAuth()
  if (!ok) return 0

  if (!state.value.groups.length) {
    if (!silent) error.value = 'Primero crea un grupo o únete a uno.'
    return 0
  }

  syncing.value = true
  const { state: eventState } = useEventStore()
  const allEvents = Array.isArray(eventState.events) ? [...eventState.events] : []

  // `ms_played` se rellena al TERMINAR la canción (finalizeCurrentEvent). Si la
  // sincronización automática corría mientras sonaba un tema, ese evento se subía
  // con ms_played = 0 y nunca se volvía a enviar, así que se contaba de menos.
  // Se reenvía siempre una ventana de solape; los documentos usan un ID
  // determinista + merge, así que reenviar es idempotente.
  const RESYNC_OVERLAP_MS = 26 * 60 * 60 * 1000
  const lowerBound = state.value.lastSyncAt
    ? new Date(new Date(state.value.lastSyncAt).getTime() - RESYNC_OVERLAP_MS)
    : null
  const candidates = allEvents.filter((event) => {
    const playedAt = new Date(event?.played_at || 0)
    if (!Number.isFinite(playedAt.getTime())) return false
    if (lowerBound && playedAt <= lowerBound) return false
    return true
  })

  if (!candidates.length) {
    syncing.value = false
    if (!silent) message.value = 'No hay reproducciones nuevas para sincronizar.'
    return 0
  }

  const groupIds = state.value.groups.map(item => item.groupId)
  let synced = 0
  const batches = []
  let currentBatch = writeBatch(ctx.db)
  let inBatch = 0

  currentBatch.set(doc(ctx.db, 'users', state.value.uid), {
    uid: state.value.uid,
    displayName: state.value.displayName || `Player-${state.value.uid.slice(0, 6)}`,
    activeGroupId: state.value.activeGroupId,
    groupIds,
    updatedAt: serverTimestamp()
  }, { merge: true })
  inBatch += 1

  for (const event of candidates) {
    const eventId = eventIdFromLocalEvent(event, state.value.uid)
    const durationMs = Number(event?.duration_ms || 0)
    // Igual que en las estadísticas locales: por debajo del 80 % `ms_played`
    // queda a cero, y `resume_anchor_ms` conserva el avance realmente medido.
    const msPlayed = Number(event?.ms_played || 0)
    const measuredMs = Math.max(msPlayed, Number(event?.resume_anchor_ms || 0))
    const ratio = durationMs > 0 ? measuredMs / durationMs : 0

    currentBatch.set(doc(ctx.db, 'users', state.value.uid, 'listening_events', eventId), {
      eventId,
      uid: state.value.uid,
      groupId: state.value.activeGroupId,
      groupIds,
      playedAt: event.played_at,
      playedAtDay: normalizeIntervalRangeStart(new Date(event.played_at)).toISOString(),
      track: (event?.track || '').toString(),
      artist: (event?.artist || '').toString(),
      durationMs,
      msPlayed,
      measuredMs,
      completionRatio: Math.max(0, ratio),
      countedForTime: ratio >= 0.8,
      countedForRegister: ratio >= 0.25,
      source: (event?.source || '').toString(),
      createdAt: serverTimestamp()
    }, { merge: true })

    synced += 1
    inBatch += 1

    if (inBatch >= 450) {
      batches.push(currentBatch)
      currentBatch = writeBatch(ctx.db)
      inBatch = 0
    }
  }

  if (inBatch > 0) batches.push(currentBatch)

  try {
    for (const b of batches) await b.commit()
  } catch (err) {
    syncing.value = false
    error.value = mapFirebaseError(err, 'No fue posible sincronizar las reproducciones.')
    return 0
  }

  state.value.lastSyncAt = new Date().toISOString()
  saveState()
  syncing.value = false
  if (!silent) message.value = `Sincronización completada: ${synced} reproducciones subidas.`
  return synced
}

// ── Resultados semanales ─────────────────────────────────────────────────────

/**
 * Última publicación del grupo. La función programada escribe un documento por
 * semana (`weekly_results/{weekKey}`); antes la app leía un `current` que nadie
 * creaba, así que el ranking salía siempre vacío. Se lee el más reciente y se
 * mantiene `current` como respaldo para publicaciones manuales.
 */
async function fetchLatestWeeklyResult (groupId) {
  const resultsRef = collection(ctx.db, 'friend_groups', groupId, 'weekly_results')

  try {
    const snap = await getDocs(query(resultsRef, orderBy('weekKey', 'desc'), limit(1)))
    if (!snap.empty) {
      const docSnap = snap.docs[0]
      return { id: docSnap.id, ...docSnap.data() }
    }
  } catch {
    // Sin índice o sin permiso de listado: se cae al documento fijo.
  }

  const currentSnap = await getDoc(doc(resultsRef, 'current'))
  return currentSnap.exists() ? { id: 'current', ...currentSnap.data() } : null
}

/**
 * Vigilancia de publicaciones ─────────────────────────────────────────────────
 *
 * El aviso de resultados sólo salía al abrir la pestaña Comunidad, que es justo
 * cuando el usuario ya los está viendo. Aquí se repasan TODOS los grupos a los
 * que se pertenece, sin necesidad de entrar en ninguna pantalla, y se notifica
 * cada publicación nueva.
 *
 * Sin grupos no se hace ni una petición: quien no está en ninguna comunidad no
 * tiene nada que recibir.
 */
const WEEKLY_WATCH_INTERVAL_MS = 30 * 60 * 1000

let weeklyWatchTimer = null
let weeklyWatchInFlight = false

/**
 * Repasa los grupos y avisa de lo que se haya publicado desde la última vez.
 *
 * La primera vez que se ve un grupo sólo se fija el punto de partida: avisar de
 * un resumen que ya estaba publicado antes de instalar la app sería ruido.
 *
 * @returns {Promise<number>} avisos emitidos.
 */
async function checkPublishedResults () {
  if (weeklyWatchInFlight) return 0
  if (!ctx.enabled || !ctx.db) return 0
  if (!state.value.groups.length) return 0

  weeklyWatchInFlight = true
  let avisos = 0

  try {
    // En silencio: este repaso corre solo, así que no puede dejar mensajes de
    // error en una pantalla que el usuario no ha pedido.
    if (!(await ensureAuth())) return 0

    for (const group of [...state.value.groups]) {
      try {
        const result = await fetchLatestWeeklyResult(group.groupId)
        const weekKey = (result?.weekKey || '').toString()
        if (!weekKey) continue

        const previo = (state.value.lastSeenWeekKeys?.[group.groupId] || '').toString()
        state.value.lastSeenWeekKeys = { ...state.value.lastSeenWeekKeys, [group.groupId]: weekKey }
        saveState()

        // También se cachea lo leído: si el usuario entra en Comunidad tras el
        // aviso, el ranking ya está puesto.
        leaderboards[group.groupId] = {
          ...result,
          members: Array.isArray(result.members) ? result.members : []
        }

        if (previo && previo !== weekKey) {
          avisos += 1
          await requestWeeklyResultNotification(group.name)
        }
      } catch {
        // Un grupo sin permiso o sin red no puede tumbar el repaso del resto.
      }
    }
  } finally {
    weeklyWatchInFlight = false
  }

  return avisos
}

/** Arranca el repaso periódico. Idempotente: llamarlo dos veces no duplica nada. */
function startPublishedResultsWatch () {
  void checkPublishedResults()
  if (weeklyWatchTimer || typeof window === 'undefined') return
  weeklyWatchTimer = setInterval(() => { void checkPublishedResults() }, WEEKLY_WATCH_INTERVAL_MS)
}

function stopPublishedResultsWatch () {
  if (!weeklyWatchTimer) return
  clearInterval(weeklyWatchTimer)
  weeklyWatchTimer = null
}

async function loadLeaderboard (options = {}) {
  const silent = !!options?.silent
  const groupId = options?.groupId || state.value.activeGroupId
  if (!silent) clearStatus()

  if (!requireFirebase()) return null

  const ok = await ensureAuth()
  if (!ok) return null

  if (!groupId) {
    if (!silent) error.value = 'Primero crea un grupo o únete a uno.'
    return null
  }

  loadingLeaderboard.value = true

  const load = async () => {
    const result = await fetchLatestWeeklyResult(groupId)
    if (!result) {
      leaderboards[groupId] = null
      if (!silent) message.value = 'Todavía no hay resultados semanales publicados para este grupo.'
      return null
    }

    leaderboards[groupId] = {
      ...result,
      members: Array.isArray(result.members) ? result.members : []
    }

    const previousWeekKey = (state.value.lastSeenWeekKeys?.[groupId] || '').toString()
    const currentWeekKey = (result.weekKey || '').toString()
    if (currentWeekKey && previousWeekKey && currentWeekKey !== previousWeekKey) {
      void requestWeeklyResultNotification(findGroup(groupId)?.name)
    }
    state.value.lastSeenWeekKeys = { ...state.value.lastSeenWeekKeys, [groupId]: currentWeekKey }
    saveState()

    return leaderboards[groupId]
  }

  try {
    return await load()
  } catch (err) {
    if (isPermissionDeniedError(err) && await repairMembershipIfNeeded(groupId)) {
      try {
        return await load()
      } catch (retryErr) {
        error.value = mapFirebaseError(retryErr, 'No fue posible cargar el ranking semanal.')
        return null
      }
    }
    error.value = mapFirebaseError(err, 'No fue posible cargar el ranking semanal.')
    return null
  } finally {
    loadingLeaderboard.value = false
  }
}

/** Sube lo pendiente y refresca los datos de todos los grupos del usuario. */
async function refreshAll (options = {}) {
  const silent = options?.silent !== false
  if (!ctx.enabled || !state.value.groups.length) return
  await syncLocalEvents({ silent })
  for (const group of state.value.groups) {
    await loadCurrentGroupInfo(group.groupId)
    await loadGroupMembers(group.groupId)
    await loadLeaderboard({ silent: true, groupId: group.groupId })
  }
}

loadState()

export function useLeague () {
  const activeGroup = computed(() => findGroup(state.value.activeGroupId))
  const activeLeaderboard = computed(() => leaderboards[state.value.activeGroupId] || null)

  return {
    enabled: computed(() => ctx.enabled),
    MAX_GROUPS,
    state,
    groups: computed(() => state.value.groups),
    activeGroup,
    activeGroupId: computed(() => state.value.activeGroupId),
    hasGroups: computed(() => state.value.groups.length > 0),
    leaderboards,
    activeLeaderboard,
    members,
    activeMembers: computed(() => members[state.value.activeGroupId] || []),
    /** Publicación más reciente del grupo activo, si ya hubo alguna. */
    activeLastUpdate: computed(() => toDate(leaderboards[state.value.activeGroupId]?.publishedAt)),
    memberCount: (groupId) => (members[groupId] || []).length,
    weeklyMembers: computed(() => activeLeaderboard.value?.members || []),
    authReady,
    authLoading,
    syncing,
    loadingLeaderboard,
    error,
    message,
    // Depende de `clockTick` para que la etiqueta avance sola; antes era un
    // computed sin dependencias reactivas y se quedaba fijo en el valor inicial.
    nextPublishLabel: computed(() => {
      void clockTick.value
      return nextSunday1500Label()
    }),
    ensureAuth,
    createGroup,
    joinGroup,
    leaveGroup,
    setActiveGroup,
    syncLocalEvents,
    loadLeaderboard,
    checkPublishedResults,
    startPublishedResultsWatch,
    stopPublishedResultsWatch,
    loadCurrentGroupInfo,
    loadGroupMembers,
    refreshAll,
    repararAcceso,
    diagnostics: getFirebaseDiagnostics(),
    clearStatus
  }
}
