import {
  PointerSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** 최소 5px 이동 후 드래그 활성화 (PointerSensor only) */
export function useDndSensorsPointer() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
}

/** 최소 5px 이동 후 드래그 활성화 (PointerSensor + KeyboardSensor) */
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/**
 * 리스트 내 아이템 재정렬 후 sort_order 업데이트 목록 반환.
 * 변경이 있는 항목만 포함.
 */
export function computeReorder<T extends { id: string; sort_order: number }>(
  items: T[],
  activeId: string,
  overId: string,
): { id: string; sort_order: number }[] {
  const oldIdx = items.findIndex(t => t.id === activeId)
  const newIdx = items.findIndex(t => t.id === overId)
  if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return []

  const reordered = [...items]
  const [moved] = reordered.splice(oldIdx, 1)
  reordered.splice(newIdx, 0, moved)

  return reordered
    .map((item, i) => ({ id: item.id, sort_order: i }))
    .filter(u => {
      const orig = items.find(t => t.id === u.id)
      return orig && orig.sort_order !== u.sort_order
    })
}

/**
 * 컨테이너(그룹) 맵에서 아이템이 속한 컨테이너 ID 탐색.
 * id 자체가 컨테이너 키이면 해당 키 반환.
 */
export function findContainer(
  items: Record<string, string[]>,
  id: string,
): string | undefined {
  if (id in items) return id
  for (const [containerId, ids] of Object.entries(items)) {
    if (ids.includes(id)) return containerId
  }
  return undefined
}
