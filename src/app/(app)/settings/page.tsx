import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
      <Settings size={32} className="text-gray-300" />
      <p className="text-sm font-medium">설정</p>
      <p className="text-xs">준비 중입니다.</p>
    </div>
  )
}
