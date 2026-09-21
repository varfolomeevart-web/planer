import type { PlannerObject, Pt } from './types'

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** расстояние от точки до отрезка, см */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** ближайшая точка на отрезке к данной */
export function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return { x: a.x, y: a.y }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export function polygonPerimeter(pts: Pt[]): number {
  if (pts.length < 2) return 0
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    sum += dist(pts[i], pts[(i + 1) % pts.length])
  }
  return sum
}

/** площадь по формуле шнурования, см² */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function pointsBBox(pts: Pt[], pad = 0): BBox {
  if (pts.length === 0) return { minX: -pad, minY: -pad, maxX: pad, maxY: pad }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

export function rectCorners(r: { x: number; y: number; w: number; h: number; angle: number }): Pt[] {
  const rad = (r.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = r.w / 2
  const hh = r.h / 2
  const locals: Pt[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]
  return locals.map((p) => ({
    x: r.x + p.x * cos - p.y * sin,
    y: r.y + p.x * sin + p.y * cos,
  }))
}

export function objectCorners(o: PlannerObject): Pt[] {
  return rectCorners(o)
}

export function objectsBBox(objects: PlannerObject[], pad = 0): BBox {
  const corners = objects.flatMap((o) => objectCorners(o))
  if (corners.length === 0) return { minX: -pad, minY: -pad, maxX: pad, maxY: pad }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of corners) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

export function unionBBox(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b
  if (!b) return a
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function snapValue(v: number, step: number): number {
  return Math.round(v / step) * step
}

/** Привязка объекта к сетке по левому/верхнему краю габаритного прямоугольника */
export function snapObjectPos(o: { x: number; y: number; w: number; h: number }, step: number) {
  return {
    x: snapValue(o.x - o.w / 2, step) + o.w / 2,
    y: snapValue(o.y - o.h / 2, step) + o.h / 2,
  }
}

/** перевод точки из экранных координат в координаты плана (см) */
export function screenToPlan(px: number, py: number, view: { scale: number; ox: number; oy: number }): Pt {
  return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale }
}

/** проверка попадания точки в повернутый прямоугольник {x,y — центр} */
export function pointInRect(r: { x: number; y: number; w: number; h: number; angle: number }, p: Pt): boolean {
  const rad = (-r.angle * Math.PI) / 180
  const dx = p.x - r.x
  const dy = p.y - r.y
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
  return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2
}

/** проверка попадания точки в объект с учётом поворота */
export function pointInObject(o: PlannerObject, p: Pt): boolean {
  return pointInRect(o, p)
}

/** позиция поворотной ручки (в координатах плана, см) */
export function rotateHandlePos(o: PlannerObject, screenOffsetCm: number): Pt {
  const rad = (o.angle * Math.PI) / 180
  const r = o.h / 2 + screenOffsetCm
  return {
    x: o.x - Math.sin(rad) * r,
    y: o.y - Math.cos(rad) * r,
  }
}
