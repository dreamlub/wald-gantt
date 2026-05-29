import { NextResponse } from 'next/server'

// ⚠️ 임시 진단용 라우트 — Outline 수집 0건 원인 파악 후 제거 예정
const OUTLINE_API = 'https://waldlust.getoutline.com/api'
const DEBUG_KEY = 'wald-dbg-7x9q'

type TreeNode = { id: string; title: string; children?: TreeNode[] }

async function call(endpoint: string, body: object, token: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${OUTLINE_API}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null
  return { ok: res.ok, status: res.status, data: json?.data ?? null }
}

function flatten(nodes: TreeNode[], parentId: string | null): { title: string; parentDocumentId: string | null }[] {
  const out: { title: string; parentDocumentId: string | null }[] = []
  for (const n of nodes) {
    out.push({ title: n.title, parentDocumentId: parentId })
    if (n.children?.length) out.push(...flatten(n.children, n.id))
  }
  return out
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== DEBUG_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const token = process.env.OUTLINE_API_TOKEN
  if (!token) return NextResponse.json({ tokenPresent: false })

  const collectionId = url.searchParams.get('collectionId') ?? '6256a44b-efe5-4420-9066-a82f85e83b39'

  const tree = await call('collections.documents', { id: collectionId }, token)
  const list = await call('documents.list', { collectionId, limit: 100 }, token)

  const treeArr = Array.isArray(tree.data) ? (tree.data as TreeNode[]) : []
  const flat = flatten(treeArr, null)
  const listArr = Array.isArray(list.data) ? (list.data as { title: string }[]) : []

  return NextResponse.json({
    tokenPresent: true,
    tokenLen: token.length,
    collectionId,
    collectionsDocuments: {
      ok: tree.ok,
      status: tree.status,
      dataIsArray: Array.isArray(tree.data),
      topLevel: treeArr.length,
      flatCount: flat.length,
      titles: flat.map(d => d.title),
    },
    documentsList: {
      ok: list.ok,
      status: list.status,
      count: listArr.length,
      titles: listArr.map(d => d.title),
    },
  })
}
