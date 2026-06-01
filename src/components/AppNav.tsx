'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import {
  BarChart2, BarChart3, CheckSquare, Settings, LogOut,
  BookOpen, CalendarDays, PanelLeftClose, PanelLeftOpen, Inbox,
  LayoutDashboard, FolderKanban,
} from 'lucide-react'
import { SlackIcon } from '@/components/icons/SlackIcon'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/hooks/use-is-mobile'

/* ── 타입 ── */
interface NavChild {
  href: string
  label: string
}

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  short?: string          // 접힌 상태 약칭
  children?: NavChild[]   // 2-depth 대비 (현재 미사용)
}

/* ── 메뉴 정의 ── */
const navItems: NavItem[] = [
  { href: '/',         icon: LayoutDashboard, label: '홈',              short: '홈' },
  { href: '/projects', icon: FolderKanban,   label: '프로젝트 관리',   short: '프로젝트' },
  { href: '/tasks',    icon: CheckSquare,    label: '할일 관리',       short: '할일' },
  { href: '/calendar', icon: CalendarDays,   label: '업무시간 관리',   short: '업무시간' },
  { href: '/slack',    icon: SlackIcon,      label: '슬랙메시지 분석', short: '슬랙' },
  { href: '/weekly',   icon: BarChart2,      label: '주간보고 분석',   short: '주간보고' },
  { href: '/notes',    icon: BookOpen,       label: '메모장',          short: '메모장' },
  { href: '/review',   icon: Inbox,          label: '일감 판단',       short: '일감' },
  { href: '/stats',    icon: BarChart3,      label: '통계',            short: '통계' },
  { href: '/settings', icon: Settings,       label: '설정',            short: '설정' },
]

const STORAGE_KEY = 'nav-collapsed'
const NAV_COLLAPSE_EVENT = 'nav-collapsed-change'

/* ── 접힘 상태 외부 스토어 (localStorage 구독) ── */
function subscribeCollapsed(callback: () => void) {
  window.addEventListener(NAV_COLLAPSE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(NAV_COLLAPSE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}
function getCollapsedSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

/* ── 컴포넌트 ── */
export function AppNav() {
  const pathname = usePathname()
  const router   = useRouter()

  // SSR hydration mismatch 방지: 서버 스냅샷 false, 클라이언트에서 localStorage 반영
  const isMobile = useIsMobile()
  const collapsedPref = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false)
  const collapsed = isMobile || collapsedPref

  function toggleCollapsed() {
    localStorage.setItem(STORAGE_KEY, String(!getCollapsedSnapshot()))
    window.dispatchEvent(new Event(NAV_COLLAPSE_EVENT))
  }

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div
      className={`shrink-0 flex flex-col bg-ink-900 text-white transition-[width] duration-200 overflow-hidden ${
        collapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* 브랜드 헤더 + 토글 */}
      <div className="h-12 flex items-center gap-2 px-3 border-b border-white/10 shrink-0">
        <span className={`font-black text-white tracking-tight transition-all duration-200 ${
          collapsed ? 'text-sm' : 'flex-1 text-base'
        }`}>
          {collapsed ? 'W' : 'WALDLUST'}
        </span>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          className="shrink-0 p-1 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors sm:flex hidden"
        >
          {collapsed
            ? <PanelLeftOpen  size={14} />
            : <PanelLeftClose size={14} />
          }
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 flex flex-col pt-1.5 gap-0.5">
        {navItems.map(({ href, icon: Icon, label, short }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex transition-colors ${
                collapsed
                  ? 'flex-col items-center justify-center gap-1 py-2.5 w-full min-h-[44px]'
                  : 'flex-row items-center gap-3 h-9 px-3.5'
              } ${
                isActive
                  ? 'text-white bg-white/15'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {collapsed
                ? <span className="text-4xs font-medium">{short ?? label}</span>
                : <span className="text-sm font-medium truncate">{label}</span>
              }
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className="shrink-0 border-t border-white/10 py-1">
        <button
          onClick={handleSignOut}
          className={`flex w-full text-white/35 hover:text-white hover:bg-white/10 transition-colors ${
            collapsed
              ? 'flex-col items-center justify-center gap-1 py-2.5'
              : 'flex-row items-center gap-3 h-9 px-3.5'
          }`}
        >
          <LogOut size={15} className="shrink-0" />
          {collapsed
            ? <span className="text-4xs font-medium">나가기</span>
            : <span className="text-sm font-medium">로그아웃</span>
          }
        </button>
      </div>
    </div>
  )
}
