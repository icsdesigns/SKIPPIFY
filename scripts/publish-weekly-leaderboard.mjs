import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { pathToFileURL } from 'node:url'

// La puntuación y el reparto por grupo viven en firebase/functions/scoring.js:
// es el único directorio que empaqueta «firebase deploy --only functions», así
// que es el único sitio desde el que pueden leerlo tanto la función programada
// como esta acción. Tener dos copias fue lo que dejó el ranking sin las cifras
// añadidas en la v4.0.1 según cuál de las dos publicara.
import scoring from '../firebase/functions/scoring.js'

const { scoreMember, horaLocalDeEscucha } = scoring

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

/**
 * Publicar fuera de la ventana del domingo.
 *
 * Además de la variable de entorno que usa la acción de GitHub, se acepta
 * `--ahora` en la línea de órdenes: exportar una variable de entorno se escribe
 * de forma distinta en cmd, PowerShell y bash, y esto es justo lo que hay que
 * ejecutar a mano cuando un grupo recién creado no tiene todavía ningún ranking
 * que enseñar.
 */
function isForcedPublish () {
  if ((process.env.FORCE_WEEKLY_PUBLISH || '').toLowerCase() === 'true') return true
  return process.argv.slice(2).some(a => a === '--ahora' || a === '--force')
}

const DIAS_SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

/** Instante UTC de una hora de pared en Madrid (vale en verano y en invierno). */
function madridWallTimeToDate (year, month, day, hour) {
  const guess = Date.UTC(year, month - 1, day, hour)
  const p = madridNowParts(new Date(guess))
  const desfase = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess
  return new Date(guess - desfase)
}

/**
 * Último corte semanal (domingo 15:00 Europe/Madrid) ya alcanzado.
 *
 * Antes sólo se publicaba si la acción arrancaba justo entre las 15:00 y las
 * 15:59, pero GitHub retrasa y salta las ejecuciones programadas: de las 24
 * horarias del domingo corren unas seis, a deshora. Los domingos en que ninguna
 * caía en esa hora el ranking no se publicaba. Ahora cualquier ejecución
 * posterior al corte publica el de esa semana, y la ventana se ancla al corte
 * para que la hora a la que arranque la acción no cambie las cifras.
 */
function latestWeeklyCut (now = new Date()) {
  const hoy = madridNowParts(now)
  const diasDesdeDomingo = DIAS_SEMANA.indexOf(hoy.weekday)
  const domingo = new Date(Date.UTC(hoy.year, hoy.month - 1, hoy.day - diasDesdeDomingo))
  let corte = madridWallTimeToDate(domingo.getUTCFullYear(), domingo.getUTCMonth() + 1, domingo.getUTCDate(), 15)
  if (corte > now) corte = new Date(corte.getTime() - SEMANA_MS)
  return corte
}

function getCutWindow (now = new Date()) {
  const end = latestWeeklyCut(now)
  const start = new Date(end.getTime() - SEMANA_MS)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    weekKey: start.toISOString().slice(0, 10)
  }
}

function getRollingWindow () {
  const end = new Date()
  const start = new Date(end.getTime() - SEMANA_MS)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    weekKey: start.toISOString().slice(0, 10)
  }
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
  const serviceAccount = getServiceAccountFromEnv()
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) })
  }

  const db = getFirestore()
  const forzado = isForcedPublish()
  const { startIso, endIso, weekKey } = forzado ? getRollingWindow() : getCutWindow()
  console.log(`[weekly] Publishing window ${startIso} -> ${endIso}${forzado ? ' (forzado)' : ''}`)

  const groupsSnap = await db.collection('friend_groups').get()
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id
    const resultsCollection = db.collection('friend_groups').doc(groupId).collection('weekly_results')

    // La acción corre varias veces después del corte; sólo la primera publica.
    if (!forzado) {
      const currentSnap = await resultsCollection.doc('current').get()
      if (currentSnap.exists && currentSnap.get('weekEnd') === endIso) {
        console.log(`[weekly] Group ${groupId} already published for ${endIso}`)
        continue
      }
    }
    const membersSnap = await db.collection('friend_groups').doc(groupId).collection('members').get()
    const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
    if (!members.length) continue

    const results = []
    for (const member of members) {
      const events = await fetchMemberEventsForWindow(db, member.uid, startIso, endIso)
      // Todas las escuchas del miembro: ver la nota en scoring.js.
      const stats = scoreMember(events)

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

export { scoreMember, horaLocalDeEscucha, latestWeeklyCut }
