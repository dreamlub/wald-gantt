import type { Priority } from '../_lib/types'

// severity → priority 매핑 (데일리 리포트 액션 아이템 공용)
export const SEV_TO_PRIORITY: Record<string, Priority> = { urgent: 'high', watch: 'medium', info: 'low' }

function renderBodyBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{part.replace(/\*/g, '')}</span>
  )
}

// 본문 텍스트를 문장 단위 불릿으로 렌더 (줄바꿈 + 문장부호 기준 분리, ** 볼드 지원)
export function BodyBullets({ text, className }: { text: string; className?: string }) {
  const sentences = text
    .split('\n')
    .map(l => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .flatMap(line => line.split(/(?<=[.!?])\s+/).filter(Boolean))

  return (
    <ul className={`flex flex-col gap-1 ${className ?? ''}`}>
      {sentences.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="mt-px5 w-1 h-1 rounded-full bg-ink-300 shrink-0" />
          <span>{renderBodyBold(s)}</span>
        </li>
      ))}
    </ul>
  )
}
