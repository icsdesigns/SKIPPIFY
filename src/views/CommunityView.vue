<template>
  <div class="sk-stagger space-y-4">
    <!-- ── Árbol: modo (con o sin servidor) › grupo ───────────────────────── -->
    <ComunidadArbol
      :modo="modo"
      :raices="raices"
      @modo="elegirModo"
      @grupo="onArbolGrupo"
      @alta="onArbolAlta"
    />

    <LocalHostPanel v-if="modo === 'local'" />

    <template v-else>
    <!-- ── Estado del servicio ───────────────────────────────────────────── -->
    <div v-if="!enabled" class="sk-card p-5">
      <p class="text-sm font-semibold text-amber-200">La comunidad no está configurada</p>
      <p class="mt-1 text-xs text-amber-200/70">
        Define las variables <span class="font-mono">VITE_FIREBASE_*</span> para poder crear grupos
        y compartir tu resumen semanal.
      </p>
    </div>

    <!-- ══ Resultados del grupo ══════════════════════════════════════════════
         Van primero porque son lo que se viene a mirar; crear o unirse es algo
         que se hace una vez. Si no perteneces a ningún grupo, este bloque
         entero desaparece y la pantalla se queda en las dos opciones. -->
    <template v-if="activeGroup">
      <!-- La lista de grupos vive en el árbol de arriba: aquí sólo el abierto. -->
      <GrupoDetalle
        :nombre="groupLabel(activeGroup)"
        :meta="metaGrupo"
        :miembros="miembrosVista"
        :ranking="rankingVista"
        :semana="weekLabel"
        sin-ranking="Todavía no hay ranking publicado para este grupo. Se publica cada domingo a las 15:00."
      >
        <template #acciones>
          <button
            class="sk-btn sk-btn-ghost sk-btn-sm"
            :disabled="!activeGroup.inviteCode"
            @click="copyInviteCode"
          >
            <GrupoIcono :name="copied ? 'check' : 'copy'" class="h-3.5 w-3.5" />{{ copied ? 'Copiado' : `Código ${activeGroup.inviteCode || ''}`.trim() }}
          </button>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="syncing || loadingLeaderboard" @click="onRefresh">
            <GrupoIcono name="refresh" class="h-3.5 w-3.5" />{{ syncing || loadingLeaderboard ? 'Actualizando…' : 'Actualizar' }}
          </button>
          <button
            v-if="accesoRechazado"
            class="sk-btn sk-btn-sm bg-amber-400/[0.18] text-amber-100 hover:bg-amber-400/30"
            :disabled="reparando"
            @click="onRepair"
          >
            {{ reparando ? 'Reparando…' : 'Reparar acceso' }}
          </button>
          <button class="sk-btn sk-btn-danger sk-btn-sm" @click="onLeave(activeGroup)">
            {{ confirmLeaveId === activeGroup.groupId ? '¿Seguro? Pulsa otra vez' : 'Salir del grupo' }}
          </button>
        </template>

        <template #avisoRanking>
          <p v-if="activeResultPending" class="mt-3 rounded-md bg-white/[0.06] px-3 py-2 text-xs text-slate-300">
            Los resultados de esta semana aún se están calculando. Te avisaremos en cuanto estén.
          </p>
        </template>
      </GrupoDetalle>
    </template>

    <!-- ══ Crear grupo · Unirme a grupo ═════════════════════════════════════ -->
    <section id="comunidad-alta-servidor" class="sk-card scroll-mt-4 p-5">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="sk-title">{{ groups.length ? 'Entrar en otro grupo' : 'Empieza aquí' }}</h2>
        <span class="text-[11px] text-slate-500">Se sincroniza cada 30 min</span>
      </header>
      <p class="sk-subtitle">
        Crea un grupo y comparte su código, o entra en uno con el código de 6 caracteres
        que te hayan pasado.
      </p>

      <div class="mt-4 grid grid-cols-2 gap-2.5">
        <button
          v-for="opcion in opciones"
          :key="opcion.id"
          type="button"
          class="relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200"
          :class="accion === opcion.id
            ? 'sk-option-active'
            : 'sk-option'"
          @click="accion = accion === opcion.id ? '' : opcion.id"
        >
          <div
            v-if="accion === opcion.id"
            class="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-400/[0.10] to-transparent"
          />
          <div class="relative">
            <span
              class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              :class="accion === opcion.id ? 'bg-brand-400/25 text-brand-200' : 'bg-white/[0.08] text-slate-300'"
            >
              <GrupoIcono :name="opcion.icon" class="h-5 w-5" />
            </span>
            <p class="mt-2.5 text-sm font-bold text-white">
              {{ opcion.title }}
            </p>
            <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ opcion.description }}</p>
          </div>
        </button>
      </div>

      <Transition name="desplegar">
        <div v-if="accion" class="mt-4 border-t border-white/[0.07] pt-4">
          <label class="block">
            <span class="sk-eyebrow">Tu nombre en los rankings</span>
            <input
              v-model.trim="displayName"
              class="sk-input mt-1.5"
              maxlength="24"
              placeholder="Nombre de usuario (mín. 3 caracteres)"
            >
          </label>

          <template v-if="accion === 'crear'">
            <input
              v-model.trim="groupNameInput"
              class="sk-input mt-3"
              maxlength="32"
              placeholder="Nombre del grupo (opcional)"
            >
            <button
              class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full"
              :disabled="!enabled || !canUseUsername || busy"
              @click="handleCreateGroup"
            >
              Crear grupo
            </button>
            <p class="mt-2 text-[11px] text-slate-500">
              Serás el propietario y recibirás un código para invitar a tus amigos.
            </p>
          </template>

          <template v-else>
            <input
              v-model.trim="inviteCodeInput"
              class="sk-input mt-3 font-mono uppercase tracking-widest"
              maxlength="6"
              placeholder="ABC123"
            >
            <button
              class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full"
              :disabled="!enabled || !canJoin || busy"
              @click="handleJoinGroup"
            >
              Unirme al grupo
            </button>
            <p class="mt-2 text-[11px] text-slate-500">
              El código lo genera quien crea el grupo; son 6 caracteres.
            </p>
          </template>
        </div>
      </Transition>

      <p v-if="authLoading" class="mt-3 text-xs text-sky-300">Conectando con Firebase…</p>
      <p v-if="message" class="mt-3 text-xs text-brand-400">{{ message }}</p>

      <div v-if="error" class="mt-3 rounded-card bg-rose-500/[0.16] px-3.5 py-3">
        <p class="text-xs text-rose-200">{{ error }}</p>

        <div v-if="accesoRechazado" class="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            class="sk-btn sk-btn-sm bg-amber-400/[0.18] text-amber-100 hover:bg-amber-400/30"
            :disabled="reparando || !activeGroupId"
            @click="onRepair"
          >
            {{ reparando ? 'Reparando…' : 'Reparar acceso' }}
          </button>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="verDiagnostico = !verDiagnostico">
            {{ verDiagnostico ? 'Ocultar detalles' : 'Ver detalles técnicos' }}
          </button>
        </div>

        <dl v-if="verDiagnostico" class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-slate-400">
          <dt class="text-slate-500">projectId</dt><dd class="truncate">{{ diagnostics.projectId || '—' }}</dd>
          <dt class="text-slate-500">authDomain</dt><dd class="truncate">{{ diagnostics.authDomain || '—' }}</dd>
          <dt class="text-slate-500">apiKey</dt><dd>{{ diagnostics.apiKeyShape.present ? diagnostics.apiKeyShape.length + ' car.' : 'ausente' }}</dd>
          <dt class="text-slate-500">uid</dt><dd class="truncate">{{ state.uid || 'sin sesión' }}</dd>
          <dt class="text-slate-500">grupo</dt><dd class="truncate">{{ activeGroupId || '—' }}</dd>
        </dl>
      </div>
    </section>

    <p class="px-1 text-[11px] text-slate-500">
      Usuario: {{ state.displayName || 'sin nombre' }} · ID: {{ shortUid }}
      <template v-if="state.lastSyncAt"> · última sincronización: {{ lastSyncLabel }}</template>
    </p>
    </template>
  </div>
