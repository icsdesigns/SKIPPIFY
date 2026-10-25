<template>
  <section class="sk-card overflow-hidden" data-info-comunidad>
    <button
      type="button"
      class="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      :aria-expanded="abierto"
      aria-controls="comunidad-info"
      @click="alternar"
    >
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.16] text-brand-300">
        <GrupoIcono :name="modo === 'local' ? 'mesh' : 'server'" class="h-[18px] w-[18px]" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-bold text-white">¿Cómo funciona?</span>
        <span class="block truncate text-[11px] text-slate-400">{{ modo === 'local' ? 'Grupos sin servidor, en vuestros propios móviles' : 'Grupos con servidor (Firebase)' }}</span>
      </span>
      <GrupoIcono name="chevron" class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300" :class="abierto ? '-rotate-90' : 'rotate-90'" />
    </button>

    <div id="comunidad-info" class="desplegable grid" :class="abierto ? 'abierta' : ''">
      <div class="min-h-0 overflow-hidden">
        <div class="px-5 pb-5">
          <ol class="relative space-y-3 border-l border-white/[0.09] pl-5">
            <li v-for="(p, i) in pasos" :key="p.titulo" class="paso relative" :style="{ '--orden': i }">
              <span class="absolute -left-[33px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-400 text-[11px] font-bold text-black ring-4 ring-[#181818]">{{ i + 1 }}</span>
              <p class="flex items-center gap-1.5 text-[13px] font-bold text-white">
                <GrupoIcono :name="p.icono" class="h-4 w-4 text-brand-300" />{{ p.titulo }}
              </p>
              <p class="mt-0.5 text-xs leading-relaxed text-slate-400">{{ p.texto }}</p>
            </li>
          </ol>
          <p class="mt-4 flex items-start gap-2 rounded-md bg-white/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
            <GrupoIcono name="key" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
            <span>{{ nota }}</span>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * Panel «¿Cómo funciona?» de la pestaña Comunidad: tres pasos y una nota de
 * privacidad, distintos según el modo. Se abre solo cuando aún no hay grupos
 * (es lo que necesita quien llega nuevo) y después recuerda lo que eligió cada
 * uno. Vivía en Ajustes y desde allí no lo encontraba nadie.
 */
import { computed, ref, watch } from 'vue'
import GrupoIcono from './GrupoIcono.js'

const props = defineProps({
  modo: { type: String, required: true },
  /** Sin grupos en este modo: se enseña abierto salvo que se haya plegado a mano. */
  sinGrupos: { type: Boolean, default: false }
})

const CLAVE = 'skippify-community-info'
function preferencia () {
  try {
    const v = localStorage.getItem(CLAVE)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}
const elegido = ref(preferencia())
const abierto = ref(elegido.value ?? props.sinGrupos)
watch(() => props.sinGrupos, (sin) => { if (elegido.value === null) abierto.value = sin })

function alternar () {
  abierto.value = !abierto.value
  elegido.value = abierto.value
  try { localStorage.setItem(CLAVE, abierto.value ? '1' : '0') } catch { /* sin almacenamiento */ }
}

const PASOS = {
  local: [
    { icono: 'plus', titulo: 'Crea un grupo o únete', texto: 'Quien lo crea genera una invitación exprés (8 caracteres) o un QR. Vale 24 horas y entra en cuanto un miembro tenga la app abierta.' },
    { icono: 'note', titulo: 'Escucha como siempre', texto: 'Tus escuchas se comparten solas con el grupo, cifradas, también con la app cerrada. No hay cuentas ni base de datos.' },
    { icono: 'medal', titulo: 'Comparad la semana', texto: 'El ranking va por tiempo de escucha y se mantiene al día; es provisional hasta que todos han sincronizado. En «En común» veis cuánto os parecéis.' }
  ],
  servidor: [
    { icono: 'plus', titulo: 'Crea un grupo o únete', texto: 'Quien lo crea comparte su código de 6 caracteres; con él se entra al momento.' },
    { icono: 'note', titulo: 'Escucha como siempre', texto: 'Tus escuchas se suben solas a Firebase, también con la app cerrada.' },
    { icono: 'medal', titulo: 'Resultados el domingo', texto: 'El ranking de la semana se publica cada domingo a las 15:00 y te avisamos cuando está.' }
  ]
}

const pasos = computed(() => PASOS[props.modo] || PASOS.local)
const nota = computed(() => props.modo === 'local'
  ? 'Los datos viajan cifrados por relays públicos, que sólo ven direcciones IP, horas y tamaños. Quien pasa 30 días sin enviar nada sale del grupo; salir borra la copia de este móvil.'
  : 'Los grupos y las escuchas se guardan en el proyecto de Firebase de Skippify, con una sesión anónima por móvil.')
</script>

<style scoped>
.desplegable {
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.desplegable.abierta { grid-template-rows: 1fr; }
.paso {
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  transition-delay: calc(var(--orden, 0) * 70ms + 80ms);
}
.abierta .paso { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .desplegable, .paso { transition: none !important; }
}
</style>
