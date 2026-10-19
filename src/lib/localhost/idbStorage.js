/**
 * Almacenamiento de LocalHost sobre IndexedDB: una base por grupo.
 *
 * Implementa la interfaz `Storage` del kit con las mismas reglas que
 * `MemoryStorage` (que es su referencia exacta): una sola versión por
 * (autor, seq) y copias profundas —IndexedDB ya clona al guardar y leer—.
 *
 * `idb` se puede inyectar para probarlo en Node con fake-indexeddb.
 */

const DB_VERSION = 1
const S_EVENTS = 'events' // clave [author, seq]
const S_META = 'meta' // clave k
const S_OUTBOX = 'outbox' // clave id
const S_SNAP = 'snapshot' // clave única 'latest'

function reqToPromise (req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone (tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('transacción abortada'))
  })
}

export function dbNameForSlot (slot) {
  return `skippify-lh-${slot}`
}

export function deleteSlot (slot, idb = globalThis.indexedDB) {
  return new Promise((resolve) => {
    try {
      const req = idb.deleteDatabase(dbNameForSlot(slot))
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

export class IdbStorage {
  constructor (slot, idb = globalThis.indexedDB) {
    this.slot = slot
    this.idb = idb
    this._db = null
    this.outbox = {
      add: async (n) => {
        const db = await this._open()
        const tx = db.transaction(S_OUTBOX, 'readwrite')
        tx.objectStore(S_OUTBOX).put(n)
        await txDone(tx)
      },
      list: async () => {
        const db = await this._open()
        return reqToPromise(db.transaction(S_OUTBOX).objectStore(S_OUTBOX).getAll())
      },
      ack: async (id) => {
        const db = await this._open()
        const tx = db.transaction(S_OUTBOX, 'readwrite')
        tx.objectStore(S_OUTBOX).delete(id)
        await txDone(tx)
      }
    }
    this.meta = {
      get: async (k) => {
        const db = await this._open()
        const row = await reqToPromise(db.transaction(S_META).objectStore(S_META).get(k))
        return row ? row.v : undefined
      },
      set: async (k, v) => {
        const db = await this._open()
        const tx = db.transaction(S_META, 'readwrite')
        tx.objectStore(S_META).put({ k, v })
        await txDone(tx)
      }
    }
  }

  _open () {
    if (this._db) return Promise.resolve(this._db)
    if (!this._opening) {
      this._opening = new Promise((resolve, reject) => {
        const req = this.idb.open(dbNameForSlot(this.slot), DB_VERSION)
        req.onupgradeneeded = () => {
          const db = req.result
          db.createObjectStore(S_EVENTS, { keyPath: ['author', 'seq'] })
          db.createObjectStore(S_META, { keyPath: 'k' })
          db.createObjectStore(S_OUTBOX, { keyPath: 'id' })
          db.createObjectStore(S_SNAP)
        }
        req.onsuccess = () => { this._db = req.result; resolve(this._db) }
        req.onerror = () => reject(req.error)
      })
    }
    return this._opening
  }

  close () {
    if (this._db) this._db.close()
    this._db = null
    this._opening = null
  }

  async putEvents (evs) {
    const db = await this._open()
    const tx = db.transaction(S_EVENTS, 'readwrite')
    const store = tx.objectStore(S_EVENTS)
    for (const e of evs) store.put(e)
    await txDone(tx)
  }

  async getEvents (filter) {
    const db = await this._open()
    const store = db.transaction(S_EVENTS).objectStore(S_EVENTS)
    const from = filter?.fromSeq ?? 0
    let rows
    if (filter?.author !== undefined) {
      rows = await reqToPromise(store.getAll(IDBKeyRange.bound([filter.author, 0], [filter.author, Number.MAX_SAFE_INTEGER])))
    } else {
      rows = await reqToPromise(store.getAll())
    }
    // getAll ya viene ordenado por [author, seq].
    return rows.filter(e => e.seq >= from)
  }

  async getVector () {
    const db = await this._open()
    const rows = await reqToPromise(db.transaction(S_EVENTS).objectStore(S_EVENTS).getAllKeys())
    const vector = {}
    let author = null
    let expected = 1
    let alive = false
    for (const [au, seq] of rows) {
      if (au !== author) {
        author = au
        expected = 1
        alive = true
      }
      if (alive && seq === expected) {
        vector[au] = seq
        expected += 1
      } else if (seq > expected) {
        alive = false
      }
    }
    return vector
  }

  async putSnapshot (s) {
    const db = await this._open()
    const tx = db.transaction(S_SNAP, 'readwrite')
    tx.objectStore(S_SNAP).put(s, 'latest')
    await txDone(tx)
  }

  async latestSnapshot () {
    const db = await this._open()
    const s = await reqToPromise(db.transaction(S_SNAP).objectStore(S_SNAP).get('latest'))
    return s ?? null
  }
}
