<template>
  <div class="rounded-md bg-white/[0.05] px-3 py-3" data-registro-miembro>
    <div class="flex items-center gap-2">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
        <GrupoIcono name="copy" class="h-3.5 w-3.5" />
      </span>
      <p class="min-w-0 flex-1 text-xs font-bold text-white">Registro de funcionalidad</p>
      <!-- La versión va en claro y la ven todos los miembros del grupo. -->
      <span class="sk-chip shrink-0 font-mono" :title="registro?.version ? 'Versión de la app de este miembro' : 'Todavía no ha publicado su versión'">
        {{ registro?.version || 'sin versión' }}
      </span>
    </div>

    <p class="mt-2 text-[11px] leading-relaxed text-slate-400">
      <template v-if="filas > 0">
        Subido {{ cuando(registro.subidoEn) }} · {{ filas }} {{ filas === 1 ? 'fila' : 'filas' }}
      </template>
      <template v-else>Sin registro compartido. Cada miembro decide en Ajustes si lo comparte.</template>
    </p>

    <!--
      Descarga en dos toques: el primero explica qué contiene el fichero y el
      segundo lo guarda. No protege nada (el registro ya está en el grupo); sólo
      evita descargar el de otro miembro por un toque sin querer.
    -->
    <div v-if="filas > 0" class="mt-2.5">
      <p v-if="confirmando" class="mb-2 text-[11px] leading-relaxed text-amber-200" data-confirmar-descarga>
        Contiene los títulos, artistas y horas de lo que ha escuchado {{ registro.nombre }}. Guárdalo sólo si lo necesitas para revisar un fallo.
      </p>
      <div class="flex items-center gap-2">
        <button
          v-if="confirmando"
          type="button"
          class="sk-btn sk-btn-sm min-w-0 flex-1"
          :disabled="ocupado"
          @click="confirmando = false"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="sk-btn sk-btn-primary sk-btn-sm min-w-0 flex-1"
          :disabled="ocupado"
          :data-descargar="registro.id"
          @click="pedir"
        >
          {{ ocupado ? 'Descargando…' : (confirmando ? 'Sí, descargar' : 'Descargar registro') }}
        </button>
      </div>
    </div>
    <p v-if="error" class="mt-2 text-[11px] text-rose-200" role="alert">{{ error }}</p>
    <p v-else-if="mensaje" class="mt-2 break-words text-[11px] font-semibold text-brand-400">{{ mensaje }}</p>
  </div>
</template>

<script setup>
/**
 * «Registro de funcionalidad» de UN miembro, dentro de su ficha: la versión de
 * su app, cuándo subió su registro por última vez, cuántas filas tiene y la
 * descarga como JSON tras confirmarla. Se abre con el icono de
 * información de la ficha.
 *
 * Es solo presentación: la descarga la hace quien lo monta (`descargar`).
 */
import { computed, ref } from 'vue'
import GrupoIcono from './GrupoIcono.js'

const props = defineProps({
  /** { id, nombre, yo, version, subidoEn, filas, total } o null si aún no se sabe nada. */
  registro: { type: Object, default: null },
  /** async (id) => ruta del fichero guardado. */
  descargar: { type: Function, required: true }
})

const confirmando = ref(false)
const error = ref('')
const mensaje = ref('')
const ocupado = ref(false)

const filas = computed(() => Number(props.registro?.filas) || 0)

function cuando (ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

async function pedir () {
  error.value = ''
  mensaje.value = ''
  if (!confirmando.value) {
    confirmando.value = true
    return
  }
  confirmando.value = false
  ocupado.value = true
  try {
    const ruta = await props.descargar(props.registro.id)
    mensaje.value = `Guardado en ${ruta}.`
  } catch (e) {
    error.value = (e?.message || '').toString().trim() || 'No se pudo descargar el registro.'
  } finally {
    ocupado.value = false
  }
}
</script>
