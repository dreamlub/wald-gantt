import { AppNav } from '@/components/AppNav'
import { ScrollToTopButton } from '@/components/ScrollToTopButton'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="h-screen flex overflow-hidden">
        <AppNav />
        <div className="flex-1 flex overflow-hidden min-w-0">
          {children}
        </div>
        <ScrollToTopButton />
      </div>
    </TooltipProvider>
  )
}
