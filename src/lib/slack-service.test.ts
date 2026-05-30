// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getReplySourceIds, isObviousNoise, balanceBold, validateClassification, hasMeaningfulContent, type RawJson } from './slack-service'

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

describe('balanceBold', () => {
  it('균형 잡힌 볼드는 그대로', () => {
    expect(balanceBold('**a** 일반 **b**')).toBe('**a** 일반 **b**')
    expect(balanceBold('볼드 없음')).toBe('볼드 없음')
  })

  it('닫히지 않은 마지막 볼드 표식 제거', () => {
    expect(balanceBold('a **b')).toBe('a b')
    expect(balanceBold('**a** c **d')).toBe('**a** c d')
  })

  it('여러 줄에서도 마지막 미닫힘만 보정', () => {
    expect(balanceBold('• 배경: **중요**\n• 조치: **미완')).toBe('• 배경: **중요**\n• 조치: 미완')
  })
})

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

describe('getReplySourceIds', () => {
  it('returns unique reply timestamps and excludes the parent timestamp', () => {
    expect(getReplySourceIds([
      makeRj('parent', [
        { ts: '1716364860.000002', text: 'reply', user: 'U2', user_name: 'a' },
        { ts: '1716364860.000002', text: 'duplicate', user: 'U2', user_name: 'a' },
        { ts: '1716284400.001', text: 'parent echoed', user: 'U1', user_name: 'tester' },
      ]),
      makeRj('another parent', [
        { ts: '1716365040.000003', text: 'reply', user: 'U3', user_name: 'b' },
      ]),
    ])).toEqual(['1716364860.000002', '1716365040.000003'])
  })
})

describe('validateClassification', () => {
  const base = {
    tags: ['issue'],
    priority: 'medium' as const,
    title: '점주앱 매출 미집계',
    body: '• 배경: 강릉점 매출 누락',
    author: '홍길동',
  }

  it('정상 입력은 정규화된 결과 반환', () => {
    const r = validateClassification(base, 'fallback')
    expect(r).not.toBeNull()
    expect(r!.title).toBe('점주앱 매출 미집계')
    expect(r!.author).toBe('홍길동')
    expect(r!.brand).toBeUndefined()
  })

  it('빈/공백 제목은 저장 차단(null)', () => {
    expect(validateClassification({ ...base, title: '   ' }, 'fb')).toBeNull()
  })

  it('빈/공백 본문은 저장 차단(null)', () => {
    expect(validateClassification({ ...base, body: '   ' }, 'fb')).toBeNull()
  })

  it('깨진 볼드 마크업 보정', () => {
    expect(validateClassification({ ...base, body: '앞 **안닫힘' }, 'fb')!.body).toBe('앞 안닫힘')
  })

  it('중복 태그 제거(순서 보존)', () => {
    expect(validateClassification({ ...base, tags: ['issue', 'issue', 'mention'] }, 'fb')!.tags)
      .toEqual(['issue', 'mention'])
  })

  it('제목을 60자로 자른다', () => {
    expect(validateClassification({ ...base, title: '가'.repeat(80) }, 'fb')!.title.length).toBe(60)
  })

  it('작성자가 비면 fallback 사용', () => {
    expect(validateClassification({ ...base, author: '  ' }, 'fallback작성자')!.author).toBe('fallback작성자')
  })

  it('brand 는 trim 후 비면 undefined, 값 있으면 trim', () => {
    expect(validateClassification({ ...base, brand: '  ' }, 'fb')!.brand).toBeUndefined()
    expect(validateClassification({ ...base, brand: ' 더리터 ' }, 'fb')!.brand).toBe('더리터')
  })

  it('마크업/불릿만 있고 알맹이 없는 제목은 차단', () => {
    expect(validateClassification({ ...base, title: '**' }, 'fb')).toBeNull()
    expect(validateClassification({ ...base, title: '•••' }, 'fb')).toBeNull()
  })

  it('불릿/공백만 있는 본문은 차단', () => {
    expect(validateClassification({ ...base, body: '• \n- \n•' }, 'fb')).toBeNull()
    expect(validateClassification({ ...base, body: '🙏' }, 'fb')).toBeNull()
  })
})

describe('hasMeaningfulContent', () => {
  it('한글·영문·숫자가 있으면 true', () => {
    expect(hasMeaningfulContent('• 강릉점 매출')).toBe(true)
    expect(hasMeaningfulContent('foo')).toBe(true)
    expect(hasMeaningfulContent('2026')).toBe(true)
  })
  it('마크업·불릿·구두점·이모지만이면 false', () => {
    expect(hasMeaningfulContent('**')).toBe(false)
    expect(hasMeaningfulContent('• - *')).toBe(false)
    expect(hasMeaningfulContent('...')).toBe(false)
    expect(hasMeaningfulContent('🙏👍')).toBe(false)
    expect(hasMeaningfulContent('   ')).toBe(false)
  })
})