</template>

<script setup>
/**
 * Comunidad — resumen de escucha compartido con grupos de amigos.
 *
 * Antes se llamaba «Liga» y luego «Friendly-Wrapped». Se puede pertenecer a
 * varios grupos y salirse de cualquiera de ellos, y el ranking se lee de la
 * última publicación real del grupo.
 *
 * La pantalla se ordena por lo que se viene a hacer: arriba el árbol de modos y
 * grupos (dónde estás y a dónde puedes saltar, de un modo o del otro), luego los
 * resultados del grupo abierto y debajo las dos únicas acciones posibles, crear
 * o unirse, que despliegan su formulario al elegirlas.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { defineAsyncComponent } from 'vue'
import { useLeague, normalizeInviteCode, resultadoVisible } from '@/composables/useLeague'
import GrupoDetalle from '@/components/grupos/GrupoDetalle.vue'
import ComunidadArbol from '@/components/grupos/ComunidadArbol.vue'
import GrupoIcono from '@/components/grupos/GrupoIcono.js'
import { resumirRanking, formatearHorasCorto } from '@/lib/gruposResumen'
// Los grupos sin servidor se leen de un módulo ligero, no de useLocalLeague:
// así el árbol los enseña sin cargar libsodium (ver src/lib/comunidadLocal.js).
import { gruposLocales, grupoLocalActivo, pedirGrupoLocal, releerCopiaLocal } from '@/lib/comunidadLocal'

// El modo sin servidor arrastra libsodium (WASM): se carga sólo al elegirlo.
const LocalHostPanel = defineAsyncComponent(() => import('@/components/LocalHostPanel.vue'))

/** Igual en los dos modos (MAX_GROUPS de cada composable); el local no se importa aquí. */
const MAX_GROUPS_LOCAL = 5

