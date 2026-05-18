import { Suspense } from 'react'
import { CalendarShell } from './_components/calendar-shell'

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarShell />
    </Suspense>
  )
}
