import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { pathToFileURL } from 'node:url'

function getServiceAccountFromEnv () {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
  if (!raw.trim()) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.')
  }
  return JSON.parse(raw)
}

function madridNowParts (date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

function shouldRunPublishNow () {
  if ((process.env.FORCE_WEEKLY_PUBLISH || '').toLowerCase() === 'true') return true
  const now = madridNowParts()
  return now.weekday === 'Sun' && now.hour === 15
}

function getRollingWindow () {
  const end = new Date()
  const start = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000))
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    weekKey: start.toISOString().slice(0, 10)
  }
}

/**
 * Hora del día en la que se oyó algo, en la zona horaria del usuario.
 *
 * `playedAt` viaja en UTC, así que leerlo con `getHours()` daría una hora
 * corrida: en verano, lo que aquí son las 00:30 se guarda como las 22:30 del día
 * anterior, y la «hora punta» de media España saldría desplazada dos horas. El
 * formateador se crea UNA vez porque construir un Intl.DateTimeFormat por cada
 * evento es lo bastante caro como para notarse con miles de escuchas.
 *
 * `hourCycle: 'h23'` y no `hour12: false`: con este último, algunas versiones de
 * ICU devuelven «24» para la medianoche en vez de «00».
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

  const getTop = (map) => {
    let bestKey = ''
    let bestCount = 0
    for (const [key, count] of map.entries()) {
      if (count > bestCount) {
        bestKey = key
        bestCount = count
      }
    }
    return { name: bestKey, plays: bestCount }
  }

  for (const e of events) {
    const duration = Number(e.durationMs || 0)
    const msPlayed = Number(e.msPlayed || 0)
    // Por debajo del 80 % la app guarda msPlayed = 0; `measuredMs` conserva el
    // avance real, que es lo que sirve para saber si la canción llegó a contar.
    const measuredMs = Math.max(msPlayed, Number(e.measuredMs || 0))
    const ratio = duration > 0 ? msPlayed / duration : 0
    const measuredRatio = duration > 0 ? measuredMs / duration : 0
    const countedForRegister = e.countedForRegister === true || measuredRatio >= 0.25

    if (countedForRegister) {
      totalTracks += 1
      addPlay(artistPlays, e.artist)
      addPlay(trackPlays, e.track)
      const hora = horaLocalDeEscucha(e.playedAt)
      if (hora !== null) horas[hora] += 1
    }

    if (ratio >= 0.8 && msPlayed > 0) {
      validMinutes += msPlayed / 60000
      completedTracks += 1
      const d = new Date(e.playedAt || 0)
      if (Number.isFinite(d.getTime())) days.add(d.toISOString().slice(0, 10))
    }
  }

  const activeDays = days.size
  const score = validMinutes + (activeDays * 2) + (completedTracks * 0.5)
  const topArtist = getTop(artistPlays)
  const topTrack = getTop(trackPlays)

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

/**
 * Un usuario puede estar en varios grupos, así que sus reproducciones llevan la
 * lista `groupIds`. `groupId` (una sola) se mantiene por los eventos subidos con
 * versiones anteriores de la app.
 */
function belongsToGroup (event, groupId) {
  if (Array.isArray(event?.groupIds) && event.groupIds.length) {
    return event.groupIds.includes(groupId)
  }
  return (event?.groupId || '') === groupId
}

async function fetchMemberEventsForWindow (db, uid, startIso, endIso) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('listening_events')
    .where('playedAt', '>=', startIso)
    .where('playedAt', '<', endIso)
    .get()

  return snap.docs.map(d => d.data())
}

