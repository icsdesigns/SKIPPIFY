<template>
  <div class="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-400/[0.20] via-brand-400/[0.07] to-transparent p-5 ring-1 ring-brand-400/30">
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-300">
        <GrupoIcono name="bolt" class="h-3.5 w-3.5" />Invitación exprés
      </span>
      <span
        class="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums"
        :class="caducada ? 'bg-rose-500/[0.18] text-rose-200' : 'bg-black/25 text-slate-200'"
      >{{ caducada ? 'Caducada' : restante }}</span>
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-4 sm:justify-between">
      <p
        class="select-all font-mono text-[2rem] font-extrabold leading-none tracking-[0.14em] text-white transition-opacity sm:text-4xl"
        :class="caducada ? 'opacity-30' : ''"
        aria-label="Código de invitación"
      >{{ codigo }}</p>
      <img
        v-if="qr"
        :src="qr"
        alt="QR con el código de invitación"
        class="h-24 w-24 rounded-lg bg-white p-1.5 transition-opacity"
        :class="caducada ? 'opacity-30' : ''"
      >
    </div>

    <p class="mt-3.5 text-[11px] leading-relaxed text-slate-400">
      Quien lo reciba lo escribe en «Unirme». Vale una sola vez y 30 minutos. Mantén la app abierta
      hasta que la otra persona entre: tu móvil es quien la deja pasar.
    </p>

    <div class="mt-3.5 flex flex-wrap gap-2">
      <button class="sk-btn sk-btn-primary sk-btn-sm" :disabled="caducada" @click="copiar">
        <GrupoIcono :name="copiado ? 'check' : 'copy'" class="h-3.5 w-3.5" />
        {{ copiado ? 'Copiado' : 'Copiar código' }}
      </button>
      <button v-if="puedeCompartir" class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="caducada" @click="compartir">
        <GrupoIcono name="share" class="h-3.5 w-3.5" />Compartir
      </button>
      <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="$emit('nueva')">
        <GrupoIcono name="refresh" class="h-3.5 w-3.5" />Otro código
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GrupoIcono from './GrupoIcono.js'

const props = defineProps({
  /** Código ya formateado: «K7QM-4TXD». */
  codigo: { type: String, required: true },
  /** Instante de caducidad, en ms. */
  caduca: { type: Number, required: true },
  nombreGrupo: { type: String, default: '' }
})
defineEmits(['nueva'])

const ahora = ref(Date.now())
const qr = ref('')
const copiado = ref(false)
let reloj = null
let copiadoTimer = null

const caducada = computed(() => props.caduca <= ahora.value)
const restante = computed(() => {
  const s = Math.max(0, Math.ceil((props.caduca - ahora.value) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const puedeCompartir = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')

const texto = computed(() => {
  const grupo = props.nombreGrupo ? ` «${props.nombreGrupo}»` : ''
  return `Entra en mi grupo${grupo} de Skippify: abre Comunidad, elige «Sin servidor», pulsa «Unirme» y escribe el código ${props.codigo}. Vale 30 minutos.`
})

async function pintarQr () {
  qr.value = ''
  try {
    const { toDataURL } = await import('qrcode')
    qr.value = await toDataURL(props.codigo, { margin: 0, width: 240, errorCorrectionLevel: 'M' })
  } catch { /* sin QR: queda el código */ }
}

async function copiar () {
  try {
    await navigator.clipboard.writeText(props.codigo)
    copiado.value = true
    if (copiadoTimer) clearTimeout(copiadoTimer)
    copiadoTimer = setTimeout(() => { copiado.value = false }, 2000)
  } catch { /* sin portapapeles: el código se puede seleccionar con un toque */ }
}

async function compartir () {
  try { await navigator.share({ title: 'Invitación a Skippify', text: texto.value }) } catch { /* cancelado */ }
}

watch(() => props.codigo, pintarQr)
onMounted(() => {
  pintarQr()
  reloj = setInterval(() => { ahora.value = Date.now() }, 1000)
})
onBeforeUnmount(() => {
  if (reloj) clearInterval(reloj)
  if (copiadoTimer) clearTimeout(copiadoTimer)
})
</script>
