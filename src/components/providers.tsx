'use client'

import dynamic from 'next/dynamic'

const ThemeProvider = dynamic(
  () => import('next-themes').then(m => ({ default: m.ThemeProvider })),
  { ssr: false }
)

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  )
}