const MODO_KEY = 'skippify-community-mode'
function modoInicial () {
  try {
    const guardado = localStorage.getItem(MODO_KEY)
    if (guardado === 'local' || guardado === 'servidor') return guardado
  } catch { /* sin almacenamiento */ }
  return 'servidor'
}
const modo = ref(modoInicial())
function elegirModo (id) {
  modo.value = id
  try { localStorage.setItem(MODO_KEY, id) } catch { /* sin almacenamiento */ }
}

const {
  enabled,
  MAX_GROUPS,
  state,
  groups,
  activeGroup,
  activeGroupId,
  activeLeaderboard,
  activeMembers,
  members,
  leaderboards,
  activeLastUpdate,
  memberCount,
  loadGroupMembers,
  weeklyMembers,
  authLoading,
  syncing,
  loadingLeaderboard,
  error,
  message,
  nextPublishLabel,
  activeResultPending,
  ensureAuth,
  createGroup,
  joinGroup,
  leaveGroup,
  setActiveGroup,
  loadLeaderboard,
  loadCurrentGroupInfo,
  refreshAll,
  repararAcceso,
  diagnostics
} = useLeague()

const displayName = ref(state.value.displayName || '')
const groupNameInput = ref('')
const inviteCodeInput = ref('')
const nextPublishCountdown = ref('calculando…')
const confirmLeaveId = ref('')
const copied = ref(false)
/** '' | 'crear' | 'unirme': qué formulario está desplegado. */
const accion = ref('')
const reparando = ref(false)
const verDiagnostico = ref(false)

/**
 * Un rechazo de las reglas se arregla casi siempre rehaciendo la ficha de
 * miembro, así que se detecta por el texto para ofrecer el botón en vez de
 * dejar al usuario con un mensaje sin salida.
 */
const accesoRechazado = computed(() => /rechazó el acceso/i.test(error.value || ''))

const opciones = [
  {
    id: 'crear',
    icon: 'plus',
    title: 'Crear grupo',
    description: 'Abres un grupo nuevo y repartes su código.'
  },
  {
    id: 'unirme',
    icon: 'key',
    title: 'Unirme a grupo',
    description: 'Entras en uno que ya existe con su código.'
  }
]

