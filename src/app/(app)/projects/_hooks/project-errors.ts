export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : '오류가 발생했습니다.'
}

export function contextualErr(label: string, e: unknown): string {
  return `${label}: ${errMsg(e)}`
}
