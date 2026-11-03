<template>
  <div class="space-y-4">
    <!-- El detalle se monta dentro del panel plegable del grupo abierto
         (CommunityView deja ahí un hueco con id `grupo-cuerpo-<id>`). -->
    <Teleport v-if="activeGroup && abierto && abierto === activeGroupId" defer :to="`#grupo-cuerpo-${activeGroupId}`">
    <GrupoDetalle
      :nombre="activeGroup.name"
      :miembros="miembrosVista"
      :ranking="rankingVista"
      :es-admin="esAdmin"
      :puede-invitar="activeStatus === 'ready'"
      :invitando="invitingExpres"
      :actualizando="syncing"
      :ultima-sync="lastSync"
      @actualizar="onRefresh"
      @invitar="onExpres"
      @abandonar="leaveGroup(activeGroup.groupId)"
      @expulsar="onExpulsar"
      @renombrar="onRenombrar"
    >
      <template #aviso>
        <p
          v-if="activeStatus !== 'ready'"
          class="mx-5 mb-4 rounded-card bg-sky-500/[0.12] px-3.5 py-3 text-xs text-sky-200"
        >
          <template v-if="activeStatus === 'joining'">
            Esperando a que un miembro del grupo tenga la app abierta y te deje entrar. Mantén esta app abierta: se comprueba cada pocos segundos.
          </template>
          <template v-else-if="activeStatus === 'expelled'">
            Ya no formas parte de este grupo: un administrador te ha expulsado, o llevabas 30 días sin
            enviar nada y se te dio de baja. Lo que ya tenías sigue en este móvil. Pulsa «Abandonar»
            para quitarlo y pide una invitación nueva si quieres volver.
          </template>
          <template v-else>
            Restaurando: este móvil recibirá las llaves del grupo en cuanto otro miembro sincronice.
          </template>
        </p>
        <p v-if="message || error" class="mx-5 mb-4 text-xs" :class="error ? 'text-rose-300' : 'text-brand-400'">{{ error || message }}</p>
      </template>

      <template #invitacion>
        <InvitacionExpres
          v-if="expres"
          class="mt-3"
          :codigo="expres.codigo"
          :caduca="expres.caduca"
          :nombre-grupo="activeGroup.name"
          @nueva="onExpres"
        />
      </template>
    </GrupoDetalle>
    </Teleport>

    <!-- Crear o unirme: sube desde abajo al pulsar una de las opciones de «Añadir grupo». -->
    <HojaInferior :abierta="!!nuevo" titulo="Nuevo grupo" @cerrar="$emit('update:nuevo', '')">
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="opcion in opciones"
          :key="opcion.id"
          type="button"
          class="rounded-xl border p-3.5 text-left transition-all duration-200"
          :class="accion === opcion.id ? 'sk-option-active' : 'sk-option'"
          @click="accion = opcion.id"
        >
          <span
            class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
            :class="accion === opcion.id ? 'bg-brand-400/25 text-brand-200' : 'bg-white/[0.08] text-slate-300'"
          >
            <GrupoIcono :name="opcion.icon" class="h-5 w-5" />
          </span>
          <p class="mt-2 text-sm font-bold text-white">{{ opcion.title }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">{{ opcion.description }}</p>
        </button>
      </div>

      <div class="mt-4 border-t border-white/[0.07] pt-4">
        <label class="block">
          <span class="sk-eyebrow">Tu nombre en los rankings</span>
          <input v-model.trim="displayName" class="sk-input mt-1.5" maxlength="24" placeholder="Nombre de usuario (mín. 3 caracteres)">
        </label>

        <template v-if="accion === 'crear'">
          <input v-model.trim="groupNameInput" class="sk-input mt-3" maxlength="32" placeholder="Nombre del grupo (opcional)">
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!canUseName || busy" @click="onCreate">
            Crear grupo
          </button>
          <p class="mt-2 text-[11px] text-slate-500">Serás el administrador: sólo tú podrás invitar y expulsar.</p>
        </template>

        <template v-else>
          <input
            v-model.trim="codigoInput"
            class="sk-input mt-3 w-full font-mono"
            placeholder="Código de invitación (K7QM-4TXD)"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
          >
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!canUseName || !codigoInput || busy" @click="onJoin">
            Unirme al grupo
          </button>
          <p class="mt-2 text-[11px] text-slate-500">El código lo genera el administrador del grupo y vale 1 hora.</p>
        </template>
      </div>

      <div v-if="error" class="mt-3 rounded-card bg-rose-500/[0.16] px-3.5 py-3">
        <p class="text-xs text-rose-200">{{ error }}</p>
      </div>
      <p v-else-if="message" class="mt-3 text-xs text-brand-400">{{ message }}</p>
    </HojaInferior>
  </div>
</template>

<script setup>
/**
 * Panel de un grupo de Grupos: sus resultados, la invitación exprés y la hoja
 * para crear o unirse a otro. Los grupos viven en los móviles (LocalHost), sin
 * servidor. La lista de grupos y las opciones de añadir están en CommunityView.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLocalLeague } from '@/composables/useLocalLeague'
import { extrasBase, extrasNuevos, ordenarPorTiempo } from '@/lib/gruposExtras'
import GrupoDetalle from '@/components/grupos/GrupoDetalle.vue'
import InvitacionExpres from '@/components/grupos/InvitacionExpres.vue'
import HojaInferior from '@/components/grupos/HojaInferior.vue'
import GrupoIcono from '@/components/grupos/GrupoIcono.js'
import { conectarLocal, grupoLocalPedido } from '@/lib/comunidadLocal'

const props = defineProps({
  /** Hoja de «Nuevo grupo»: '' cerrada, o la acción con la que se abre ('crear' | 'unirme'). */
  nuevo: { type: String, default: '' },
  /** Id del grupo cuyo panel está abierto (donde se monta el detalle). */
  abierto: { type: String, default: '' }
})
const emit = defineEmits(['update:nuevo'])

