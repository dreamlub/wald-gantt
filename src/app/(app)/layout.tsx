import { AppNav } from '@/components/AppNav'
import { ScrollToTopButton } from '@/components/ScrollToTopButton'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex overflow-hidden">
      <AppNav />
      <div className="flex-1 flex overflow-hidden min-w-0">
        {children}
      </div>
      <ScrollToTopButton />
    </div>
  )
}
