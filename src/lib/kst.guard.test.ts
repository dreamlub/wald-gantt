import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 회귀 방지: KST 계산은 @/lib/kst 단일 모듈만 사용한다.
 * 아래 패턴이 kst.ts 밖에서 다시 등장하면 실패시켜, 인라인 +9h 오프셋 핵 재유입을 막는다.
 */
const SRC = join(process.cwd(), 'src')

// 검사 대상에서 제외: 단일 기준 모듈 본인과 테스트 파일
const EXEMPT = new Set(['kst.ts'])

const BANNED: { label: string; test: (collapsed: string, raw: string) => boolean }[] = [
  { label: '+9h 고정 오프셋(9 * 60 * 60 * 1000)', test: c => c.includes('9*60*60*1000') },
  { label: '+9h 고정 오프셋(9 * 3600000 류)', test: c => /9\*3_?600_?000/.test(c) },
  { label: '+33h 고정 오프셋(33 * 3600000)', test: c => c.includes('33*3600000') },
  { label: "인라인 toLocaleDateString('sv-SE') — kstDate 사용", test: (_c, raw) => raw.includes("toLocaleDateString('sv-SE'") },
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { out.push(...walk(p)); continue }
    if (!/\.(ts|tsx)$/.test(name)) continue
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue
    if (EXEMPT.has(name)) continue
    out.push(p)
  }
  return out
}

describe('KST 단일 기준 가드', () => {
  it('인라인 타임존 오프셋 핵이 @/lib/kst 밖에 없어야 한다', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const raw = readFileSync(file, 'utf8')
      const collapsed = raw.replace(/\s+/g, '')
      for (const rule of BANNED) {
        if (rule.test(collapsed, raw)) {
          offenders.push(`${file.replace(SRC, 'src')} → ${rule.label}`)
        }
      }
    }
    expect(offenders, `\n금지 패턴 발견:\n${offenders.join('\n')}\n→ @/lib/kst 헬퍼를 사용하세요.`).toEqual([])
  })
})
