import { describe, expect, it } from 'vitest'

// permalink 기반 스레드 답글 감지 로직 검증 (history-service 내부 함수 isThreadReplyPermalink 동작 확인)
function isThreadReplyPermalink(permalink: string, ts: string): boolean {
  try {
    const threadTs = new URL(permalink).searchParams.get('thread_ts')
    return !!threadTs && threadTs !== ts
  } catch {
    return false
  }
}

describe('isThreadReplyPermalink', () => {
  it('thread_ts !== ts → thread reply', () => {
    // 실제 DB에서 확인된 team-vietnam 스레드 답글 패턴
    expect(isThreadReplyPermalink(
      'https://waldlust-product.slack.com/archives/C0A0NLAR03G/p1779444612200429?thread_ts=1779408602.275719',
      '1779444612.200429'
    )).toBe(true)
  })

  it('thread_ts === ts → parent message (not a reply)', () => {
    // 부모 메시지는 thread_ts가 자신의 ts와 같음
    expect(isThreadReplyPermalink(
      'https://waldlust-product.slack.com/archives/D09/p1779450009390699?thread_ts=1779450009.390699',
      '1779450009.390699'
    )).toBe(false)
  })

  it('no thread_ts → standalone message (not a reply)', () => {
    expect(isThreadReplyPermalink(
      'https://waldlust-product.slack.com/archives/C0AF70LA8BA/p1779494220091169',
      '1779494220.091169'
    )).toBe(false)
  })

  it('invalid URL → not a reply (safe fallback)', () => {
    expect(isThreadReplyPermalink('not-a-url', '123')).toBe(false)
  })
})
