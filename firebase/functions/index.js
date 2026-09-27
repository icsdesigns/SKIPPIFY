const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
// Puntuación compartida con la acción de GitHub: una sola implementación, en
// scoring.js, para que las dos publiquen exactamente las mismas cifras.
const { scoreMember } = require('./scoring')

admin.initializeApp()
const db = admin.firestore()

function getWeekKeyFromDate (date) {
  const d = new Date(date)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

async function fetchMemberEventsForWindow (uid, startIso, endIso) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('listening_events')
    .where('playedAt', '>=', startIso)
    .where('playedAt', '<', endIso)
    .get()

  return snap.docs.map(d => d.data())
}

/**
 * Publica el ranking de un grupo para una ventana concreta.
 *
 * Es el cuerpo que comparten la publicación programada y la manual: antes sólo
 * existía dentro del bucle de la programada, así que «publicar ahora» no tenía
 * forma de hacer el mismo trabajo y se quedó en un endpoint que respondía
 * `ok: true` sin escribir nada.
 *
 * @returns {Promise<number>} miembros puntuados; 0 si el grupo está vacío.
 */
async function publicarRankingDeGrupo (groupId, { weekKey, weekStartIso, weekEndIso }) {
  const membersSnap = await db.collection('friend_groups').doc(groupId).collection('members').get()
  const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
  if (!members.length) return 0

  const results = []
  for (const member of members) {
    const events = await fetchMemberEventsForWindow(member.uid, weekStartIso, weekEndIso)
    const stats = scoreMember(events)

    results.push({
      uid: member.uid,
      displayName: member.displayName || member.uid,
      ...stats
    })
  }

  results.sort((a, b) => b.score - a.score)

  const payload = {
    weekKey,
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    members: results,
    algorithm: {
      minutesWeight: 1,
      activeDaysWeight: 2,
      completedTracksWeight: 0.5,
      minCompletionRatioForMinutes: 0.8
    }
  }

  const resultsCollection = db
    .collection('friend_groups')
    .doc(groupId)
    .collection('weekly_results')

  // Se escriben las dos: el histórico por semana y el alias `current`, que
  // es el que lee la app cuando no puede listar la colección.
  const batch = db.batch()
  batch.set(resultsCollection.doc(weekKey), payload, { merge: true })
  batch.set(resultsCollection.doc('current'), payload, { merge: true })
  await batch.commit()

  return results.length
}

/** Semana natural cerrada anterior (lunes a lunes), en UTC. */
function ventanaSemanaAnterior (now = new Date()) {
  const currentWeekStart = new Date(now)
  const weekDay = (currentWeekStart.getUTCDay() + 6) % 7
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - weekDay)
  currentWeekStart.setUTCHours(0, 0, 0, 0)

  const prevWeekStart = new Date(currentWeekStart)
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7)

  return {
    weekStartIso: prevWeekStart.toISOString(),
    weekEndIso: currentWeekStart.toISOString(),
    weekKey: getWeekKeyFromDate(prevWeekStart)
  }
}

/**
 * Últimos siete días hasta este instante. Es la ventana de la publicación
 * manual, y la misma que usa `scripts/publish-weekly-leaderboard.mjs`: quien
 * pide «publicar ahora» quiere ver lo que ha escuchado esta semana, no la
 * anterior ya cerrada.
 */
function ventanaUltimos7Dias (now = new Date()) {
  const start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
  return {
    weekStartIso: start.toISOString(),
    weekEndIso: now.toISOString(),
    weekKey: start.toISOString().slice(0, 10)
  }
}

exports.computeWeeklyLeaderboards = onSchedule(
  {
    schedule: '0 15 * * 0',
    timeZone: 'Europe/Madrid',
    region: 'europe-west1'
  },
  async () => {
    const ventana = ventanaSemanaAnterior()
    const groupsSnap = await db.collection('friend_groups').get()

    for (const groupDoc of groupsSnap.docs) {
      await publicarRankingDeGrupo(groupDoc.id, ventana)
    }
  }
)

/**
 * Publicación a petición, para un solo grupo y sólo por quien pertenece a él.
 *
 * Existe porque el ranking es la única parte de Comunidad que el cliente no
 * puede calcularse: las reglas dejan leer las escuchas de cada uno únicamente a
 * su dueño, y `weekly_results` es de sólo lectura. Sin esto, un grupo recién
 * creado no enseña ni una cifra hasta el domingo siguiente.
 */
exports.publishWeeklyResultNow = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.')
  }

  const groupId = (request.data?.groupId || '').toString().trim()
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'groupId is required.')
  }

  const memberDoc = await db.collection('friend_groups').doc(groupId).collection('members').doc(request.auth.uid).get()
  if (!memberDoc.exists) {
    throw new HttpsError('permission-denied', 'You are not a member of this group.')
  }

  const ventana = ventanaUltimos7Dias()
  const scored = await publicarRankingDeGrupo(groupId, ventana)

  return { ok: true, weekKey: ventana.weekKey, members: scored }
})

