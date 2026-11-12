/**
 * Canal de distribución de esta build: 'github' (por defecto, con el
 * actualizador de releases) o 'play' (Google Play, donde actualiza la tienda).
 *
 * Lo fija Vite al compilar a partir de SKIPPIFY_CANAL, que pone
 * scripts/build-apk.ps1 -Canal. La parte nativa tiene su espejo en Canal.java.
 */
/* global __CANAL__ */
export const CANAL = typeof __CANAL__ === 'string' ? __CANAL__ : 'github'
export const ES_PLAY = CANAL === 'play'
