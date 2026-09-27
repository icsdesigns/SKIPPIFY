/**
 * Puntuación semanal de Comunidad — ÚNICA implementación.
 *
 * Había dos copias de este cálculo: la de `firebase/functions/index.js` (función
 * programada) y la de `scripts/publish-weekly-leaderboard.mjs` (acción de
 * GitHub). Sólo se actualizó la segunda al añadir el repertorio distinto, el
 * índice de variedad y la hora punta en la v4.0.1, así que según cuál de las dos
 * publicara, el ranking del grupo traía esas cifras o no; la app las oculta
 * cuando faltan, y el resultado era una pestaña Comunidad que unas semanas
 * enseñaba las estadísticas de cada miembro y otras no.
 *
 * Vive dentro de `firebase/functions/` a propósito: `firebase deploy --only
 * functions` sólo empaqueta ese directorio, así que es el único sitio desde el
 * que pueden leerlo las dos. Es CommonJS y sin dependencias —ni firebase-admin—
 * para poder importarlo también desde ESM y desde las pruebas.
 */

/**
 * Hora del día de una escucha, en Europe/Madrid.
 *
 * `playedAt` viaja en UTC: leerlo con `getHours()` correría la hora punta una
 * posición en invierno y dos en verano. El formateador se crea UNA vez porque
 * construir un Intl.DateTimeFormat por evento se nota con miles de escuchas, y
 * `hourCycle: 'h23'` evita el «24» que algunas versiones de ICU devuelven para
 * la medianoche con `hour12: false`.
 */
const FORMATO_HORA_MADRID = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  hourCycle: 'h23'
})

function horaLocalDeEscucha (playedAt) {
  const d = new Date(playedAt || 0)
  if (!Number.isFinite(d.getTime())) return null
  const hora = Number(FORMATO_HORA_MADRID.format(d))
  return Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : null
}

// Las escuchas son del usuario, no del grupo: cada grupo puntúa TODAS las de
// sus miembros en la ventana. Antes se filtraban por la lista `groupIds` que
// llevaba cada evento al subirse, pero esa lista era la de los grupos que el
// usuario tenía EN ESE MOMENTO y no se reescribe: quien entraba en un grupo
// después de haber sincronizado aparecía en él con cero canciones toda la
// semana.

function topOf (map) {
  let name = ''
  let plays = 0
  for (const [key, count] of map.entries()) {
    if (count > plays) {
      name = key
      plays = count
    }
  }
  return { name, plays }
}

function scoreMember (events) {
  let validMinutes = 0
  let completedTracks = 0
  let totalTracks = 0
  const days = new Set()
  const artistPlays = new Map()
  const trackPlays = new Map()
  /** Escuchas por hora del día (0-23), para la hora punta. */
  const horas = new Array(24).fill(0)

  const addPlay = (map, rawKey) => {
    const key = (rawKey || '').toString().trim()
    if (!key) return
    map.set(key, (map.get(key) || 0) + 1)
  }

  for (const e of events) {
    const playedAt = new Date(e.playedAt || 0)
    if (!Number.isFinite(playedAt.getTime())) continue

    const duration = Number(e.durationMs || 0)
    const msPlayed = Number(e.msPlayed || 0)
    // Por debajo del 80 % la app guarda msPlayed = 0; `measuredMs` conserva el
    // avance realmente medido, que es lo que sirve para saber si la canción
    // llegó a contar.
    const measuredMs = Math.max(msPlayed, Number(e.measuredMs || 0))
    const ratio = duration > 0 ? msPlayed / duration : 0
    const measuredRatio = duration > 0 ? measuredMs / duration : 0

    if (e.countedForRegister === true || measuredRatio >= 0.25) {
      totalTracks += 1
      addPlay(artistPlays, e.artist)
      addPlay(trackPlays, e.track)
      const hora = horaLocalDeEscucha(e.playedAt)
      if (hora !== null) horas[hora] += 1
    }

    if (ratio >= 0.8 && msPlayed > 0) {
      validMinutes += msPlayed / 60000
      completedTracks += 1
      days.add(playedAt.toISOString().slice(0, 10))
    }
  }

  const activeDays = days.size
  const score = validMinutes + (activeDays * 2) + (completedTracks * 0.5)
  const topArtist = topOf(artistPlays)
  const topTrack = topOf(trackPlays)

  // Repertorio distinto. Se cuenta sobre las mismas escuchas que `totalTracks`
  // —las que superaron el umbral de registro—, para que el índice de variedad
  // divida dos cifras comparables.
  const distinctArtists = artistPlays.size
  const distinctTracks = trackPlays.size

  /**
   * Índice de variedad: canciones distintas entre escuchas totales.
   *
   * 1 significa que no se repitió ni una; 0,2 que cada tema sonó cinco veces de
   * media. Va como razón y no como porcentaje para que la app decida cómo
   * presentarlo.
   */
  const varietyIndex = totalTracks > 0 ? distinctTracks / totalTracks : 0

  // Hora punta: la de más escuchas. En caso de empate gana la más temprana, que
  // es lo que da el recorrido ascendente, para que el resultado sea estable
  // entre semanas en vez de depender del orden de los eventos.
  let peakHour = null
  let peakHourPlays = 0
  for (let h = 0; h < 24; h += 1) {
    if (horas[h] > peakHourPlays) {
      peakHour = h
      peakHourPlays = horas[h]
    }
  }

  return {
    totalMinutes: Number(validMinutes.toFixed(2)),
    completedTracks,
    totalTracks,
    topArtist: topArtist.name,
    topArtistPlays: topArtist.plays,
    topTrack: topTrack.name,
    topTrackPlays: topTrack.plays,
    distinctArtists,
    distinctTracks,
    varietyIndex: Number(varietyIndex.toFixed(3)),
    peakHour,
    peakHourPlays,
    activeDays,
    score: Number(score.toFixed(2))
  }
}

module.exports = { scoreMember, horaLocalDeEscucha, topOf }
