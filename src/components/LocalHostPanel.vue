<template>
  <div class="space-y-4">
    <section class="sk-card p-5">
      <h2 class="sk-title">Comunidad sin servidor</h2>
      <p class="sk-subtitle">
        Los grupos viven en los propios móviles y se sincronizan cifrados por relays públicos.
        No dependen de ninguna base de datos. El ranking lo calcula cada móvil y se confirma
        cuando todos los miembros han abierto la app.
      </p>
    </section>

    <template v-if="activeGroup">
      <section v-if="groups.length > 1" class="sk-card p-5">
        <header class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="sk-title">Tus grupos sin servidor</h2>
          <span class="sk-chip">{{ groups.length }} / {{ MAX_GROUPS }}</span>
        </header>
        <div class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="group in groups"
            :key="group.groupId"
            type="button"
            class="flex max-w-full items-center gap-2 rounded-full border border-transparent px-3.5 py-2 text-left transition-colors"
            :class="group.groupId === activeGroupId ? 'bg-white text-black' : 'bg-white/[0.08] text-slate-200 hover:bg-white/[0.16]'"
            @click="onSelectGroup(group.groupId)"
          >
            <span class="min-w-0 truncate text-sm font-bold">{{ group.name }}</span>
          </button>
        </div>
      </section>

      <section class="sk-card sk-card-lit p-5">
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="sk-clamp-2 text-xl font-extrabold tracking-tightest text-white">{{ activeGroup.name }}</h2>
            <p v-if="lastSync" class="mt-1 text-xs text-slate-500">Última sincronización: {{ lastSync }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="syncing" @click="onRefresh">
              {{ syncing ? 'Sincronizando…' : 'Actualizar' }}
            </button>
            <button class="sk-btn sk-btn-danger sk-btn-sm" @click="onLeave(activeGroup)">
              {{ confirmLeaveId === activeGroup.groupId ? '¿Seguro? Pulsa otra vez' : 'Salir del grupo' }}
            </button>
          </div>
        </header>

        <p
          v-if="activeStatus !== 'ready'"
          class="mt-3 rounded-card bg-sky-500/[0.12] px-3.5 py-3 text-xs text-sky-200"
        >
          <template v-if="activeStatus === 'joining'">
            Esperando a que un miembro del grupo abra la app y te deje entrar. La invitación vale 24 horas.
          </template>
          <template v-else>
            Restaurando: este móvil recibirá las llaves del grupo en cuanto otro miembro sincronice.
          </template>
        </p>

        <div class="sk-divider my-4" />

        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-white">Miembros</h3>
          <span class="sk-chip">{{ activeMembers.length || '—' }}</span>
        </div>
        <ul v-if="activeMembers.length" class="mt-3 flex flex-wrap gap-2">
          <li
            v-for="miembro in activeMembers"
            :key="miembro.uid"
            class="flex max-w-full items-center gap-2 rounded-full px-2.5 py-1.5"
            :class="miembro.you ? 'bg-brand-400/[0.16]' : 'bg-white/[0.06]'"
          >
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase"
              :class="miembro.you ? 'bg-brand-400 text-black' : 'bg-white/[0.12] text-slate-300'"
            >{{ (miembro.displayName || '·').slice(0, 1) }}</span>
            <span class="min-w-0 truncate text-xs text-slate-200">
              {{ miembro.displayName }}
              <span v-if="miembro.you" class="text-[10px] uppercase tracking-wider text-brand-400">tú</span>
              <span v-if="miembro.role === 'owner'" class="text-[10px] text-slate-500"> · admin</span>
            </span>
          </li>
        </ul>
        <p v-else class="mt-3 text-xs text-slate-500">Todavía no se ha podido leer la lista de miembros.</p>

        <div class="sk-divider my-4" />

        <!-- Invitar -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-white">Invitar</h3>
          <button
            class="sk-btn sk-btn-ghost sk-btn-sm"
            :disabled="activeStatus !== 'ready' || inviting"
            @click="onInvite"
          >
            {{ inviting ? 'Generando…' : 'Generar invitación' }}
          </button>
        </div>
        <div v-if="inviteCode" class="mt-3 space-y-2.5">
          <img v-if="inviteQr" :src="inviteQr" alt="QR de la invitación" class="mx-auto h-44 w-44 rounded-lg bg-white p-2">
          <p class="break-all rounded-md bg-white/[0.05] p-2.5 font-mono text-[10px] text-slate-300">{{ inviteCode }}</p>
          <div class="flex flex-wrap gap-2">
            <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="copiar(inviteCode, 'invitación')">
              {{ copiado === 'invitación' ? '¡Copiado!' : 'Copiar' }}
            </button>
            <button v-if="canShare" class="sk-btn sk-btn-ghost sk-btn-sm" @click="compartir(inviteCode)">Compartir</button>
          </div>
          <p class="text-[11px] text-slate-500">Vale 24 horas y se puede usar una sola vez.</p>
        </div>

        <div class="sk-divider my-4" />

        <!-- Resultados -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-white">Resultados semanales</h3>
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
        </div>
        <p v-if="activeLeaderboard?.provisional" class="mt-2 text-[11px] text-amber-200/80">
          Provisional: puede cambiar cuando los demás miembros abran la app y publiquen sus últimas escuchas.
        </p>
        <p v-if="!weekly.length" class="mt-3 text-xs text-slate-500">Todavía no hay datos de esta semana.</p>
        <ul v-else class="mt-3.5 space-y-2">
          <li
            v-for="(item, idx) in weekly"
            :key="`${item.uid}-${idx}`"
            class="flex items-center justify-between gap-3 rounded-md px-3 py-2.5"
            :class="item.uid === meUid ? 'bg-brand-400/[0.14]' : 'bg-white/[0.05]'"
          >
            <div class="min-w-0">
              <p class="sk-clamp-2 text-sm font-semibold text-white">
                {{ rankLabel(idx) }} {{ item.displayName }}
                <span v-if="item.uid === meUid" class="ml-1 text-[10px] uppercase tracking-wider text-brand-400">tú</span>
              </p>
              <p class="mt-0.5 text-[11px] text-slate-400">
                {{ formatHours(item.totalMinutes) }} · {{ item.totalTracks || 0 }} canciones
              </p>
              <p v-if="item.topArtist" class="mt-0.5 truncate text-[11px] text-slate-500">🎤 {{ item.topArtist }}</p>
              <p v-if="item.topTrack" class="mt-0.5 truncate text-[11px] text-slate-500">🎵 {{ item.topTrack }}</p>
            </div>
            <span class="shrink-0 font-mono text-sm font-bold tabular-nums text-brand-400">{{ Number(item.score || 0).toFixed(1) }}</span>
          </li>
        </ul>

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
            {{ copiado === 'vinculación' ? '¡Copiado!' : 'Copiar código' }}
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
            {{ copiado === 'copia' ? '¡Copiado!' : 'Copiar copia' }}
          </button>
          <p class="text-[11px] text-slate-500">
            Guárdala en un lugar seguro: sin ella, si pierdes todos tus móviles, pierdes el acceso al grupo.
          </p>
        </div>
      </section>
    </template>

    <!-- Crear / unirme / vincular / restaurar -->
    <section class="sk-card p-5">
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
          <span class="text-lg">{{ opcion.icon }}</span>
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
          <textarea v-model.trim="codigoInput" rows="3" class="sk-input mt-3 w-full font-mono text-[10px]" placeholder="Pega aquí la invitación (empieza por lh1:)" />
          <button class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full" :disabled="!canUseName || !codigoInput || busy" @click="onJoin">
            Unirme al grupo
          </button>
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLocalLeague } from '@/composables/useLocalLeague'

