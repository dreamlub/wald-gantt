import { FileText } from 'lucide-react'

export default function WeeklyPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 툴바 */}
      <div className="h-10 border-b bg-white flex items-center px-4 shrink-0">
        <span className="text-sm font-semibold text-gray-700">주간보고</span>
      </div>

      {/* 플레이스홀더 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 bg-gray-50">
        <FileText size={40} strokeWidth={1.5} className="opacity-30" />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">주간보고 정리</p>
          <p className="text-xs mt-1 text-gray-400">이번 주 진행 사항을 자동으로 요약해주는 기능이 준비 중이에요</p>
        </div>
      </div>
    </div>
  )
}