const AUTO_SYNC_MS = 30 * 60 * 1000
let autoSyncTimer = null
let countdownTimer = null
let confirmTimer = null
let copiedTimer = null

const busy = computed(() => syncing.value || loadingLeaderboard.value || authLoading.value)
const canUseUsername = computed(() => (displayName.value || '').trim().length >= 3)
const canJoin = computed(() => canUseUsername.value && normalizeInviteCode(inviteCodeInput.value).length === 6)

const shortUid = computed(() => shortenUid(state.value.uid))

const weekLabel = computed(() => {
  const key = (activeLeaderboard.value?.weekKey || '').toString()
  if (!key) return ''
  const d = new Date(`${key}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? `Semana ${key}`
    : `Semana del ${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`
})

const lastSyncLabel = computed(() => {
  const d = new Date(state.value.lastSyncAt || 0)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES')
})

function fechaCorta (fecha) {
  try {
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  } catch {
    return ''
  }
}

function fechaLarga (fecha) {
  try {
    return fecha.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function shortenUid (value) {
  const uid = (value || '').toString()
  return uid ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : 'no conectado'
}

function groupLabel (group) {
  if (!group) return 'Grupo'
  return group.name || (group.inviteCode ? `Grupo ${group.inviteCode}` : `Grupo ${group.groupId.slice(0, 6)}`)
}

function formatScore (value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(1) : '0.0'
}

function getTrackCount (item) {
  for (const value of [item?.totalTracks, item?.completedTracks]) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

/**
 * Devuelven cadena vacía cuando no hay dato, y la línea entera desaparece. El
 * relleno «sin datos» ocupaba dos renglones para decir que no había nada que
 * decir, justo en la ficha de quien menos ha escuchado.
 */
function getTopArtist (item) {
  return (item?.topArtist || '').toString().trim()
}

function getTopTrack (item) {
  return (item?.topTrack || '').toString().trim()
}

// ── Repertorio, variedad y hora punta ────────────────────────────────────────
//
// Las tres llegan desde la v4.0.1. Un grupo cuyo último resultado se publicó
// antes no las trae, así que cada una comprueba su propio dato y la fila entera
// desaparece si no hay ninguna: la ficha se queda como estaba en vez de
// enseñar huecos.

const VARIETY_HINT = 'Canciones distintas sobre el total de escuchas: 100 % es no repetir ninguna.'

function numeroValido (value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function hasNewStats (item) {
  return !!(getDistinct(item) || getVariety(item) || getPeakHour(item))
}

/** «12 artistas · 34 temas», o cadena vacía si el resultado es anterior. */
function getDistinct (item) {
  const artistas = numeroValido(item?.distinctArtists)
  const temas = numeroValido(item?.distinctTracks)
  const partes = []
  if (artistas !== null) partes.push(`${artistas} ${artistas === 1 ? 'artista' : 'artistas'}`)
  if (temas !== null) partes.push(`${temas} ${temas === 1 ? 'tema' : 'temas'}`)
  return partes.join(' · ')
}

/**
 * El índice se publica como razón (0-1) y aquí se enseña en porcentaje, que es
 * como se lee de un vistazo. Se redondea sin decimales a propósito: la
 * precisión no aporta nada y alarga la línea.
 */
function getVariety (item) {
  const ratio = numeroValido(item?.varietyIndex)
  if (ratio === null) return ''
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)} % variedad`
}

/**
 * Franja horaria, no un instante: «21–22 h» dice mejor que «21:00» que se trata
 * de la hora en la que más se escuchó. `peakHour` vale null cuando no hubo
 * ninguna escucha, y 0 es la medianoche, así que no sirve comprobar el valor
 * por verdadero/falso.
 */
function getPeakHour (item) {
  const hora = numeroValido(item?.peakHour)
  if (hora === null || hora < 0 || hora > 23) return ''
  const siguiente = (hora + 1) % 24
  return `${hora}–${siguiente} h`
}

// ── Datos para las tarjetas y el detalle ─────────────────────────────────────
//
// Las dos piezas sólo pintan: aquí se traduce lo que publica Firebase al formato
// común de los dos modos. Un resultado anterior a la v4.0.1 no trae repertorio,
// variedad ni hora punta, y esas etiquetas simplemente no salen.

function fichasDe (groupId) {
  const visible = resultadoVisible(leaderboards[groupId], Date.now())
  return (visible?.members || []).map(item => ({
    id: item.uid,
    nombre: item.displayName || shortenUid(item.uid),
    yo: item.uid === state.value.uid,
    minutos: Number(item.totalMinutes || 0),
    canciones: getTrackCount(item),
    puntos: formatScore(item.score),
    artista: getTopArtist(item),
    tema: getTopTrack(item),
    extras: [
      getDistinct(item) && { texto: getDistinct(item) },
      getVariety(item) && { texto: getVariety(item), pista: VARIETY_HINT },
      getPeakHour(item) && { texto: getPeakHour(item) }
    ].filter(Boolean)
  }))
}

function resumenDe (groupId) {
  return resumirRanking(fichasDe(groupId))
}

const rankingVista = computed(() => fichasDe(activeGroupId.value))

const miembrosVista = computed(() => {
  const minutos = new Map(rankingVista.value.map(f => [f.id, f.minutos]))
  return activeMembers.value.map(m => ({
    id: m.uid,
    nombre: m.displayName || shortenUid(m.uid),
    yo: m.uid === state.value.uid,
    admin: m.role === 'owner',
    desde: m.joinedAt ? fechaCorta(m.joinedAt) : '',
    minutos: minutos.get(m.uid) || 0
  }))
})

const metaGrupo = computed(() => [
  `Próxima publicación: ${nextPublishLabel.value}`,
  `Cuenta atrás: ${nextPublishCountdown.value}`,
  activeLastUpdate.value ? `Última actualización: ${fechaLarga(activeLastUpdate.value)}` : ''
].filter(Boolean))

// ── Árbol de modos y grupos ──────────────────────────────────────────────────

/**
 * «3 miembros · 10 h 12 de escucha»: sólo lo que se sabe, nada de rellenos. Sin
 * «esta semana» porque en el modo con servidor la cifra es la del último ranking
 * publicado, que suele ser el de la semana anterior.
 */
function detalleNodo (miembros, minutos) {
  return [
    miembros ? `${miembros} ${miembros === 1 ? 'miembro' : 'miembros'}` : '',
    minutos ? `${formatearHorasCorto(minutos)} de escucha` : ''
  ].filter(Boolean).join(' · ')
}

const AVISOS_LOCAL = { joining: 'Esperando a entrar', restoring: 'Restaurando' }

const raices = computed(() => [
  {
    id: 'servidor',
    titulo: 'Con servidor',
    icono: 'server',
    max: MAX_GROUPS,
    activoId: activeGroupId.value,
    nota: enabled.value ? '' : 'Sin configurar en esta versión',
    grupos: groups.value.map(g => ({
      id: g.groupId,
      nombre: groupLabel(g),
      detalle: detalleNodo(memberCount(g.groupId), resumenDe(g.groupId).minutos)
    }))
  },
  {
    id: 'local',
    titulo: 'Sin servidor',
    icono: 'mesh',
    max: MAX_GROUPS_LOCAL,
    activoId: grupoLocalActivo.value,
    grupos: gruposLocales.value.map(g => ({
      id: g.id,
      nombre: g.nombre,
      aviso: AVISOS_LOCAL[g.estado] || '',
      detalle: detalleNodo(g.miembros, g.minutos)
    }))
  }
])

async function onArbolGrupo (modoGrupo, groupId) {
  elegirModo(modoGrupo)
  if (modoGrupo === 'local') pedirGrupoLocal(groupId)
  else if (groupId !== activeGroupId.value) await onSelectGroup(groupId)
}

/**
 * «Crear o unirme» lleva a la tarjeta de alta de ese modo. La del modo sin
 * servidor llega con el panel diferido, así que se espera a que exista.
 */
async function onArbolAlta (modoAlta) {
  elegirModo(modoAlta)
  await nextTick()
  const id = `comunidad-alta-${modoAlta}`
  const limite = Date.now() + 4000
  const buscar = () => {
    const el = document.getElementById(id)
    if (!el) {
      if (Date.now() < limite) requestAnimationFrame(buscar)
      return
    }
    // Con el panel sin servidor recién montado, Chrome cancela el desplazamiento
    // suave (el panel sigue recolocándose mientras sincroniza). Si no ha llegado
    // a moverse, se salta de golpe: mejor sin animación que quedarse arriba.
    const antes = window.scrollY
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => {
      if (window.scrollY === antes) el.scrollIntoView({ block: 'start' })
    }, 400)
  }
  buscar()
}

async function handleCreateGroup () {
  const groupId = await createGroup({
    displayName: displayName.value,
    groupName: groupNameInput.value
  })
  if (!groupId) return
  groupNameInput.value = ''
  accion.value = ''
  await loadCurrentGroupInfo(groupId)
  await loadGroupMembers(groupId)
  await loadLeaderboard({ silent: true, groupId })
}

async function handleJoinGroup () {
  const groupId = await joinGroup({
    inviteCode: inviteCodeInput.value,
    displayName: displayName.value
  })
  if (!groupId) return
  inviteCodeInput.value = ''
  accion.value = ''
  await loadCurrentGroupInfo(groupId)
  await loadGroupMembers(groupId)
  await loadLeaderboard({ silent: true, groupId })
}

async function onSelectGroup (groupId) {
  setActiveGroup(groupId)
  await loadGroupMembers(groupId)
  await loadLeaderboard({ silent: true, groupId })
}

/** Salir es irreversible sin el código: se pide una segunda pulsación. */
async function onLeave (group) {
  if (confirmLeaveId.value !== group.groupId) {
    confirmLeaveId.value = group.groupId
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmLeaveId.value = '' }, 4000)
    return
  }
  confirmLeaveId.value = ''
  const left = await leaveGroup(group.groupId)
  if (left && activeGroupId.value) {
    await loadLeaderboard({ silent: true, groupId: activeGroupId.value })
  }
}

