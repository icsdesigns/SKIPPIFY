/**
 * Cuándo se avisa de una versión nueva (lado JS; el nativo es
 * android-src/ActualizacionAviso.java, con la misma regla).
 *
 * Una release no se anuncia hasta que han pasado 6 horas desde su publicación
 * (`published_at` de GitHub; `created_at` si falta): así, si salen varias
 * seguidas, no se avisa de cada una y, pasado el plazo, se avisa de la más
 * reciente. Vale para las detecciones AUTOMÁTICAS (al abrir la app); la
 * búsqueda manual de Ajustes enseña cualquier versión nueva al momento.
 *
 * Sin fecha legible no se retiene nada (se avisa como antes de este plazo).
 */

export const RETRASO_AVISO_MS = 6 * 60 * 60 * 1000

/** Fecha más allá de esto en el futuro respecto al reloj: el reloj va mal, no se retiene. */
export const TOLERANCIA_RELOJ_MS = 60 * 60 * 1000

/** Margen tras el plazo con el que se vuelve a mirar si la app sigue abierta. */
export const MARGEN_REVISION_MS = 60 * 1000

/** ISO 8601 → ms de época UTC (sin zona se toma como UTC, igual que en Java); 0 si no se entiende. */
export function parsearFecha (iso) {
  if (typeof iso !== 'string') return 0
  const texto = iso.trim()
  if (!/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}/.test(texto)) return 0
  const conZona = /(Z|z|[+-]\d{2}:?\d{2})$/.test(texto) ? texto : `${texto}Z`
  const ms = Date.parse(conZona.replace(' ', 'T'))
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

/** Fecha de lanzamiento de la release: `published_at`, o `created_at` de respaldo; 0 si ninguna sirve. */
export function fechaDeRelease (release) {
  return parsearFecha(release?.published_at) || parsearFecha(release?.created_at)
}

/**
 * ¿Sigue retenida (aún no notificable)?
 * @returns {{ retenida: boolean, abreEnMs: number }} `abreEnMs`: lo que falta hasta cumplirse el plazo.
 */
export function evaluarRetraso (ahora, publicadoMs) {
  if (!publicadoMs || publicadoMs <= 0) return { retenida: false, abreEnMs: 0 }
  if (publicadoMs - ahora > TOLERANCIA_RELOJ_MS) return { retenida: false, abreEnMs: 0 }
  const abreEnMs = publicadoMs + RETRASO_AVISO_MS - ahora
  return abreEnMs > 0 ? { retenida: true, abreEnMs } : { retenida: false, abreEnMs: 0 }
}
