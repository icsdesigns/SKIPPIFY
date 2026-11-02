<template>
  <div class="sk-stagger space-y-4">
    <!-- ── Desplegable de grupos; «Nuevo» abre la hoja de alta ───────────── -->
    <ComunidadSelector
      :grupos="grupos"
      :activo-id="grupoLocalActivo"
      :max="MAX_GROUPS"
      @grupo="pedirGrupoLocal"
      @nuevo="nuevoAbierto = true"
    />

    <!-- Sin grupos va arriba y abierto: es lo primero que necesita quien llega. -->
    <ComunidadInfo v-if="!grupos.length" :sin-grupos="true" />

    <LocalHostPanel v-model:nuevo="nuevoAbierto" />

    <!-- Con grupos, al final y plegado. -->
    <ComunidadInfo v-if="grupos.length" :sin-grupos="false" />
  </div>
</template>

<script setup>
/**
 * Grupos — resumen de escucha compartido con grupos de amigos.
 *
 * Antes se llamaba «Liga», «Friendly-Wrapped» y «Comunidad». Los grupos viven en
 * los propios móviles (sin servidor): arriba, el desplegable con tus grupos y
 * «Nuevo»; debajo, los resultados del grupo abierto.
 */
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import ComunidadSelector from '@/components/grupos/ComunidadSelector.vue'
import ComunidadInfo from '@/components/grupos/ComunidadInfo.vue'
import { formatearHorasCorto } from '@/lib/gruposResumen'
// Los grupos se leen de un módulo ligero, no de useLocalLeague: así el
// desplegable los enseña sin cargar libsodium (ver src/lib/comunidadLocal.js).
import { gruposLocales, grupoLocalActivo, pedirGrupoLocal, releerCopiaLocal } from '@/lib/comunidadLocal'

// El núcleo criptográfico arrastra libsodium (WASM): se carga aparte.
const LocalHostPanel = defineAsyncComponent(() => import('@/components/LocalHostPanel.vue'))

/** MAX_GROUPS de useLocalLeague; no se importa aquí por el peso. */
const MAX_GROUPS = 5

const nuevoAbierto = ref(false)

const AVISOS = { joining: 'Esperando a entrar', restoring: 'Restaurando' }

const grupos = computed(() => gruposLocales.value.map(g => ({
  id: g.id,
  nombre: g.nombre,
  aviso: AVISOS[g.estado] || '',
  detalle: [
    g.miembros ? `${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'}` : '',
    g.minutos ? `${formatearHorasCorto(g.minutos)} de escucha` : ''
  ].filter(Boolean).join(' · ')
})))

onMounted(releerCopiaLocal)
</script>