async function onRepair () {
  reparando.value = true
  try {
    await repararAcceso(activeGroupId.value)
  } finally {
    reparando.value = false
  }
}

async function onRefresh () {
  await refreshAll({ silent: false })
}

async function copyInviteCode () {
  const code = (activeGroup.value?.inviteCode || '').toString()
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // La Clipboard API no existe fuera de contextos seguros.
    error.value = `No se pudo copiar. El código es ${code}.`
  }
}

/** Próximo domingo a las 15:00 en Europe/Madrid. */
function nextSunday1500Date () {
  const nowMadrid = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const target = new Date(nowMadrid)
  target.setDate(nowMadrid.getDate() + ((7 - nowMadrid.getDay()) % 7))
  target.setHours(15, 0, 0, 0)
  if (target <= nowMadrid) target.setDate(target.getDate() + 7)
  return { now: nowMadrid, target }
}

function updateCountdown () {
  const { now, target } = nextSunday1500Date()
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) {
    nextPublishCountdown.value = 'publicando resultados…'
    return
  }

  const totalMinutes = Math.floor(diff / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  nextPublishCountdown.value = `${days}d ${hours}h ${minutes}m`
}

onMounted(async () => {
  releerCopiaLocal()
  updateCountdown()
  countdownTimer = setInterval(updateCountdown, 30000)
  autoSyncTimer = setInterval(() => { refreshAll({ silent: true }) }, AUTO_SYNC_MS)

  await ensureAuth()
  if (!displayName.value) displayName.value = state.value.displayName || ''
  if (groups.value.length) await refreshAll({ silent: true })
})

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (autoSyncTimer) clearInterval(autoSyncTimer)
  if (confirmTimer) clearTimeout(confirmTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
  countdownTimer = null
  autoSyncTimer = null
  confirmTimer = null
  copiedTimer = null
})
</script>

<style scoped>
.desplegar-enter-active, .desplegar-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 340px;
}
.desplegar-enter-from, .desplegar-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
