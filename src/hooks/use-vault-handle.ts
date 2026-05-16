'use client'

import { useState, useEffect, useCallback } from 'react'

const DB_NAME   = 'wald-notes'
const STORE     = 'handles'
const HANDLE_KEY = 'vault'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(HANDLE_KEY)
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null)
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, HANDLE_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

async function removeHandle(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(HANDLE_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export type VaultStatus = 'loading' | 'disconnected' | 'needs-permission' | 'connected'

export function useVaultHandle() {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [status, setStatus] = useState<VaultStatus>('loading')

  useEffect(() => {
    async function init() {
      const stored = await getStoredHandle()
      if (!stored) { setStatus('disconnected'); return }
      // queryPermission은 사용자 제스처 없이도 가능
      const perm = await stored.queryPermission({ mode: 'readwrite' })
      setHandle(stored)
      setStatus(perm === 'granted' ? 'connected' : 'needs-permission')
    }
    init()
  }, [])

  const connect = useCallback(async () => {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' })
      await storeHandle(dir)
      setHandle(dir)
      setStatus('connected')
    } catch { /* 취소 */ }
  }, [])

  const requestPermission = useCallback(async () => {
    if (!handle) return
    const perm = await handle.requestPermission({ mode: 'readwrite' })
    if (perm === 'granted') setStatus('connected')
  }, [handle])

  const disconnect = useCallback(async () => {
    await removeHandle()
    setHandle(null)
    setStatus('disconnected')
  }, [])

  return { handle, status, connect, requestPermission, disconnect }
}
