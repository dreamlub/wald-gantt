'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart2, CheckSquare, FileText, Clock, Settings, LogOut, BookOpen, CalendarDays, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/',          icon: Sparkles,     label: 'Home' },
  { href: '/projects',  icon: BarChart2,    label: 'Projects' },
  { href: '/tasks',     icon: CheckSquare,  label: 'Tasks' },
  { href: '/calendar',  icon: CalendarDays, label: 'Calendar' },
  { href: '/weekly',    icon: FileText,     label: 'Weekly' },
  { href: '/notes',     icon: BookOpen,     label: 'Notes' },
  { href: '/summary',   icon: Clock,        label: 'Summary' },
  { href: '/settings',  icon: Settings,     label: 'Settings' },
]

export function AppNav() {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className="shrink-0 flex flex-col bg-ink-900 text-white w-14">
      {/* 브랜드 */}
      <div className="h-12 flex items-center justify-center border-b border-white/10 shrink-0">
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
                  ? 'text-white bg-white/15'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon size={17} />
              <span className="text-4xs font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className="shrink-0 border-t border-white/10 mb-1">
        <button
          onClick={handleSignOut}
          title="로그아웃"
          className="flex flex-col items-center justify-center gap-1 w-full py-3 text-white/35 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut size={15} />
          <span className="text-4xs">나가기</span>
        </button>
      </div>
    </div>
  )
}
