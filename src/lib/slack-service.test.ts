// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isObviousNoise, type RawJson } from './slack-service'

function makeRj(text: string, replies: RawJson['replies'] = []): RawJson {
  return {
    ts: '1716284400.001',
    text,
    user: 'U1',
    user_name: 'tester',
    channel: 'general',
    channel_id: 'C1',
    permalink: '',
    reply_count: replies.length,
    replies,
  }
}

describe('isObviousNoise', () => {
  it('빈 텍스트는 노이즈', () => {
    expect(isObviousNoise(makeRj(''))).toBe(true)
    expect(isObviousNoise(makeRj('   '))).toBe(true)
  })

  it('한 단어 짧은 답변은 노이즈', () => {
    expect(isObviousNoise(makeRj('네'))).toBe(true)
    expect(isObviousNoise(makeRj('넵!'))).toBe(true)
    expect(isObviousNoise(makeRj('확인'))).toBe(true)
    expect(isObviousNoise(makeRj('감사합니다'))).toBe(true)
    expect(isObviousNoise(makeRj('ok'))).toBe(true)
    expect(isObviousNoise(makeRj('Thanks!'))).toBe(true)
    expect(isObviousNoise(makeRj('ㅋㅋㅋ'))).toBe(true)
  })

  it('이모지만 있는 텍스트는 노이즈', () => {
    expect(isObviousNoise(makeRj(':+1:'))).toBe(true)
    expect(isObviousNoise(makeRj(':thumbsup: :pray:'))).toBe(true)
    expect(isObviousNoise(makeRj('🙏'))).toBe(true)
  })

  it('의미 있는 텍스트는 노이즈 아님', () => {
    expect(isObviousNoise(makeRj('내일 미팅 가능할까요?'))).toBe(false)
    expect(isObviousNoise(makeRj('서버에 오류가 발생했어요'))).toBe(false)
    expect(isObviousNoise(makeRj('계약서 검토 부탁드립니다'))).toBe(false)
  })

  it('스레드 있으면 짧은 답변이어도 노이즈 아님 (답글에 정보 있을 수 있음)', () => {
    const replies = [{ ts: '1.0', text: '중요한 답글', user: 'U2', user_name: 'a' }]
    expect(isObviousNoise(makeRj('네', replies))).toBe(false)
    expect(isObviousNoise(makeRj('', replies))).toBe(false)
    expect(isObviousNoise(makeRj('🙏', replies))).toBe(false)
  })
})