async function run () {
  if (!shouldRunPublishNow()) {
    console.log('[weekly] Skipped: outside Sunday 15:00 Europe/Madrid window.')
    return
  }

  const serviceAccount = getServiceAccountFromEnv()
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) })
  }

  const db = getFirestore()
  const { startIso, endIso, weekKey } = getRollingWindow()
  console.log(`[weekly] Publishing window ${startIso} -> ${endIso}`)

  const groupsSnap = await db.collection('friend_groups').get()
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id
    const resultsCollection = db.collection('friend_groups').doc(groupId).collection('weekly_results')
    const membersSnap = await db.collection('friend_groups').doc(groupId).collection('members').get()
    const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
    if (!members.length) continue

    const results = []
    for (const member of members) {
      const events = await fetchMemberEventsForWindow(db, member.uid, startIso, endIso)
      const groupScoped = events.filter(e => belongsToGroup(e, groupId))
      const stats = scoreMember(groupScoped)

      results.push({
        uid: member.uid,
        displayName: member.displayName || member.uid,
        ...stats
      })
    }

    results.sort((a, b) => b.score - a.score)

    const usersBatch = db.batch()
    for (const memberResult of results) {
      const userRef = db.collection('users').doc(memberResult.uid)
      const weeklyStatsRef = userRef.collection('league_weekly_stats').doc('current')

      usersBatch.set(weeklyStatsRef, {
        weekKey,
        weekStart: startIso,
        weekEnd: endIso,
        groupId,
        displayName: memberResult.displayName,
        totalMinutes: memberResult.totalMinutes,
        totalTracks: memberResult.totalTracks,
        completedTracks: memberResult.completedTracks,
        activeDays: memberResult.activeDays,
        score: memberResult.score,
        topArtist: memberResult.topArtist,
        topArtistPlays: memberResult.topArtistPlays,
        topTrack: memberResult.topTrack,
        topTrackPlays: memberResult.topTrackPlays,
        distinctArtists: memberResult.distinctArtists,
        distinctTracks: memberResult.distinctTracks,
        varietyIndex: memberResult.varietyIndex,
        peakHour: memberResult.peakHour,
        peakHourPlays: memberResult.peakHourPlays,
        publishedAt: FieldValue.serverTimestamp()
      }, { merge: true })

      usersBatch.set(userRef, {
        latestLeagueSummary: {
          weekKey,
          groupId,
          totalMinutes: memberResult.totalMinutes,
          totalTracks: memberResult.totalTracks,
          completedTracks: memberResult.completedTracks,
          activeDays: memberResult.activeDays,
          score: memberResult.score,
          topArtist: memberResult.topArtist,
          topArtistPlays: memberResult.topArtistPlays,
          topTrack: memberResult.topTrack,
          topTrackPlays: memberResult.topTrackPlays,
          distinctArtists: memberResult.distinctArtists,
          distinctTracks: memberResult.distinctTracks,
          varietyIndex: memberResult.varietyIndex,
          peakHour: memberResult.peakHour,
          peakHourPlays: memberResult.peakHourPlays,
          publishedAt: FieldValue.serverTimestamp()
        }
      }, { merge: true })
    }

    await usersBatch.commit()

    const pruneBatch = db.batch()
    const existingResultsSnap = await resultsCollection.get()
    for (const docSnap of existingResultsSnap.docs) {
      if (docSnap.id !== 'current') {
        pruneBatch.delete(docSnap.ref)
      }
    }

    for (const member of members) {
      const weeklyStatsCollection = db.collection('users').doc(member.uid).collection('league_weekly_stats')
      const existingStatsSnap = await weeklyStatsCollection.get()
      for (const docSnap of existingStatsSnap.docs) {
        if (docSnap.id !== 'current') {
          pruneBatch.delete(docSnap.ref)
        }
      }
    }

    await pruneBatch.commit()

    await resultsCollection
      .doc('current')
      .set({
        weekKey,
        weekStart: startIso,
        weekEnd: endIso,
        publishedAt: FieldValue.serverTimestamp(),
        members: results,
        algorithm: {
          mode: 'free-github-actions',
          minutesWeight: 1,
          activeDaysWeight: 2,
          completedTracksWeight: 0.5,
          minCompletionRatioForMinutes: 0.8
        }
      }, { merge: true })

    console.log(`[weekly] Published group ${groupId} (${results.length} members)`)
  }

  console.log('[weekly] Done')
}

/**
 * Sólo se publica cuando el fichero se ejecuta a propósito.
 *
 * Sin esta guarda, importar el módulo para probar `scoreMember` arrancaría la
 * publicación entera: pediría el secreto del service account y, con él, se
 * pondría a escribir en la base de datos de producción.
 */
const ejecucionDirecta = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (ejecucionDirecta) {
  run().catch((err) => {
    console.error('[weekly] Failed:', err)
    process.exit(1)
  })
}

export { scoreMember, horaLocalDeEscucha }
