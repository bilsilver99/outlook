import type { MailMessage } from '../types'

export interface CacheEntry {
  email: string
  messages: MailMessage[]
  cachedAt: number
  historyId?: string
}

const DB_NAME = 'outlook-purge'
const STORE = 'gmail-cache'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2) // version 2: stores messages not groups
    req.onupgradeneeded = () => {
      const db = req.result
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE)
      db.createObjectStore(STORE, { keyPath: 'email' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCache(email: string): Promise<CacheEntry | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(email)
    req.onsuccess = () => {
      const result = req.result as CacheEntry | undefined
      resolve(result?.messages ? result : null)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function setCache(entry: CacheEntry): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearCache(email: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(email)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
