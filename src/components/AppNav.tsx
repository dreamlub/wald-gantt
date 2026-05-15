'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart2, CheckSquare, FileText, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/',       icon: BarChart2,    label: '간트' },
  { href: '/tasks',  icon: CheckSquare,  label: '태스크' },
  { href: '/weekly',    icon: FileText,     label: '주간보고' },
  { href: '/settings',  icon: Settings,     label: '설정' },
]

export function AppNav() {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className="shrink-0 flex flex-col bg-gray-900 text-white" style={{ width: 56 }}>
      {/* 브랜드 */}
      <div className="h-12 flex items-center justify-center border-b border-gray-800 shrink-0">
        <span className="text-sm font-black text-white tracking-tight">W</span>
      </div>

      {/* 섹션 네비게이션 */}
      <nav className="flex-1 flex flex-col items-center pt-2 gap-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex flex-col items-center justify-center gap-1 w-full py-3 transition-colors ${
                isActive
                  ? 'text-white bg-gray-700'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <Icon size={17} />
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className="shrink-0 border-t border-gray-800 mb-1">
        <button
          onClick={handleSignOut}
          title="로그아웃"
          className="flex flex-col items-center justify-center gap-1 w-full py-3 text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <LogOut size={15} />
          <span className="text-[9px]">나가기</span>
        </button>
      </div>
    </div>
  )
}