const {
  state,
  groups,
  activeGroup,
  activeGroupId,
  statuses,
  members,
  activeMembers,
  semanas,
  lastSyncByGroup,
  syncing,
  error,
  message,
  createGroup,
  joinGroup,
  leaveGroup,
  setActiveGroup,
  createExpressInvite,
  expulsarMiembro,
  renombrarGrupo,
  loadSemanas,
  refreshAll,
  startWatch
} = useLocalLeague()

const displayName = ref(state.value.displayName || '')
const groupNameInput = ref('')
const codigoInput = ref('')
const expres = ref(null)
const invitingExpres = ref(false)
const accion = ref('crear')

const opciones = [
  { id: 'crear', icon: 'plus', title: 'Crear grupo', description: 'Abres uno nuevo y eres su administrador.' },
  { id: 'unirme', icon: 'key', title: 'Unirme', description: 'Con el código de un amigo.' }
]

const canUseName = computed(() => (displayName.value || '').trim().length >= 3)
const busy = computed(() => syncing.value)
const activeStatus = computed(() => statuses[activeGroupId.value] || 'ready')
const esAdmin = computed(() => !!activeMembers.value.find(m => m.you && m.role === 'owner'))
const lastSync = computed(() => {
  const ms = lastSyncByGroup[activeGroupId.value]
  return ms ? new Date(ms).toLocaleString('es-ES') : ''
})

/** Fichas del ranking de una semana, en el formato común de GrupoDetalle. */
function fichasDe (groupId, lb) {
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

const rankingVista = computed(() => {
  const porSemana = semanas[activeGroupId.value] || {}
  return Object.fromEntries(['actual', 'pasada', 'hace2'].map(c => [c, fichasDe(activeGroupId.value, porSemana[c])]))
})
const miembrosVista = computed(() => {
  const minutos = new Map((rankingVista.value.actual || []).map(f => [f.id, f.minutos]))
  return activeMembers.value.map(m => ({
    id: m.uid,
    nombre: m.displayName || 'Sin nombre',
    yo: m.you,
    admin: m.role === 'owner',
    desde: '',
    minutos: minutos.get(m.uid) || 0
  }))
})

function cerrarHoja () { emit('update:nuevo', '') }

async function onCreate () {
  const id = await createGroup({ displayName: displayName.value, groupName: groupNameInput.value })
  if (!id) return
  groupNameInput.value = ''
  expres.value = null
  cerrarHoja()
  await loadSemanas(id)
}

async function onJoin () {
  const id = await joinGroup({ inviteCode: codigoInput.value, displayName: displayName.value })
  if (!id) return
  codigoInput.value = ''
  expres.value = null
  cerrarHoja()
}

async function onExpres () {
  invitingExpres.value = true
  try {
    expres.value = await createExpressInvite()
  } finally {
    invitingExpres.value = false
  }
}

async function onExpulsar (uid) {
  await expulsarMiembro(uid)
}

async function onRenombrar (nombre) {
  await renombrarGrupo(nombre)
}

async function onSelectGroup (groupId) {
  setActiveGroup(groupId)
  expres.value = null
  await loadSemanas(groupId)
}

async function onRefresh () {
  await refreshAll({ silent: false })
}

// El desplegable de CommunityView lee el estado en vivo (estado de entrada,
// miembros, cifras) en vez de la caché de localStorage. Se le pasan los objetos
// reactivos, no una copia, para que siga al día con el panel cerrado.
conectarLocal({ state, statuses, members, semanas })

// Un grupo elegido en el desplegable: se atiende al montar o al momento.
watch(grupoLocalPedido, (id) => {
  if (!id) return
  grupoLocalPedido.value = ''
  if (id !== activeGroupId.value) void onSelectGroup(id)
}, { immediate: true })

// Abrir la hoja deja el mensaje de la acción anterior fuera.
watch(() => props.nuevo, (cual) => {
  if (!cual) return
  accion.value = cual === 'unirme' ? 'unirme' : 'crear'
  error.value = ''
  message.value = ''
})

onMounted(async () => {
  startWatch()
  if (groups.value.length) await onRefresh()
})

onBeforeUnmount(() => { expres.value = null })
</script>
