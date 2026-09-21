import type { Floor, PlannerDoc, PlannerObject, Pt } from './types'

/** Лестница — объект, который на своём этаже рисуется пунктиром, а на этажах выше — целиком */
export function isStairs(o: PlannerObject): boolean {
  return o.showNext === true || o.presetId.startsWith('stairs')
}

/** Точка-якорь лестницы на этаже (для центрирования вида при переходе между этажами) */
export function stairsAnchor(floor: Floor): Pt | null {
  for (const o of floor.objects) {
    if (isStairs(o)) return { x: o.x, y: o.y }
  }
  return null
}

/** Якорь для центровки: лестница на указанном этаже, иначе — на любом другом */
export function viewAnchor(doc: PlannerDoc, floorId: string): Pt | null {
  const idx = doc.floors.findIndex((f) => f.id === floorId)
  if (idx >= 0) {
    const a = stairsAnchor(doc.floors[idx])
    if (a) return a
  }
  for (const f of doc.floors) {
    const a = stairsAnchor(f)
    if (a) return a
  }
  return null
}

/** Центр комнаты (среднее вершин) — запасной якорь */
export function roomCenter(floor: Floor): Pt | null {
  if (!floor.room || floor.room.length < 3) return null
  let x = 0
  let y = 0
  for (const p of floor.room) {
    x += p.x
    y += p.y
  }
  return { x: x / floor.room.length, y: y / floor.room.length }
}