const {
  MAX_GROUPS,
  state,
  groups,
  activeGroup,
  activeGroupId,
  statuses,
  activeMembers,
  activeLeaderboard,
  lastSyncByGroup,
  syncing,
  error,
  message,
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
const linkCode = ref('')
const inviting = ref(false)
const copiado = ref('')
const verCopia = ref(false)
const accion = ref('')
const confirmLeaveId = ref('')
const vista = ref('pasada')
let copiadoTimer = null
let confirmTimer = null

const vistas = [
  { id: 'pasada', label: 'Semana pasada' },
  { id: 'actual', label: 'Esta semana' }
]
const opciones = [
  { id: 'crear', icon: '➕', title: 'Crear grupo', description: 'Abres uno nuevo y generas invitaciones.' },
  { id: 'unirme', icon: '🔑', title: 'Unirme', description: 'Con la invitación de un amigo.' },
  { id: 'vincular', icon: '📱', title: 'Vincular móvil', description: 'Añadir este móvil a tu cuenta.' },
  { id: 'restaurar', icon: '♻️', title: 'Restaurar', description: 'Desde una copia de seguridad.' }
]

const canUseName = computed(() => (displayName.value || '').trim().length >= 3)
const busy = computed(() => syncing.value)
const activeStatus = computed(() => statuses[activeGroupId.value] || 'ready')
const canShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')
const weekly = computed(() => activeLeaderboard.value?.members || [])
const meUid = computed(() => activeMembers.value.find(m => m.you)?.uid || '')
const lastSync = computed(() => {
  const ms = lastSyncByGroup[activeGroupId.value]
  return ms ? new Date(ms).toLocaleString('es-ES') : ''
})

function rankLabel (idx) {
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return `#${idx + 1}`
}

function formatHours (minutesValue) {
  const total = Math.max(0, Math.round(Number(minutesValue || 0)))
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`
}

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
  await loadLeaderboard({ groupId: id, cual: vista.value })
}

async function onJoin () {
  const id = await joinGroup({ inviteCode: codigoInput.value, displayName: displayName.value })
  if (!id) return
  codigoInput.value = ''
  accion.value = ''
  inviteCode.value = ''
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

onMounted(async () => {
  startWatch()
  if (groups.value.length) await onRefresh()
})

onBeforeUnmount(() => {
  if (copiadoTimer) clearTimeout(copiadoTimer)
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>
