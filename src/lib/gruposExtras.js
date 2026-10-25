/**
 * Etiquetas y cálculos que se añaden a la ficha de cada miembro en Comunidad.
 *
 * Los usan los dos modos (con y sin servidor) y sólo trabajan con el resultado
 * semanal de un miembro (`scoreMember`, en firebase/functions/scoring.js). Un
 * resultado publicado antes de que existieran estas cifras no las trae, y cada
 * etiqueta simplemente no sale: nunca un hueco ni un «0».
 */
import { formatearHoras } from '@/lib/gruposResumen'

function numero (value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Perfil según la hora en que más se escucha. `null` si no hay hora punta. */
export function perfilHorario (hora) {
  const h = numero(hora)
  if (h === null || h < 0 || h > 23) return ''
  if (h >= 5 && h <= 11) return 'Mañanero'
  if (h >= 12 && h <= 17) return 'De tarde'
  if (h >= 18 && h <= 22) return 'De noche'
  return 'Noctámbulo'
}

/** «lun 5 oct» a partir de «2026-10-05», sin que la zona horaria lo corra un día. */
export function diaCorto (iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').toString())
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace(/[.,]/g, '')
}

/**
 * Lo que llevaba la ficha del modo con servidor y no tenía la del modo sin
 * servidor: repertorio, variedad y hora punta. Se pinta igual en los dos.
 */
export function extrasBase (item) {
  const out = []
  const artistas = numero(item?.distinctArtists)
  const temas = numero(item?.distinctTracks)
  const partes = []
  if (artistas !== null) partes.push(`${artistas} ${artistas === 1 ? 'artista' : 'artistas'}`)
  if (temas !== null) partes.push(`${temas} ${temas === 1 ? 'tema' : 'temas'}`)
  if (partes.length) out.push({ texto: partes.join(' · ') })
  const variedad = numero(item?.varietyIndex)
  if (variedad !== null) {
    out.push({
      texto: `${Math.round(Math.max(0, Math.min(1, variedad)) * 100)} % variedad`,
      pista: 'Canciones distintas sobre el total de escuchas: 100 % es no repetir ninguna.'
    })
  }
  const hora = numero(item?.peakHour)
  if (hora !== null && hora >= 0 && hora <= 23) out.push({ texto: `${hora}–${(hora + 1) % 24} h` })
  return out
}

/**
 * Cifras nuevas: veces repetido, tasa de finalización, día de más escucha,
 * perfil horario y sesión más larga.
 */
export function extrasNuevos (item) {
  const extras = []

  const tasa = numero(item?.completionRate)
  if (tasa !== null) {
    extras.push({
      texto: `${Math.round(Math.max(0, Math.min(1, tasa)) * 100)} % terminadas`,
      pista: 'De las canciones que sonaron, cuántas se oyeron hasta el final (80 % o más).'
    })
  }

  const dia = diaCorto(item?.busiestDay)
  const minutosDia = numero(item?.busiestDayMinutes)
  if (dia && minutosDia !== null && minutosDia > 0) {
    extras.push({ texto: `Día top: ${dia} · ${formatearHoras(minutosDia)}`, pista: 'El día de la semana con más tiempo de escucha.' })
  }

  const perfil = perfilHorario(item?.peakHour)
  if (perfil) extras.push({ texto: perfil, pista: 'Según la hora a la que más escucha.' })

  const sesion = numero(item?.longestSessionMinutes)
  if (sesion !== null && sesion > 0) {
    extras.push({
      texto: `Sesión más larga: ${formatearHoras(sesion)}`,
      pista: 'El tramo más largo escuchando sin parar más de 10 minutos.'
    })
  }

  return {
    extras,
    artistaVeces: numero(item?.topArtistPlays) || 0,
    temaVeces: numero(item?.topTrackPlays) || 0,
    conteoArtistas: Array.isArray(item?.artistCounts) ? item.artistCounts : []
  }
}

/** Reparto de la escucha de un miembro entre sus artistas (suma 1). */
function reparto (conteo) {
  const lista = (conteo || []).filter(c => Array.isArray(c) && Number(c[1]) > 0)
  const total = lista.reduce((s, c) => s + Number(c[1]), 0)
  const m = new Map()
  if (!total) return m
  for (const [nombre, veces] of lista) m.set(String(nombre), (m.get(String(nombre)) || 0) + Number(veces) / total)
  return m
}

/**
 * % de escucha común entre dos miembros: la parte de su escucha que coincide,
 * artista a artista (intersección de los dos repartos). 100 % es oír
 * exactamente lo mismo en la misma proporción; 0 % es no compartir ni un artista.
 */
export function escuchaComun (a, b) {
  const ra = reparto(a)
  const rb = reparto(b)
  if (!ra.size || !rb.size) return null
  let comun = 0
  for (const [nombre, p] of ra) comun += Math.min(p, rb.get(nombre) || 0)
  return Math.round(comun * 100)
}

/**
 * Todas las parejas de miembros con datos, de más a menos parecidas.
 * @param {Array<{id: string, nombre: string, conteoArtistas?: Array}>} fichas
 */
export function paresEnComun (fichas) {
  const con = (fichas || []).filter(f => Array.isArray(f.conteoArtistas) && f.conteoArtistas.length)
  const pares = []
  for (let i = 0; i < con.length; i += 1) {
    for (let j = i + 1; j < con.length; j += 1) {
      const pct = escuchaComun(con[i].conteoArtistas, con[j].conteoArtistas)
      if (pct === null) continue
      pares.push({ a: con[i].nombre, b: con[j].nombre, idA: con[i].id, idB: con[j].id, pct, yo: !!(con[i].yo || con[j].yo) })
    }
  }
  return pares.sort((x, y) => y.pct - x.pct || (x.a + x.b < y.a + y.b ? -1 : 1))
}

/** Ordena el ranking por tiempo de escucha, de más a menos (y por nombre si empatan). */
export function ordenarPorTiempo (fichas) {
  return [...fichas].sort((a, b) => (b.minutos - a.minutos) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
}
