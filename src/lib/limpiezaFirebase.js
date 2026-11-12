/**
 * Limpieza de lo que dejó en el WebView la Comunidad con servidor (Firebase).
 *
 * Skippify ya no habla con Firebase. Las versiones anteriores guardaban la
 * sesión anónima (con su refresh token) y cachés del SDK en IndexedDB; aquí se
 * borran una sola vez. Es idempotente y no espera a nadie: si falla, se
 * reintenta en el siguiente arranque.
 */
const MARCA = 'skippify-firebase-limpio'
const BASES = [
  'firebaseLocalStorageDb',
  'firebase-heartbeat-database',
  'firebase-installations-database'
]

export function limpiarRestosDeFirebase (idb = globalThis.indexedDB, almacen = globalThis.localStorage) {
  try {
    if (!idb || almacen?.getItem(MARCA) === '1') return
    let pendientes = BASES.length
    const fin = () => {
      pendientes -= 1
      if (pendientes === 0) {
        try { almacen?.setItem(MARCA, '1') } catch { /* se reintenta */ }
      }
    }
    for (const nombre of BASES) {
      const req = idb.deleteDatabase(nombre)
      req.onsuccess = req.onerror = req.onblocked = fin
    }
    // Claves sueltas que el SDK dejaba en localStorage.
    for (let i = (almacen?.length || 0) - 1; i >= 0; i -= 1) {
      const k = almacen.key(i)
      if (k && /^firebase:/.test(k)) almacen.removeItem(k)
    }
  } catch { /* sin almacenamiento: nada que limpiar */ }
}
