import { createClient } from '@/lib/supabase/server'
import { ShareView } from './ShareView'
import type { GanttBoard, GanttCategory, GanttProject } from '@/types'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_shared_board', { p_token: token })

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <p className="text-gray-700 font-medium">유효하지 않은 링크입니다</p>
          <p className="text-sm text-gray-400">링크가 삭제되었거나 만료되었습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <ShareView
      board={data.board as GanttBoard}
      categories={(data.categories ?? []) as GanttCategory[]}
      projects={(data.projects ?? []) as GanttProject[]}
    />
  )
}
