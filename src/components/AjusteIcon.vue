<template>
  <!--
    Iconos de Funciones y Configuración. Dibujados a mano con el mismo trazo que
    MacroIcon y FeatureIcon (2,2 px, remates redondos, algún relleno puntual) y
    sustituyen a los emoji que había en esas pantallas. Heredan `currentColor`.
  -->
  <svg
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Descubrimiento: brújula con la aguja en rombo. -->
    <template v-if="name === 'brujula'">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M15.7 8.3 13.5 13.5 8.3 15.7 10.5 10.5Z" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </template>

    <!-- Casual: auriculares. -->
    <template v-else-if="name === 'casual'">
      <path d="M4.5 14.6C4.1 8.9 7.4 4.6 12 4.5C16.6 4.4 19.9 8.7 19.5 14.6" />
      <path d="M4.4 13.7C5.5 13.5 6.6 13.6 7.5 13.9C7.7 15.7 7.7 17.5 7.5 19.2C6.5 19.4 5.5 19.4 4.6 19.2C4.4 17.4 4.3 15.5 4.4 13.7Z" />
      <path d="M19.6 13.7C18.5 13.5 17.4 13.6 16.5 13.9C16.3 15.7 16.3 17.5 16.5 19.2C17.5 19.4 18.5 19.4 19.4 19.2C19.6 17.4 19.7 15.5 19.6 13.7Z" />
    </template>

    <!-- Personalizado: tres reguladores. -->
    <template v-else-if="name === 'ajustes'">
      <path d="M4 7H13" /><path d="M17 7H20" />
      <path d="M4 12H6" /><path d="M10 12H20" />
      <path d="M4 17H14" /><path d="M18 17H20" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="17" r="2" />
    </template>

    <!-- Calibración: cuadrante con aguja. -->
    <template v-else-if="name === 'calibrar'">
      <path d="M4.2 17.2C3.6 11.6 7.3 6.8 12 6.6C16.7 6.4 20.4 11.4 19.8 17.2" />
      <path d="M12 16.6 15.6 11.2" />
      <circle cx="12" cy="16.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M6.4 11.6 7.6 12.4" stroke-width="1.8" /><path d="M12 8.6V10" stroke-width="1.8" /><path d="M17.6 11.6 16.4 12.4" stroke-width="1.8" />
    </template>

    <!-- Palabras clave: etiqueta. -->
    <template v-else-if="name === 'etiqueta'">
      <path d="M4.5 12.2V5.4C4.5 4.9 4.9 4.5 5.4 4.5H12.2C12.5 4.5 12.7 4.6 12.9 4.8L19.2 11.1C19.6 11.5 19.6 12.1 19.2 12.5L12.5 19.2C12.1 19.6 11.5 19.6 11.1 19.2L4.8 12.9C4.6 12.7 4.5 12.5 4.5 12.2Z" />
      <circle cx="8.6" cy="8.6" r="1.4" fill="currentColor" stroke="none" />
    </template>

    <!-- Pausa. -->
    <template v-else-if="name === 'pausa'">
      <path d="M9 6.2C9.1 10.1 9.1 13.9 9 17.8" />
      <path d="M15 6.2C15.1 10.1 15.1 13.9 15 17.8" />
    </template>

    <!-- Aviso / acceso a notificaciones: campana. -->
    <template v-else-if="name === 'campana'">
      <path d="M6.4 16.6C6.6 14.4 6.6 12.6 6.7 11C6.9 8.2 9 6 12 6C15 6 17.1 8.2 17.3 11C17.4 12.6 17.4 14.4 17.6 16.6L19 18.2L5 18.2Z" />
      <path d="M10 20.4C10.9 21.1 13.1 21.1 14 20.4" />
      <path d="M12 3.4V6" stroke-width="1.8" />
    </template>

    <!-- Permiso de mostrar notificaciones: globo con puntos. -->
    <template v-else-if="name === 'globo'">
      <path d="M5 5.4C9.7 5.2 14.3 5.2 19 5.4C19.2 8.6 19.2 11.8 19 15C16.6 15.2 14.5 15.2 12 15.1L8 19V15C6.9 14.9 5.9 14.9 5 15C4.8 11.8 4.8 8.6 5 5.4Z" />
      <circle cx="9" cy="10.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.2" r="1" fill="currentColor" stroke="none" />
    </template>

    <!-- Batería con un rayo. -->
    <template v-else-if="name === 'bateria'">
      <path d="M4.4 8.2C8.8 8 13.2 8 17.6 8.2C17.8 10.7 17.8 13.3 17.6 15.8C13.2 16 8.8 16 4.4 15.8C4.2 13.3 4.2 10.7 4.4 8.2Z" />
      <path d="M19.8 10.6V13.4" />
      <path d="M11.6 9.6 9.6 12.2H12.4L10.6 14.6" stroke-width="1.8" />
    </template>

    <!-- Permisos: escudo con una marca. -->
    <template v-else-if="name === 'escudo'">
      <path d="M12 3.6 19 6.2C19.2 9 19.2 11.2 18.7 13.2C18 16.2 15.6 19 12 20.6C8.4 19 6 16.2 5.3 13.2C4.8 11.2 4.8 9 5 6.2Z" />
      <path d="M8.9 12.2 11 14.3 15.2 9.8" />
    </template>

    <!-- Copia de seguridad: bandeja con una flecha que baja. -->
    <template v-else-if="name === 'copia'">
      <path d="M4.2 14.4C8.1 14.2 11.9 14.2 15.8 14.4" />
      <path d="M4.2 14.4C4.1 16 4.1 17.4 4.2 19C9.4 19.2 14.6 19.2 19.8 19C19.9 17.4 19.9 16 19.8 14.4" />
      <path d="M16.2 14.4H19.8" />
      <circle cx="7.4" cy="16.8" r="1" fill="currentColor" stroke="none" />
      <path d="M12 4V11.6" />
      <path d="M8.8 8.6 12 11.8 15.2 8.6" />
    </template>

    <!-- Registro: hoja con líneas. -->
    <template v-else-if="name === 'registro'">
      <path d="M7 4.8C10.3 4.6 13.7 4.6 17 4.8C17.2 9.9 17.2 15 17 20.2C13.7 20.4 10.3 20.4 7 20.2C6.8 15 6.8 9.9 7 4.8Z" />
      <path d="M9.6 9.4H14.4" /><path d="M9.6 13H14.4" /><path d="M9.6 16.6H12.4" />
    </template>

    <!-- Umbrales: barras con una raya de corte. -->
    <template v-else-if="name === 'umbral'">
      <path d="M6.4 19.4V14" stroke-width="2.8" /><path d="M12 19.4V8.8" stroke-width="2.8" /><path d="M17.6 19.4V15.8" stroke-width="2.8" />
      <path d="M3.6 11.6H20.4" stroke-width="1.8" stroke-dasharray="2.4 2.8" />
    </template>

    <!-- Ayuda: interrogación. -->
    <template v-else-if="name === 'ayuda'">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.6C9.7 8.3 10.8 7.6 12 7.6C13.3 7.6 14.4 8.4 14.4 9.7C14.4 11.5 12.1 11.6 12.1 13.4" />
      <circle cx="12.1" cy="16.4" r="1" fill="currentColor" stroke="none" />
    </template>

    <!-- Tour: bandera sobre un mástil. -->
    <template v-else-if="name === 'tour'">
      <path d="M6.4 20.4V3.8" />
      <path d="M6.6 5C10 4.2 13.4 6.4 17.8 5.4C17.4 7.6 17.4 9.6 17.8 11.8C13.4 12.8 10 10.6 6.6 11.4" />
    </template>

    <!-- Versión instalada: etiqueta con un número. -->
    <template v-else-if="name === 'version'">
      <path d="M4.4 5.4C9.5 5.2 14.5 5.2 19.6 5.4C19.8 10.5 19.8 13.5 19.6 18.6C14.5 18.8 9.5 18.8 4.4 18.6C4.2 13.5 4.2 10.5 4.4 5.4Z" />
      <path d="M8.6 14.8V9.4L10.4 8.8" stroke-width="1.9" />
      <path d="M13 14.8H15.8" stroke-width="1.9" />
    </template>

    <!-- Desde Spotify: antena. -->
    <template v-else-if="name === 'antena'">
      <path d="M4.4 12C4.4 7.8 7.8 4.4 12 4.4C16.2 4.4 19.6 7.8 19.6 12" />
      <path d="M7.4 12C7.4 9.4 9.4 7.4 12 7.4C14.6 7.4 16.6 9.4 16.6 12" />
      <circle cx="12" cy="12.4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 14.4V20" />
    </template>

    <!-- Cuenta: persona. -->
    <template v-else-if="name === 'cuenta'">
      <circle cx="12" cy="8.4" r="3.4" />
      <path d="M5.2 19.6C5.4 15.8 8.2 14 12 14C15.8 14 18.6 15.8 18.8 19.6" />
    </template>

    <!-- Sin vincular: enchufe y toma separados. -->
    <template v-else-if="name === 'desconexion'">
      <path d="M2.8 12H6.6" />
      <path d="M6.6 8.8H10.2V15.2H6.6Z" />
      <path d="M10.2 10.4H12.4" /><path d="M10.2 13.6H12.4" />
      <path d="M21.2 12H18.8" />
      <path d="M15.8 8.8H18.8V15.2H15.8Z" />
      <path d="M14.1 5.2V6.8" stroke-width="1.8" /><path d="M12.3 6.1 11.4 7.4" stroke-width="1.8" /><path d="M15.9 6.1 16.8 7.4" stroke-width="1.8" />
    </template>

    <!-- Vista previa: ojo. -->
    <template v-else-if="name === 'ojo'">
      <path d="M3.4 12C5.2 8.4 8.4 6.4 12 6.4C15.6 6.4 18.8 8.4 20.6 12C18.8 15.6 15.6 17.6 12 17.6C8.4 17.6 5.2 15.6 3.4 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </template>

    <!-- Ejecutar: triángulo de reproducir. -->
    <template v-else-if="name === 'play'">
      <path d="M8 5.6C8 5.1 8.5 4.8 9 5.1L18.4 11.1C18.8 11.4 18.8 12 18.4 12.3L9 18.5C8.5 18.8 8 18.5 8 18Z" fill="currentColor" />
    </template>

    <!-- Reloj de arena / temporizador. -->
    <template v-else-if="name === 'reloj'">
      <circle cx="12" cy="12.6" r="7.4" />
      <path d="M12 8.6V12.8L14.6 14.4" />
      <path d="M9.6 3.6H14.4" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  /**
   * 'brujula' | 'casual' | 'ajustes' | 'calibrar' | 'etiqueta' | 'pausa' |
   * 'campana' | 'globo' | 'bateria' | 'escudo' | 'copia' | 'registro' |
   * 'umbral' | 'ojo' | 'play' | 'ayuda' | 'tour' | 'version' | 'antena' | 'cuenta' | 'reloj' | 'desconexion'
   */
  name: { type: String, required: true }
})
</script>
