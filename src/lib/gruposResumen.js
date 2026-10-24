/**
 * Cifras de un grupo para la pantalla de Comunidad. Las usan los dos modos (con
 * y sin servidor), así que sólo trabajan con datos ya normalizados: una lista de
 * fichas semanales `{ id, nombre, minutos, canciones }`.
 */

export function formatearHoras (minutos) {
  const total = Math.max(0, Math.round(Number(minutos || 0)))
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`
}

/** Versión corta para una tarjeta pequeña: «10 h 12». */
export function formatearHorasCorto (minutos) {
  const total = Math.max(0, Math.round(Number(minutos || 0)))
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`
}

/** Totales de la semana y quién va primero. `lider` queda vacío si nadie ha escuchado nada. */
export function resumirRanking (fichas = []) {
  const lista = Array.isArray(fichas) ? fichas : []
  const minutos = lista.reduce((s, f) => s + (Number(f.minutos) || 0), 0)
  const canciones = lista.reduce((s, f) => s + (Number(f.canciones) || 0), 0)
  const primero = lista[0]
  return {
    minutos,
    canciones,
    lider: primero && (Number(primero.canciones) || 0) > 0 ? primero.nombre : ''
  }
}

/** Reparte una lista por su mayor valor: la aportación de cada ficha, de 0 a 1. */
export function proporciones (fichas = [], campo = 'minutos') {
  const maximo = Math.max(0, ...fichas.map(f => Number(f[campo]) || 0))
  return new Map(fichas.map(f => [f.id, maximo ? (Number(f[campo]) || 0) / maximo : 0]))
}

export function inicialDe (nombre) {
  const limpio = (nombre || '').toString().trim()
  return limpio ? [...limpio][0].toUpperCase() : '·'
}
