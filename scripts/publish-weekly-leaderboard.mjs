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
 * Cierre de los datos y desvelado: dos horas distintas del mismo domingo.
 *
 * El ranking tiene que verse el domingo a las 15:00 en punto, y GitHub retrasa
 * y salta las ejecuciones programadas (el 27-09-2026 no corrió ninguna entre
 * las 17:00 y las 22:00 UTC). Con el corte a las 15:00 el ranking no podía
 * calcularse antes de esa hora, así que siempre llegaba tarde. Ahora la semana
 * se cierra el domingo a las 00:00, cualquier ejecución a partir de las 03:00
 * la publica (tres horas de gracia para que los móviles terminen de subir las
 * escuchas: el servicio lo hace como mucho una vez por hora) y el documento
 * lleva `revealAt` con las 15:00 de ese domingo. Es la app la que lo desvela a
 * esa hora, con una alarma exacta, aunque los datos lleven horas publicados.
 */
const HORA_CIERRE = 0
const HORA_DESVELADO = 15
const GRACIA_MS = 3 * 60 * 60 * 1000

/** Último domingo a `hora` (Madrid) que ya ha pasado. */
function ultimoDomingoA (now, hora) {
  const hoy = madridNowParts(now)
  const diasDesdeDomingo = DIAS_SEMANA.indexOf(hoy.weekday)
  const domingo = new Date(Date.UTC(hoy.year, hoy.month - 1, hoy.day - diasDesdeDomingo))
  let corte = madridWallTimeToDate(domingo.getUTCFullYear(), domingo.getUTCMonth() + 1, domingo.getUTCDate(), hora)
  if (corte > now) {
    // Por la fecha y no restando 7 días: la semana del cambio de hora no dura 168 h.
    const antes = new Date(domingo.getTime() - SEMANA_MS)
    corte = madridWallTimeToDate(antes.getUTCFullYear(), antes.getUTCMonth() + 1, antes.getUTCDate(), hora)
  }
  return corte
}

/**
 * Último cierre semanal (domingo 00:00 Europe/Madrid) que ya se puede publicar.
 *
 * Cualquier ejecución posterior al cierre más la gracia publica el de esa
 * semana, y la ventana se ancla al cierre para que la hora a la que arranque
 * la acción no cambie las cifras.
 */
function latestWeeklyCut (now = new Date()) {
  return ultimoDomingoA(new Date(now.getTime() - GRACIA_MS), HORA_CIERRE)
}

/** Las 15:00 (Madrid) del domingo en que se cierra `cierre`. */
function revealAtForCut (cierre) {
  const p = madridNowParts(cierre)
  return madridWallTimeToDate(p.year, p.month, p.day, HORA_DESVELADO)
}

function getCutWindow (now = new Date(), finAnterior = '') {
  const end = latestWeeklyCut(now)
  let start = ultimoDomingoA(new Date(end.getTime() - 1), HORA_CIERRE)
  // La primera semana tras mover el cierre de las 15:00 a las 00:00 se
  // solaparía quince horas con la anterior: esas escuchas ya puntuaron.
  const anterior = finAnterior ? new Date(finAnterior) : null
  if (anterior && !Number.isNaN(anterior.getTime()) && anterior > start && anterior < end) {
    start = anterior
  }
  const dia = madridNowParts(start)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    // El día de Madrid: las 00:00 del domingo son aún sábado en UTC.
    weekKey: `${dia.year}-${String(dia.month).padStart(2, '0')}-${String(dia.day).padStart(2, '0')}`,
    revealAtIso: revealAtForCut(end).toISOString()
  }
}

function getRollingWindow () {
  const end = new Date()
  const start = new Date(end.getTime() - SEMANA_MS)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    weekKey: start.toISOString().slice(0, 10),
    // A mano se publica para verlo ya.
    revealAtIso: end.toISOString()
  }
}

/**
 * El documento `current` con la semana nueva colocada en su sitio.
 *
 * Los campos de arriba son lo que se ve ahora (y lo único que leen las
 * versiones de la app anteriores a la 4.2.7). Mientras no llega la hora de
 * desvelar, la semana nueva espera en `next` y arriba sigue la anterior; la
 * primera ejecución posterior a `revealAt` la sube arriba, para esas apps
 * antiguas. La app nueva no espera a esa ejecución: lee `next` en cuanto su
 * reloj pasa de `revealAt`.
 */
function colocarSemana (actual, semana, now = new Date()) {
  const base = { ...(actual || {}) }
  delete base.next
  if (new Date(semana.revealAt) <= now) return { ...base, ...semana }
  return { ...base, next: semana }
}

/** Sube `next` a la vista si ya es su hora; null si no hay nada que hacer. */
function promocionPendiente (actual, now = new Date()) {
  const next = actual?.next
  if (!next || !next.revealAt || new Date(next.revealAt) > now) return null
  const base = { ...actual }
  delete base.next
  return { ...base, ...next }
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
  const ahora = new Date()
  console.log(`[weekly] Último cierre publicable: ${latestWeeklyCut(ahora).toISOString()}${forzado ? ' (forzado)' : ''}`)

  const groupsSnap = await db.collection('friend_groups').get()
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id
    const resultsCollection = db.collection('friend_groups').doc(groupId).collection('weekly_results')
    const currentRef = resultsCollection.doc('current')
    const currentSnap = await currentRef.get()
    let actual = currentSnap.exists ? currentSnap.data() : null

    // Una semana que esperaba su hora pasa a la vista: es para las apps antiguas.
    const promovido = promocionPendiente(actual, ahora)
    if (promovido) {
      await currentRef.set(promovido)
      actual = promovido
      console.log(`[weekly] Group ${groupId}: desvelada la semana ${promovido.weekEnd}`)
    }

    const finAnterior = actual?.next?.weekEnd || actual?.weekEnd || ''
    const { startIso, endIso, weekKey, revealAtIso } = forzado
      ? getRollingWindow()
      : getCutWindow(ahora, finAnterior)

    // La acción corre muchas veces después del cierre; sólo la primera publica.
    if (!forzado && (actual?.weekEnd === endIso || actual?.next?.weekEnd === endIso)) {
      console.log(`[weekly] Group ${groupId} already published for ${endIso}`)
      continue
    }
    console.log(`[weekly] Group ${groupId}: ventana ${startIso} -> ${endIso}, se desvela ${revealAtIso}`)
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
        revealAt: revealAtIso,
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

    const semana = {
      weekKey,
      weekStart: startIso,
      weekEnd: endIso,
      revealAt: revealAtIso,
      publishedAt: FieldValue.serverTimestamp(),
      members: results,
      algorithm: {
        mode: 'free-github-actions',
        minutesWeight: 1,
        activeDaysWeight: 2,
        completedTracksWeight: 0.5,
        minCompletionRatioForMinutes: 0.8
      }
    }
    // Sin merge: `next` tiene que poder desaparecer entero al subir arriba.
    await currentRef.set(colocarSemana(actual, semana, new Date()))

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

export { scoreMember, horaLocalDeEscucha, latestWeeklyCut, revealAtForCut, getCutWindow, colocarSemana, promocionPendiente }
