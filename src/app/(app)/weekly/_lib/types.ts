export interface WeekSection {
  date: string    // "2026.05.12"
  isoDate: string // "2026-05-12"
  content: string // markdown content after the ## date header
}

export interface WeeklyDoc {
  title: string
  weeks: WeekSection[]
}

export interface WeeklyTeam {
  id: string
  label: string
  collection_id: string
  sort_order: number
}
