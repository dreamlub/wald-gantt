import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { date, content } = await req.json() as { date: string; content: string }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        send('status', { message: '요약 생성 중...' })

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: '주간보고를 팀별로 간결하게 요약하는 어시스턴트입니다. 각 팀의 핵심 진행사항, 완료 항목, 이슈/리스크를 2-3줄로 정리해주세요. 한국어로 답변하세요.',
          messages: [{
            role: 'user',
            content: `${date} 주간보고를 팀별로 요약해주세요.\n\n${content}`,
          }],
        })

        const text = (message.content[0] as { type: string; text: string }).text
        send('result', { summary: text })
      } catch (err) {
        console.error('[api/weekly/ai-summary]', err)
        send('error', { message: err instanceof Error ? err.message : '요약 실패' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
