const PATTERN_KEY   = 'notes-path-pattern'
const DEFAULT_PATTERN = 'Daily Notes/YYYY-MM-DD'

export function getPathPattern(): string {
  if (typeof window === 'undefined') return DEFAULT_PATTERN
  return localStorage.getItem(PATTERN_KEY) ?? DEFAULT_PATTERN
}

export function setPathPattern(pattern: string): void {
  localStorage.setItem(PATTERN_KEY, pattern)
}

export function dateToPath(date: Date, pattern: string): string {
  const y  = date.getFullYear()
  const m  = String(date.getMonth() + 1).padStart(2, '0')
  const d  = String(date.getDate()).padStart(2, '0')
  return pattern
    .replace('YYYY', String(y))
    .replace('MM', m)
    .replace('DD', d)
    + '.md'
}

async function getDirHandle(
  root: FileSystemDirectoryHandle,
  parts: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let cur = root
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create })
  }
  return cur
}

export async function readNote(
  root: FileSystemDirectoryHandle,
  date: Date,
): Promise<string | null> {
  const path  = dateToPath(date, getPathPattern())
  const parts = path.split('/')
  const fname = parts.pop()!
  try {
    const dir    = await getDirHandle(root, parts)
    const fh     = await dir.getFileHandle(fname)
    const file   = await fh.getFile()
    return await file.text()
  } catch { return null }
}

export async function writeNote(
  root: FileSystemDirectoryHandle,
  date: Date,
  content: string,
): Promise<void> {
  const path  = dateToPath(date, getPathPattern())
  const parts = path.split('/')
  const fname = parts.pop()!
  const dir   = await getDirHandle(root, parts, true)
  const fh    = await dir.getFileHandle(fname, { create: true })
  const w     = await fh.createWritable()
  await w.write(content)
  await w.close()
}
