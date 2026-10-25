<template>
  <div class="space-y-4">
    <template v-if="activeGroup">
      <!-- La lista de grupos vive en el árbol de CommunityView: aquí sólo el abierto. -->
      <GrupoDetalle
        :nombre="activeGroup.name"
        :meta="lastSync ? [`Última sincronización: ${lastSync}`] : []"
        :miembros="miembrosVista"
        :ranking="rankingVista"
      >
        <template #acciones>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="syncing" @click="onRefresh">
            <GrupoIcono name="refresh" class="h-3.5 w-3.5" />{{ syncing ? 'Sincronizando…' : 'Actualizar' }}
          </button>
          <button class="sk-btn sk-btn-danger sk-btn-sm" @click="onLeave(activeGroup)">
            {{ confirmLeaveId === activeGroup.groupId ? '¿Seguro? Pulsa otra vez' : 'Salir del grupo' }}
          </button>
        </template>

        <template #aviso>
          <p
            v-if="activeStatus !== 'ready'"
            class="mt-3 rounded-card bg-sky-500/[0.12] px-3.5 py-3 text-xs text-sky-200"
          >
            <template v-if="activeStatus === 'joining'">
              Esperando a que un miembro del grupo tenga la app abierta y te deje entrar. Mantén esta app abierta: se comprueba cada pocos segundos. La invitación vale 24 horas.
            </template>
            <template v-else-if="activeStatus === 'expelled'">
              Ya no formas parte de este grupo: un administrador te ha expulsado, o llevabas 30 días sin
              enviar nada y se te dio de baja. Lo que ya tenías sigue en este móvil. Pulsa «Salir del grupo»
              para quitarlo y pide una invitación nueva si quieres volver.
            </template>
            <template v-else>
              Restaurando: este móvil recibirá las llaves del grupo en cuanto otro miembro sincronice.
            </template>
          </p>
          <p
            v-if="activeGroup?.expulsados?.length"
            class="mt-2 text-[11px] text-slate-500"
          >
            Baja automática por 30 días sin actividad: {{ activeGroup.expulsados.map(e => e.nombre).join(', ') }}.
          </p>
        </template>

        <template #vistas>
          <div class="flex items-center gap-1.5">
            <button
              v-for="op in vistas"
              :key="op.id"
              type="button"
              class="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
              :class="vista === op.id ? 'bg-white text-black' : 'bg-white/[0.08] text-slate-300 hover:bg-white/[0.16]'"
              @click="onVista(op.id)"
            >{{ op.label }}</button>
          </div>
        </template>

        <template #avisoRanking>
          <p v-if="activeLeaderboard?.provisional" class="mt-2 text-[11px] text-amber-200/80">
            Provisional: puede cambiar cuando los demás miembros abran la app y publiquen sus últimas escuchas.
          </p>
        </template>

        <div class="sk-divider my-4" />

        <!-- Invitar -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-white">Invitar</h3>
          <div class="flex flex-wrap gap-2">
            <button
              class="sk-btn sk-btn-primary sk-btn-sm"
              :disabled="activeStatus !== 'ready' || invitingExpres"
              @click="onExpres"
            >
              <GrupoIcono name="bolt" class="h-3.5 w-3.5" />{{ invitingExpres ? 'Generando…' : 'Invitación exprés' }}
            </button>
            <button
              class="sk-btn sk-btn-ghost sk-btn-sm"
              :disabled="activeStatus !== 'ready' || inviting"
              @click="onInvite"
            >
              {{ inviting ? 'Generando…' : 'Invitación larga' }}
            </button>
          </div>
        </div>
        <InvitacionExpres
          v-if="expres"
          class="mt-3"
          :codigo="expres.codigo"
          :caduca="expres.caduca"
          :nombre-grupo="activeGroup.name"
          @nueva="onExpres"
        />
        <div v-if="inviteCode" class="mt-3 space-y-2.5">
          <img v-if="inviteQr" :src="inviteQr" alt="QR de la invitación" class="mx-auto h-44 w-44 rounded-lg bg-white p-2">
          <p class="break-all rounded-md bg-white/[0.05] p-2.5 font-mono text-[10px] text-slate-300">{{ inviteCode }}</p>
          <div class="flex flex-wrap gap-2">
            <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="copiar(inviteCode, 'invitación')">
              <GrupoIcono :name="copiado === 'invitación' ? 'check' : 'copy'" class="h-3.5 w-3.5" />{{ copiado === 'invitación' ? 'Copiado' : 'Copiar' }}
            </button>
            <button v-if="canShare" class="sk-btn sk-btn-ghost sk-btn-sm" @click="compartir(inviteCode)">
              <GrupoIcono name="share" class="h-3.5 w-3.5" />Compartir
            </button>
          </div>
          <p class="text-[11px] text-slate-500">Vale 24 horas y se puede usar una sola vez. Mantén la app abierta hasta que la otra persona entre: es tu móvil quien la deja pasar.</p>
        </div>

        <div class="sk-divider my-4" />

        <!-- Dispositivos y copia -->
        <div class="flex flex-wrap gap-2">
          <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="activeStatus !== 'ready'" @click="onLinkCode">
            Vincular otro móvil mío
          </button>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="activeStatus !== 'ready'" @click="verCopia = !verCopia">
            Copia de seguridad
          </button>
        </div>
        <div v-if="linkCode" class="mt-3 space-y-2">
          <p class="break-all rounded-md bg-white/[0.05] p-2.5 font-mono text-[10px] text-slate-300">{{ linkCode }}</p>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="copiar(linkCode, 'vinculación')">
            {{ copiado === 'vinculación' ? 'Copiado' : 'Copiar código' }}
          </button>
          <p class="text-[11px] text-slate-500">
            Pégalo en «Vincular este móvil» desde el otro dispositivo. Vale 24 horas.
          </p>
        </div>
        <div v-if="verCopia" class="mt-3 space-y-2">
          <input v-model="passwordCopia" type="password" class="sk-input" placeholder="Contraseña de la copia (mín. 8)">
          <button class="sk-btn sk-btn-primary sk-btn-sm w-full" :disabled="passwordCopia.length < 8" @click="onBackup">
            Crear copia cifrada
          </button>
          <textarea
            v-if="backupText"
            readonly
            rows="4"
            class="sk-input w-full break-all font-mono text-[10px]"
            :value="backupText"
          />
          <button v-if="backupText" class="sk-btn sk-btn-ghost sk-btn-sm" @click="copiar(backupText, 'copia')">
            {{ copiado === 'copia' ? 'Copiado' : 'Copiar copia' }}
          </button>
          <p class="text-[11px] text-slate-500">
            Guárdala en un lugar seguro: sin ella, si pierdes todos tus móviles, pierdes el acceso al grupo.
          </p>
        </div>
      </GrupoDetalle>
    </template>

    <!-- Crear / unirme / vincular / restaurar -->
    <section id="comunidad-alta-local" class="sk-card scroll-mt-4 p-5">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="sk-title">{{ groups.length ? 'Entrar en otro grupo' : 'Empieza aquí' }}</h2>
        <span class="text-[11px] text-slate-500">Se sincroniza cada minuto con la app abierta</span>
      </header>
      <div class="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          v-for="opcion in opciones"
          :key="opcion.id"
          type="button"
          class="rounded-xl border p-3 text-left transition-all duration-200"
          :class="accion === opcion.id ? 'sk-option-active' : 'sk-option'"
          @click="accion = accion === opcion.id ? '' : opcion.id"
        >
          <span
            class="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            :class="accion === opcion.id ? 'bg-brand-400/25 text-brand-200' : 'bg-white/[0.08] text-slate-300'"
          >
            <GrupoIcono :name="opcion.icon" class="h-[18px] w-[18px]" />
          </span>
          <p class="mt-1.5 text-sm font-bold text-white">{{ opcion.title }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">{{ opcion.description }}</p>
        </button>
      </div>

      <div v-if="accion" class="mt-4 border-t border-white/[0.07] pt-4">
        <label class="block">
          <span class="sk-eyebrow">Tu nombre en los rankings</span>
          <input v-model.trim="displayName" class="sk-input mt-1.5" maxlength="24" placeholder="Nombre de usuario (mín. 3 caracteres)">
        </label>

        <template v-if="accion === 'crear'">
          <input v-model.trim="groupNameInput" class="sk-input mt-3" maxlength="32" placeholder="Nombre del grupo (opcional)">
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!canUseName || busy" @click="onCreate">
            Crear grupo
          </button>
        </template>

        <template v-else-if="accion === 'unirme'">
          <input
            v-model.trim="codigoInput"
            class="sk-input mt-3 w-full font-mono"
            placeholder="Código exprés (K7QM-4TXD) o invitación larga (lh1:…)"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
          >
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!canUseName || !codigoInput || busy" @click="onJoin">
            Unirme al grupo
          </button>
          <p class="mt-2 text-[11px] text-slate-500">El código exprés vale 30 minutos; la invitación larga, 24 horas.</p>
        </template>

        <template v-else-if="accion === 'vincular'">
          <textarea v-model.trim="codigoInput" rows="3" class="sk-input mt-3 w-full font-mono text-[10px]" placeholder="Pega aquí el código de vinculación (lhl1:)" />
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!canUseName || !codigoInput || busy" @click="onLink">
            Vincular este móvil
          </button>
        </template>

        <template v-else>
          <textarea v-model.trim="backupInput" rows="3" class="sk-input mt-3 w-full font-mono text-[10px]" placeholder="Pega aquí la copia de seguridad" />
          <input v-model="passwordRestore" type="password" class="sk-input mt-3" placeholder="Contraseña de la copia">
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!backupInput || !passwordRestore || busy" @click="onRestore">
            Restaurar
          </button>
        </template>
      </div>

      <p v-if="message" class="mt-3 text-xs text-brand-400">{{ message }}</p>
      <div v-if="error" class="mt-3 rounded-card bg-rose-500/[0.16] px-3.5 py-3">
        <p class="text-xs text-rose-200">{{ error }}</p>
      </div>
    </section>

    <p class="px-1 text-[11px] text-slate-500">
      Los relays solo ven direcciones IP, horas y tamaños de mensaje; nunca el contenido ni quién es quién.
      Si sales de un grupo se borra la copia de este móvil.
    </p>
  </div>
</template>

<script setup>
/**
 * Panel de Comunidad sin servidor (modo LocalHost). Vive junto al de Firebase
 * en CommunityView y no comparte estado con él: un grupo es de un modo o del otro.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLocalLeague } from '@/composables/useLocalLeague'
import { extrasBase, extrasNuevos, ordenarPorTiempo } from '@/lib/gruposExtras'
import GrupoDetalle from '@/components/grupos/GrupoDetalle.vue'
import InvitacionExpres from '@/components/grupos/InvitacionExpres.vue'
import GrupoIcono from '@/components/grupos/GrupoIcono.js'
import { conectarLocal, grupoLocalPedido } from '@/lib/comunidadLocal'

const {
  state,
  groups,
  activeGroup,
  activeGroupId,
  statuses,
  members,
  activeMembers,
  activeLeaderboard,
  leaderboards,
  lastSyncByGroup,
  syncing,
  error,
  message,
  createGroup,
  joinGroup,
  leaveGroup,
  setActiveGroup,
  createInvite,
  createExpressInvite,
  createLinkCode,
  linkDevice,
  exportBackup,
  restoreBackup,
  loadLeaderboard,
  refreshAll,
  startWatch
} = useLocalLeague()

const displayName = ref(state.value.displayName || '')
const groupNameInput = ref('')
const codigoInput = ref('')
const backupInput = ref('')
const passwordRestore = ref('')
const passwordCopia = ref('')
const backupText = ref('')
const inviteCode = ref('')
const inviteQr = ref('')
const expres = ref(null)
const invitingExpres = ref(false)
const linkCode = ref('')
const inviting = ref(false)
const copiado = ref('')
const verCopia = ref(false)
const accion = ref('')
const confirmLeaveId = ref('')
const vista = ref('actual')
let copiadoTimer = null
let confirmTimer = null

const vistas = [
  { id: 'actual', label: 'Esta semana' },
  { id: 'pasada', label: 'Semana pasada' }
]
const opciones = [
  { id: 'crear', icon: 'plus', title: 'Crear grupo', description: 'Abres uno nuevo y generas invitaciones.' },
  { id: 'unirme', icon: 'key', title: 'Unirme', description: 'Con el código de un amigo.' },
  { id: 'vincular', icon: 'phone', title: 'Vincular móvil', description: 'Añadir este móvil a tu cuenta.' },
  { id: 'restaurar', icon: 'restore', title: 'Restaurar', description: 'Desde una copia de seguridad.' }
]

const canUseName = computed(() => (displayName.value || '').trim().length >= 3)
const busy = computed(() => syncing.value)
const activeStatus = computed(() => statuses[activeGroupId.value] || 'ready')
const canShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')
const lastSync = computed(() => {
  const ms = lastSyncByGroup[activeGroupId.value]
  return ms ? new Date(ms).toLocaleString('es-ES') : ''
})

/** Fichas del ranking de un grupo, en el formato común de GrupoDetalle. */
function fichasDe (groupId) {
  const lb = leaderboards[groupId]
  const yo = (members[groupId] || []).find(m => m.you)?.uid
  const fichas = (lb?.members || []).map((item) => {
    const nuevos = extrasNuevos(item)
    return {
      id: item.uid,
      nombre: item.displayName,
      yo: item.uid === yo,
      minutos: Number(item.totalMinutes || 0),
      canciones: Number(item.totalTracks || 0),
      artista: item.topArtist || '',
      tema: item.topTrack || '',
      ...nuevos,
      datos: item,
      extras: [...extrasBase(item), ...nuevos.extras]
    }
  })
  return ordenarPorTiempo(fichas)
}

const rankingVista = computed(() => fichasDe(activeGroupId.value))
const miembrosVista = computed(() => {
  const minutos = new Map(rankingVista.value.map(f => [f.id, f.minutos]))
  return activeMembers.value.map(m => ({
    id: m.uid,
    nombre: m.displayName || 'Sin nombre',
    yo: m.you,
    admin: m.role === 'owner',
    desde: '',
    minutos: minutos.get(m.uid) || 0
  }))
})

async function copiar (texto, etiqueta) {
  try {
    await navigator.clipboard.writeText(texto)
    copiado.value = etiqueta
    if (copiadoTimer) clearTimeout(copiadoTimer)
    copiadoTimer = setTimeout(() => { copiado.value = '' }, 2000)
  } catch {
    error.value = 'No se pudo copiar. Selecciona el texto y cópialo a mano.'
  }
}

async function compartir (texto) {
  try { await navigator.share({ title: 'Invitación a Skippify', text: texto }) } catch { /* cancelado */ }
}

async function onCreate () {
  const id = await createGroup({ displayName: displayName.value, groupName: groupNameInput.value })
  if (!id) return
  groupNameInput.value = ''
  accion.value = ''
  inviteCode.value = ''
  expres.value = null
  await loadLeaderboard({ groupId: id, cual: vista.value })
}

async function onJoin () {
  const id = await joinGroup({ inviteCode: codigoInput.value, displayName: displayName.value })
  if (!id) return
  codigoInput.value = ''
  accion.value = ''
  inviteCode.value = ''
  expres.value = null
}

async function onLink () {
  const id = await linkDevice({ code: codigoInput.value, displayName: displayName.value })
  if (!id) return
  codigoInput.value = ''
  accion.value = ''
}

async function onRestore () {
  const id = await restoreBackup({
    backup: backupInput.value,
    password: passwordRestore.value,
    displayName: displayName.value
  })
  if (!id) return
  backupInput.value = ''
  passwordRestore.value = ''
  accion.value = ''
}

async function onInvite () {
  inviting.value = true
  inviteQr.value = ''
  try {
    inviteCode.value = await createInvite()
    if (inviteCode.value) {
      try {
        const { toDataURL } = await import('qrcode')
        inviteQr.value = await toDataURL(inviteCode.value, { margin: 1, width: 360, errorCorrectionLevel: 'L' })
      } catch { /* sin QR: queda el texto */ }
    }
  } finally {
    inviting.value = false
  }
}

async function onExpres () {
  invitingExpres.value = true
  try {
    expres.value = await createExpressInvite()
  } finally {
    invitingExpres.value = false
  }
}

async function onLinkCode () {
  linkCode.value = await createLinkCode()
}

async function onBackup () {
  backupText.value = await exportBackup(passwordCopia.value)
  if (backupText.value) passwordCopia.value = ''
}

async function onSelectGroup (groupId) {
  setActiveGroup(groupId)
  inviteCode.value = ''
  expres.value = null
  linkCode.value = ''
  backupText.value = ''
  await loadLeaderboard({ groupId, cual: vista.value })
}

async function onVista (id) {
  vista.value = id
  await loadLeaderboard({ cual: id })
}

async function onLeave (group) {
  if (confirmLeaveId.value !== group.groupId) {
    confirmLeaveId.value = group.groupId
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmLeaveId.value = '' }, 4000)
    return
  }
  confirmLeaveId.value = ''
  await leaveGroup(group.groupId)
}

async function onRefresh () {
  await refreshAll({ silent: false })
  await loadLeaderboard({ cual: vista.value })
}

// El árbol de CommunityView lee desde ahora el estado en vivo (estado de
// entrada, miembros, cifras) en vez de la caché de localStorage. Se le pasan
// los objetos reactivos, no una copia, para que siga al día con el panel cerrado.
conectarLocal({ state, statuses, members, leaderboards })

// Un grupo elegido en el árbol: se atiende al montar (si se eligió con el panel
// todavía sin cargar) o al momento si ya estaba a la vista.
watch(grupoLocalPedido, (id) => {
  if (!id) return
  grupoLocalPedido.value = ''
  if (id !== activeGroupId.value) void onSelectGroup(id)
}, { immediate: true })

onMounted(async () => {
  startWatch()
  if (groups.value.length) await onRefresh()
})

onBeforeUnmount(() => {
  if (copiadoTimer) clearTimeout(copiadoTimer)
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>
