<template>
  <!--
    Iconos de las funciones (cabeceras de FeaturePanel). Dibujados a mano con
    el mismo trazo que la «S» de BrandMark y el UpdateIcon: líneas algo curvas
    y remates redondos, para que no parezcan de otro juego de iconos. Heredan
    `currentColor`.
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
    <!-- Salto de duplicadas: una flecha que salta por encima de la nota ya oída. -->
    <template v-if="name === 'salto'">
      <path d="M4.4 17.2C5.2 10.6 8.4 6.6 12 6.5C15.4 6.4 18 9.3 19.3 14.2" />
      <path d="M16.2 12.4C17.2 13 18.2 13.7 19.3 14.4C19.8 13.3 20.2 12.2 20.7 11" />
      <circle cx="10.6" cy="17.6" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12.2 17.5C12.2 15.7 12.2 13.9 12.3 12.1C13.3 12.4 14.2 13 14.6 13.9" stroke-width="1.8" />
    </template>

    <!-- Silenciamiento de anuncios: altavoz con un aspa. -->
    <template v-else-if="name === 'silencio'">
      <path d="M4.3 9.7C4.1 11.2 4.1 12.8 4.3 14.3L7.5 14.4C8.9 15.7 10.3 16.9 11.7 18.1C12 14 12 10 11.7 5.9C10.3 7.1 8.9 8.4 7.5 9.6Z" />
      <path d="M15.3 9C16.9 10.8 18.5 12.7 20.1 14.8" />
      <path d="M20 8.9C18.5 10.9 16.9 12.8 15.4 14.9" />
    </template>

    <!-- Temporizador: luna creciente con una estrella. -->
    <template v-else-if="name === 'luna'">
      <path d="M18.4 14.6C17.4 15.1 16.3 15.3 15.1 15.2C11.3 14.9 8.6 11.7 8.9 8C9 6.8 9.4 5.7 10.1 4.8C6.8 5.6 4.4 8.8 4.6 12.4C4.9 16.4 8.3 19.5 12.3 19.3C15 19.1 17.3 17.3 18.4 14.6Z" />
      <path d="M17.2 3.6C17.5 5.1 18 5.7 19.5 6C18 6.3 17.5 6.9 17.2 8.4C16.9 6.9 16.4 6.3 14.9 6C16.4 5.7 16.9 5.1 17.2 3.6Z" fill="currentColor" stroke-width="1.4" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  /** 'salto' | 'silencio' | 'luna' */
  name: { type: String, required: true }
})
</script>
