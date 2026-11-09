/**
 * Lista de guías interactivas de la app. Importar este módulo las crea (y las
 * registra en `crearGuia`), de modo que la cabecera de la app sabe qué botón
 * enseñar en cada pestaña: App.vue no cambia al añadir una guía, sólo esta
 * lista. Para crear una nueva, ver `composables/crearGuia.js`.
 */
import { guiaMacros } from './macros'
import { guiaFunciones } from './funciones'
import { guiaGrupos } from './grupos'

export const GUIAS = [guiaMacros, guiaFunciones, guiaGrupos]

export { guiaMacros, guiaFunciones, guiaGrupos }
export { guiaDeRuta } from '@/composables/crearGuia'
