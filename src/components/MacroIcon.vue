<template>
  <!--
    Iconos de las macros (modos, acciones y pasos). Dibujados a mano con el
    mismo trazo que FeatureIcon: líneas algo curvas, remates redondos y algún
    relleno puntual. Heredan `currentColor`.
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
    <!-- Manual: un dedo índice que pulsa, con dos marcas de pulsación arriba. -->
    <template v-if="name === 'manual'">
      <path d="M9.4 12.3C9.3 9.6 9.3 7.6 9.4 6.4C9.5 5 11.6 5 11.7 6.4C11.8 8.4 11.8 10.4 11.8 12" />
      <path d="M11.8 11.6C11.9 10.6 14.1 10.6 14.2 11.8C14.4 10.9 16.6 11 16.7 12.2C17.6 11.9 19.2 12.5 19.2 14.2L19 16.6C18.8 19.2 16.8 20.8 14 20.8L12.4 20.8C10.7 20.7 9.6 20 8.7 18.7L5.5 14.3C4.9 13.3 6.1 12.3 7.3 13C8 13.5 8.7 14.2 9.4 15" />
      <path d="M5.8 6.2C6.4 4.9 7.4 4 8.7 3.4" stroke-width="1.8" />
      <path d="M15.2 6.2C14.6 4.9 13.6 4 12.4 3.5" stroke-width="1.8" />
    </template>

    <!-- Actual: auriculares con una nota musical entre las dos almohadillas. -->
    <template v-else-if="name === 'actual'">
      <path d="M4.5 14.6C4.1 8.9 7.4 4.6 12 4.5C16.6 4.4 19.9 8.7 19.5 14.6" />
      <path d="M4.4 13.7C5.5 13.5 6.6 13.6 7.5 13.9C7.7 15.7 7.7 17.5 7.5 19.2C6.5 19.4 5.5 19.4 4.6 19.2C4.4 17.4 4.3 15.5 4.4 13.7Z" />
      <path d="M19.6 13.7C18.5 13.5 17.4 13.6 16.5 13.9C16.3 15.7 16.3 17.5 16.5 19.2C17.5 19.4 18.5 19.4 19.4 19.2C19.6 17.4 19.7 15.5 19.6 13.7Z" />
      <circle cx="11" cy="16.4" r="1.7" fill="currentColor" stroke="none" />
      <path d="M12.6 16.2C12.6 14.4 12.6 12.6 12.6 10.8C13.9 11 14.4 11.6 14.6 12.8" stroke-width="1.8" />
    </template>

    <!-- Novedades: lista de playlist con una chispa de cuatro puntas arriba a la derecha. -->
    <template v-else-if="name === 'novedades'">
      <path d="M3.8 8C6 7.8 8.2 7.8 10.4 8" />
      <path d="M3.8 13C6.8 12.8 9.8 12.8 12.8 13" />
      <path d="M3.8 18C6.1 17.8 8.4 17.8 10.7 18" />
      <path d="M17 2.8C17.4 5.3 18.3 6.3 20.8 6.8C18.3 7.3 17.4 8.3 17 10.8C16.6 8.3 15.7 7.3 13.2 6.8C15.7 6.3 16.6 5.3 17 2.8Z" fill="currentColor" stroke-width="1.4" />
      <circle cx="18.2" cy="17.2" r="1.7" fill="currentColor" stroke="none" />
      <path d="M19.8 17C19.8 15.6 19.8 14.2 19.8 12.9C20.7 13 21.1 13.4 21.3 14.2" stroke-width="1.8" />
    </template>

    <!-- Playlist: tres líneas de lista y una nota musical a la derecha. -->
    <template v-else-if="name === 'playlist'">
      <path d="M3.8 6.6C7.4 6.4 11 6.4 14.6 6.6" />
      <path d="M3.8 11.6C7.4 11.4 11 11.4 14.6 11.6" />
      <path d="M3.8 16.6C6.2 16.4 8.6 16.4 11 16.6" />
      <circle cx="16.6" cy="17.6" r="2.3" fill="currentColor" stroke="none" />
      <path d="M18.9 17.4C18.9 14.6 18.9 11.8 18.9 9C19.9 9.3 20.6 9.9 20.9 11" />
    </template>

    <!-- Reciente: reloj con una flecha circular de historial rodeándolo a la izquierda. -->
    <template v-else-if="name === 'reciente'">
      <path d="M4.2 12C4.3 7.4 7.8 3.8 12.2 3.7C16.7 3.6 20.3 7.2 20.3 11.8C20.3 16.4 16.8 20.1 12.2 20.2C9.1 20.3 6.4 18.6 5 16" />
      <path d="M3.2 7.6C3.5 9.1 3.8 10.6 4.2 12C5.6 11.6 7 11.1 8.3 10.5" />
      <path d="M12.2 8C12.2 9.8 12.2 11.2 12.3 12.2C13.4 12.9 14.6 13.6 15.8 14.2" />
    </template>

    <!-- Tras N escuchas: dos flechas circulares (repetir) con una nota en el centro. -->
    <template v-else-if="name === 'escuchas'">
      <path d="M19.4 11C19 7.6 16 5 12.4 5C10.3 5 8.4 5.9 7.1 7.4" />
      <path d="M7.2 3.6C7.2 5 7.1 6.2 7.1 7.4C8.5 7.5 9.8 7.6 11 7.8" />
      <path d="M4.6 13C5 16.4 8 19 11.6 19C13.7 19 15.6 18.1 16.9 16.6" />
      <path d="M16.8 20.4C16.8 19 16.9 17.8 16.9 16.6C15.5 16.5 14.2 16.4 13 16.2" />
      <circle cx="10.6" cy="14.2" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12.1 14C12.1 12.5 12.1 11.2 12.1 10C13.2 10.1 13.7 10.6 13.9 11.6" stroke-width="1.8" />
    </template>

    <!-- Me gusta: corazón. -->
    <template v-else-if="name === 'megusta'">
      <path d="M12 20C7.6 16.7 3.7 13.4 3.3 9.3C3 6.2 5.1 4.2 7.7 4.2C9.5 4.2 11 5.2 12 6.9C13 5.2 14.5 4.2 16.3 4.2C18.9 4.2 21 6.2 20.7 9.3C20.3 13.4 16.4 16.7 12 20Z" />
    </template>

    <!-- Top: copa con dos asas, pie y una estrella rellena en el centro. -->
    <template v-else-if="name === 'top'">
      <path d="M7 3.8C9.6 3.6 14.4 3.6 17 3.8C17.1 6.4 16.9 8.4 16 10.2C15.1 12 13.7 12.9 12 13C10.3 12.9 8.9 12 8 10.2C7.1 8.4 6.9 6.4 7 3.8Z" />
      <path d="M7 5.4C5.4 5.4 4.2 5.5 3.8 6.3C3.6 8 4.8 9.7 7.6 10.2" />
      <path d="M17 5.4C18.6 5.4 19.8 5.5 20.2 6.3C20.4 8 19.2 9.7 16.4 10.2" />
      <path d="M12 13C12 15 12 16.2 12 17.4" />
      <path d="M8 20.2C10.7 20 13.3 20 16 20.2" />
      <path d="M12 5.6L12.8 7.4L14.6 7.5L13.2 8.7L13.7 10.4L12 9.5L10.3 10.4L10.8 8.7L9.4 7.5L11.2 7.4Z" fill="currentColor" stroke-width="1" />
    </template>

    <!-- Copiar: dos hojas superpuestas, la de delante completa y la de atrás asomando. -->
    <template v-else-if="name === 'copiar'">
      <path d="M9.4 8.6C9.4 7.6 10.1 7 11 7L18.4 7.1C19.3 7.1 19.9 7.8 19.9 8.7L19.8 18.6C19.8 19.5 19.2 20.1 18.3 20.1L11 20C10.1 20 9.5 19.4 9.5 18.5Z" />
      <path d="M14.6 7C14.6 5.8 14.6 4.9 14.5 4.3C14.4 3.6 13.9 3.2 13.1 3.2L5.6 3.2C4.7 3.2 4.1 3.8 4.1 4.7L4.2 14.2C4.2 15 4.7 15.6 5.5 15.6L9.4 15.6" />
    </template>

    <!-- Mover: caja abierta por arriba con una flecha que sale hacia la derecha. -->
    <template v-else-if="name === 'mover'">
      <path d="M11.4 5.2L5.5 5.2C4.4 5.2 3.7 5.9 3.7 7L3.8 17.6C3.8 18.7 4.5 19.3 5.6 19.3L16.4 19.3C17.5 19.3 18.2 18.6 18.2 17.5L18.2 16" />
      <path d="M9.2 12.1C12.2 12 15.6 12 19.4 12.1" />
      <path d="M16 8.3C17.4 9.5 18.6 10.7 20.2 12.1C18.6 13.5 17.4 14.7 16 15.9" />
    </template>

    <!-- Eliminar: papelera con tapa, asa y dos ranuras. -->
    <template v-else-if="name === 'eliminar'">
      <path d="M3.8 6.6C8.6 6.4 15.4 6.4 20.2 6.6" />
      <path d="M9.2 6.5C9.2 5.2 9.3 4.4 9.5 3.9C10.6 3.6 13.4 3.6 14.5 3.9C14.7 4.4 14.8 5.2 14.8 6.5" />
      <path d="M5.8 6.7C6 10.6 6.4 14.8 6.9 18.4C7 19.5 7.8 20.2 8.9 20.2L15.1 20.2C16.2 20.2 17 19.5 17.1 18.4C17.6 14.8 18 10.6 18.2 6.7" />
      <path d="M10 10.6C10 12.9 10 14.9 10.1 16.6" stroke-width="1.8" />
      <path d="M14 10.6C14 12.9 14 14.9 13.9 16.6" stroke-width="1.8" />
    </template>

    <!-- Vaciar: escoba que barre; mango en diagonal, cerdas abiertas y un par de motas. -->
    <template v-else-if="name === 'vaciar'">
      <path d="M20 3.6C17.6 6.2 15.4 8.6 13.4 10.8" />
      <path d="M13.4 10.8C14.4 11.2 15.4 11.9 16 12.8C17.4 14.2 18.5 15.7 19.2 17.4C16.6 19.4 12.7 20.2 8.8 19.9C6.4 19.8 4.4 19.4 3.4 18.6C4.5 17 6.6 14.4 9.2 12.2C10.6 11.3 12 11 13.4 10.8Z" />
      <path d="M8.6 15.4C9.2 16.6 9.5 17.7 9.6 19.5" stroke-width="1.8" />
      <path d="M12.4 14.8C12.8 16 12.9 17.2 12.8 19.2" stroke-width="1.8" />
      <circle cx="4.6" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="5.4" r="1" fill="currentColor" stroke="none" />
    </template>

    <!-- Cola: dos líneas de lista, un triángulo de play relleno y una flecha hacia abajo. -->
    <template v-else-if="name === 'cola'">
      <path d="M3.8 5.8C7.4 5.6 11 5.6 14.6 5.8" />
      <path d="M3.8 10.8C6.2 10.6 8.6 10.6 11 10.8" />
      <path d="M4.2 14.6C4.2 16.6 4.2 18.6 4.3 20.4C6.1 19.5 8 18.5 9.8 17.5C8 16.5 6.1 15.5 4.2 14.6Z" fill="currentColor" stroke-width="1.4" />
      <path d="M18 8.6C18 11.8 18 15 18 18.2" />
      <path d="M14.6 14.8C15.8 16 16.9 17.1 18 18.4C19.1 17.1 20.2 16 21.4 14.8" />
    </template>

    <!-- Nueva: lista de playlist con un signo más a la derecha. -->
    <template v-else-if="name === 'nueva'">
      <path d="M3.8 6.6C7.4 6.4 11 6.4 14.6 6.6" />
      <path d="M3.8 11.8C7.4 11.6 11 11.6 14.6 11.8" />
      <path d="M3.8 17C6.6 16.8 9.4 16.8 12.2 17" />
      <path d="M17.6 13.4C17.6 15.6 17.6 17.8 17.6 20.2" />
      <path d="M13.8 16.8C16.4 16.7 19 16.7 21.4 16.8" />
    </template>

    <!-- Atrás: flecha hacia la izquierda. -->
    <template v-else-if="name === 'atras'">
      <path d="M20 12C15.4 11.9 10 11.9 4.6 12" />
      <path d="M10.6 5.8C8.6 7.9 6.6 9.9 4.4 12C6.6 14.1 8.6 16.1 10.6 18.2" />
    </template>

    <!-- Siguiente: flecha hacia la derecha. -->
    <template v-else-if="name === 'siguiente'">
      <path d="M4 12C8.6 11.9 14 11.9 19.4 12" />
      <path d="M13.4 5.8C15.4 7.9 17.4 9.9 19.6 12C17.4 14.1 15.4 16.1 13.4 18.2" />
    </template>

    <!-- Reiniciar: flecha circular antihoraria que arranca de cero. -->
    <template v-else-if="name === 'reiniciar'">
      <path d="M5.2 8.6C6.7 5.6 9.2 3.9 12.4 3.8C17 3.7 20.4 7.3 20.4 11.9C20.4 16.6 16.9 20.2 12.3 20.2C8.4 20.2 5.4 17.8 4.1 14.2" />
      <path d="M2.9 4.4C3.3 6.1 3.8 7.6 4.5 9C6.1 9.1 7.7 8.9 9.2 8.3" />
    </template>

    <!-- Guardar: marca de verificación. -->
    <template v-else-if="name === 'guardar'">
      <path d="M4.2 12.8C6.1 14.5 7.9 16.3 9.6 18.4C12.7 13.2 16.2 8.7 20 5.6" />
    </template>

    <!-- Actualizar: dos flechas circulares que se persiguen. -->
    <template v-else-if="name === 'actualizar'">
      <path d="M19.6 10.6C18.7 7 15.7 4.6 12.2 4.6C9.3 4.6 6.8 6.1 5.5 8.5" />
      <path d="M20.4 4C20 6.2 19.8 8.4 19.6 10.6C17.4 10.6 15.2 10.4 13.2 10" />
      <path d="M4.4 13.4C5.3 17 8.3 19.4 11.8 19.4C14.7 19.4 17.2 17.9 18.5 15.5" />
      <path d="M3.6 20C4 17.8 4.2 15.6 4.4 13.4C6.6 13.4 8.8 13.6 10.8 14" />
    </template>

    <!-- Desconectar: puerta abierta con una flecha de salida hacia la derecha. -->
    <template v-else-if="name === 'desconectar'">
      <path d="M10.4 4.2L6 4.2C4.9 4.2 4.2 4.9 4.2 6L4.3 18C4.3 19.1 5 19.8 6.1 19.8L10.4 19.8" />
      <path d="M9.6 12C12.6 11.9 16 11.9 19.8 12" />
      <path d="M16.2 8C17.6 9.3 18.8 10.6 20.4 12C18.8 13.4 17.6 14.7 16.2 16" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  /**
   * 'manual' | 'actual' | 'novedades' | 'playlist' | 'reciente' | 'megusta' |
   * 'top' | 'escuchas' | 'copiar' | 'mover' | 'eliminar' | 'vaciar' | 'cola' | 'nueva' |
   * 'atras' | 'siguiente' | 'reiniciar' | 'guardar' | 'actualizar' |
   * 'desconectar'
   */
  name: { type: String, required: true }
})
</script>
