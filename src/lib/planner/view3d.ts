import type { Floor, LayerVis, PlannerObject, Pt } from './types'
import { isDoorWindowPreset, getPreset } from './presets'
import { objectCorners } from './geometry'

/**
 * 3D-визуализация помещения: аксонометрический рендер на Canvas 2D без зависимостей.
 * Пол — многоугольник комнаты с цоколем и досками, стены — вертикальные грани,
 * объекты собираются из профилей (столы на ножках, диваны со спинками, витрины со
 * стеклом, конфорки, мойки, цилиндры); у раздела «Клён» — высоты из каталога и
 * схема из каталога на верхней грани.
 */

export interface View3dState {
  /** азимут поворота, градусы */
  azimuth: number
  /** угол возвышения камеры, градусы (12..80) */
  elevation: number
  /** множитель масштаба */
  zoom: number
  /** передние стены: скрыть / полупрозрачные / все */
  walls: 'hide' | 'ghost' | 'all'
}

export const VIEW3D_DEFAULT: View3dState = { azimuth: -35, elevation: 35, zoom: 1, walls: 'hide' }

export const WALL_H = 270
const PART_H = 250
const SLAB_H = 12

const FLOOR_FILL = '#F6F0E4'
const FLOOR_EDGE = '#D8CBB6'
export const WALL_FILL = '#EFE6D6'
export const WALL_EDGE = '#B9A88C'
export const PART_FILL = '#E3D7C1'

/** Высоты объектов, см (по пресетам; «Клён» — из каталога) */
const PRESET_H: Record<string, number> = {
  sofa: 75, armchair: 80, coffee_table: 45, tv_stand: 50, bookshelf: 180, rug: 3,
  bed_double: 60, bed_single: 60, nightstand: 50, wardrobe: 220, dresser: 85, desk: 75,
  kitchen_set: 90, dining_table: 75, chair: 85, fridge: 200, stove: 85, sink_cab: 85,
  cafe_table2: 75, cafe_table4: 75, bar_counter: 110, coffee_machine: 40, cashbox: 90,
  display_fridge: 180, dishwasher: 85,
  stairs_straight: 170, stairs_l: 170,
  plant: 60, custom: 70,
  hood: 15, vent_channel: 30, vent_duct: 30, vent_grille: 5, vent_fan: 15, vent_valve: 10, ac_unit: 30,
  water_riser: 30, water_pipe: 15, sewer_pipe: 15, water_heater: 120, radiator: 60,
  heated_manifold: 40, towel_dryer: 120,
  socket: 10, socket_double: 10, switch: 10, lamp: 8, chandelier: 40, wall_lamp: 20,
  panel_el: 80, net_socket: 10, warm_floor: 2, motion_sensor: 8, cable_tray: 10,
  // Клён: высота из каталога (мм → см)
  klen_1: 85, klen_2: 29, klen_3: 33, klen_4: 33, klen_5: 18, klen_6: 13, klen_7: 32,
  klen_8: 26, klen_9: 58, klen_10: 133, klen_11: 196, klen_12: 84, klen_13: 68, klen_14: 87,
  klen_15: 85, klen_16: 37, klen_17: 33, klen_18: 87, klen_19: 47, klen_20: 26, klen_21: 83,
  klen_22: 52, klen_23: 41, klen_24: 192, klen_25: 85,
}

/** Объекты, висящие над полом (зонты вытяжные, люстры и т.п.), см от пола */
const PRESET_ZOFF: Record<string, number> = {
  klen_8: 190, klen_20: 190,
  chandelier: 220, lamp: 250, wall_lamp: 140, hood: 150,
}

/** Кэш картинок пресетов (SVG-схемы «Клён») для верхних граней */
const imgCache = new Map<string, HTMLImageElement>()

/** Догруженная картинка пресета (для рендера верхних граней) */
export function get3dImage(src: string): HTMLImageElement | null {
  const im = imgCache.get(src)
  return im && im.complete && im.naturalWidth > 0 ? im : null
}

/** Предзагрузка схем всех объектов этажа (вызвать до первого рендера) */
export function preload3dImages(floor: Floor): Promise<void> {
  const srcs = new Set<string>()
  for (const o of floor.objects) {
    if (!o.presetId.startsWith('klen_')) continue
    const img = getPreset(o.presetId).img
    if (img) srcs.add(img)
  }
  return Promise.all(
    [...srcs].map(
      (src) =>
        new Promise<void>((resolve) => {
          const cached = imgCache.get(src)
          if (cached && cached.complete && cached.naturalWidth > 0) return resolve()
          const im = new Image()
          im.onload = () => {
            imgCache.set(src, im)
            resolve()
          }
          im.onerror = () => resolve()
          im.src = src
        }),
    ),
  ).then(() => undefined)
}

// ---------- утилиты ----------

interface U3 {
  u: number
  v: number
  d: number
}

function shade(hex: string, f: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f))
  const b = Math.min(255, Math.round((n & 255) * f))
  return `rgb(${r},${g},${b})`
}

function shadeA(hex: string, f: number, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f))
  const b = Math.min(255, Math.round((n & 255) * f))
  return `rgba(${r},${g},${b},${a})`
}

function polyPath(ctx: CanvasRenderingContext2D, pts: U3[], s: number, ox: number, oy: number) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const x = ox + p.u * s
    const y = oy + p.v * s
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function fillPoly(
  ctx: CanvasRenderingContext2D,
  pts: U3[],
  s: number,
  ox: number,
  oy: number,
  fill: string,
  stroke?: string,
  lw = 1,
) {
  polyPath(ctx, pts, s, ox, oy)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}

/** выпуклая оболочка (для тени: след + смещённый след) */
export function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 4) return pts.slice()
  const sorted = pts.slice().sort((p, q) => (p.x === q.x ? p.y - q.y : p.x - q.x))
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// ---------- профили объектов ----------

/** Часть составного объекта: след в плане (мировые координаты) + высоты */
export interface Part {
  fp: Pt[]
  z0: number
  z1: number
  color: string
  /** полупрозрачная часть (стекло витрин) */
  alpha?: number
  /** SVG-схема из каталога на верхней грани (раздел «Клён») */
  img?: { src: string }
  /** горизонтальные линии на боковых гранях, доли высоты (полки, швы ящиков) */
  shelfLines?: number[]
  /** вертикальные линии на боковых гранях, доли ширины (дверцы, секции) */
  vSeams?: number[]
  /** другой цвет верхней грани (столешница) */
  topFill?: string
  /** залитые многоугольники на крышке (чаши, ванны) */
  topPolys?: { pts: Pt[]; color: string }[]
  /** контуры на крышке (борта, крышки) */
  topStrokes?: { pts: Pt[]; color: string; w?: number }[]
  /** круги на крышке (конфорки, мойки) */
  circles?: { c: Pt; r: number; color: string }[]
}

const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

/** 20-угольник — окружность радиуса r в плане (цилиндры, кастрюли) */
function discPts(L: (x: number, y: number) => Pt, cx: number, cy: number, r: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    pts.push(L(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
  }
  return pts
}

/**
 * Сборка объекта из объёмных частей. Локальные координаты: x — ширина (вправо),
 * y — глубина (вниз плана); спинки/изголовья — у дальнего края y = -h/2
 * (как в 2D-схемах). Отзеркаливание (o.flip) применяется к локальной оси x.
 */
/** Сборка объекта из объёмных частей (экспортируется для перспективного рендера) */
export function objectParts(o: PlannerObject): Part[] {
  const preset = getPreset(o.presetId)
  const color = o.color || preset.color
  const w = o.w
  const d = o.h
  const h = PRESET_H[o.presetId] ?? 60
  const zBase = PRESET_ZOFF[o.presetId] ?? 0
  const hw = w / 2
  const hh = d / 2
  const min = Math.min(w, d)
  const rad = (o.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const fx = o.flip ? -1 : 1
  const L = (x: number, y: number): Pt => ({
    x: o.x + x * fx * cos - y * sin,
    y: o.y + x * fx * sin + y * cos,
  })
  const rect = (x1: number, y1: number, x2: number, y2: number): Pt[] => [L(x1, y1), L(x2, y1), L(x2, y2), L(x1, y2)]
  const box = (fp: Pt[], za: number, zb: number, extra?: Partial<Part>): Part => ({
    fp,
    z0: zBase + za,
    z1: zBase + zb,
    color,
    ...extra,
  })
  const parts: Part[] = []
  const name = preset.name || ''
  const isKlen = o.presetId.startsWith('klen_')
  const imgSrc = isKlen && preset.img ? preset.img : undefined
  const withImg = (p: Part): Part => {
    if (imgSrc) p.img = { src: imgSrc }
    return p
  }

  // ----- раздел «Клён»: профиль по названию позиции каталога -----
  if (isKlen) {
    if (/зонт вытяжной/i.test(name)) {
      // усечённый зонт: тело + верхний воздуховод
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h * 0.6))
      const k = 0.34
      parts.push(box(rect(-hw * (1 - k), -hh * (1 - k), hw * (1 - k), hh * (1 - k)), h * 0.6, h))
    } else if (/стол|ванна моечная/i.test(name)) {
      // столы на ножках (включая моечные ванны): ножки + промежуточная полка + крышка
      const t = 6
      const leg = 5
      const ins = 7
      for (const [sx, sy] of CORNERS) {
        const lx1 = sx < 0 ? -hw + ins : hw - ins - leg
        const ly1 = sy < 0 ? -hh + ins : hh - ins - leg
        parts.push(box(rect(lx1, ly1, lx1 + leg, ly1 + leg), 0, h - t))
      }
      parts.push(box(rect(-hw + ins, -hh + ins, hw - ins, hh - ins), (h - t) * 0.32, (h - t) * 0.32 + 3))
      parts.push(withImg(box(rect(-hw, -hh, hw, hh), h - t, h)))
    } else if (/рукомойник/i.test(name)) {
      // тумба-пьедестал + чаша + смеситель
      parts.push(box(rect(-hw * 0.34, -hh * 0.34, hw * 0.34, hh * 0.34), 0, h - 14))
      parts.push(withImg(box(rect(-hw, -hh, hw, hh), h - 14, h)))
      parts.push(box(rect(-2.5, -hh - 3, 2.5, -hh + 5), h, h + 13, { color: '#9AA3AA' }))
    } else if (/витрина/i.test(name)) {
      // основание + стеклянный колпак + крышка
      const baseH = h <= 40 ? Math.max(4, h * 0.16) : 16
      const topH = h <= 40 ? 3 : 9
      parts.push(box(rect(-hw, -hh, hw, hh), 0, baseH))
      const glass = box(rect(-hw + 1.5, -hh + 1.5, hw - 1.5, hh - 1.5), baseH, h - topH, {
        color: '#D9E8EE',
        alpha: 0.55,
      })
      if (h > 40) glass.vSeams = [0.38, 0.66]
      parts.push(glass)
      parts.push(withImg(box(rect(-hw, -hh, hw, hh), h - topH, h, { color: '#EFECE5' })))
    } else if (/сковорода/i.test(name)) {
      // круглая сковорода-вок с ручкой
      parts.push(withImg(box(discPts(L, 0, 0, min / 2), 0, h)))
      parts.push(box(rect(hw - 4, -3, hw + 15, 3), 0, h, { color: '#4A443E' }))
    } else if (/термос/i.test(name)) {
      parts.push(withImg(box(discPts(L, 0, 0, min / 2), 0, h)))
    } else if (/кофемолка/i.test(name)) {
      parts.push(withImg(box(rect(-hw, -hh, hw, hh), 0, h)))
      parts.push(box(discPts(L, 0, 0, min * 0.3), h, h + 9, { color: '#4A443E' }))
    } else {
      parts.push(withImg(box(rect(-hw, -hh, hw, hh), 0, h)))
    }
    return parts
  }

  // ----- мебель и оборудование -----
  switch (o.presetId) {
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(17, w * 0.14)
      const back = Math.min(22, d * 0.3)
      const seatTop = h * 0.6
      parts.push(box(rect(-hw, -hh, hw, hh), 0, Math.min(12, h * 0.18)))
      parts.push(box(rect(-hw, -hh, hw, -hh + back), 0, h))
      parts.push(box(rect(-hw, -hh + back, -hw + arm, hh), 0, h * 0.8))
      parts.push(box(rect(hw - arm, -hh + back, hw, hh), 0, h * 0.8))
      if (w - 2 * arm > 50) {
        parts.push(box(rect(-hw + arm, -hh + back, -1, hh - 1), Math.min(12, h * 0.18), seatTop))
        parts.push(box(rect(1, -hh + back, hw - arm, hh - 1), Math.min(12, h * 0.18), seatTop))
      } else {
        parts.push(box(rect(-hw + arm, -hh + back, hw - arm, hh - 1), Math.min(12, h * 0.18), seatTop))
      }
      break
    }
    case 'bed_double':
    case 'bed_single': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, 20))
      parts.push(box(rect(-hw + 5, -hh + 5, hw - 5, hh - 5), 20, 50, { color: '#F7F2E7' }))
      parts.push(box(rect(-hw, -hh, hw, -hh + 8), 0, h + 25, { color: shade(color, 0.86) }))
      const pw = o.presetId === 'bed_double' ? (w - 34) / 2 : w - 24
      if (o.presetId === 'bed_double') {
        parts.push(box(rect(-hw + 12, -hh + 12, -hw + 12 + pw, -hh + 40), 50, 62, { color: '#FCFAF3' }))
        parts.push(box(rect(hw - 12 - pw, -hh + 12, hw - 12, -hh + 40), 50, 62, { color: '#FCFAF3' }))
      } else {
        parts.push(box(rect(-hw + 12, -hh + 12, hw - 12, -hh + 40), 50, 62, { color: '#FCFAF3' }))
      }
      parts.push(box(rect(-hw + 3, -hh + 52, hw - 3, hh - 2), 20, 55, { color: shade(color, 0.85) }))
      break
    }
    case 'dining_table':
    case 'desk':
    case 'coffee_table':
    case 'cafe_table2':
    case 'cafe_table4': {
      const t = o.presetId === 'coffee_table' ? 5 : 4
      const leg = o.presetId === 'coffee_table' ? 5 : 6
      const ins = Math.max(5, Math.min(9, min * 0.12))
      for (const [sx, sy] of CORNERS) {
        const lx1 = sx < 0 ? -hw + ins : hw - ins - leg
        const ly1 = sy < 0 ? -hh + ins : hh - ins - leg
        parts.push(box(rect(lx1, ly1, lx1 + leg, ly1 + leg), 0, h - t))
      }
      parts.push(box(rect(-hw, -hh, hw, hh), h - t, h))
      break
    }
    case 'chair': {
      const seatH = h * 0.52
      const leg = 4
      for (const [sx, sy] of CORNERS) {
        const lx1 = sx < 0 ? -hw + 2 : hw - 2 - leg
        const ly1 = sy < 0 ? -hh + 2 : hh - 2 - leg
        parts.push(box(rect(lx1, ly1, lx1 + leg, ly1 + leg), 0, seatH))
      }
      parts.push(box(rect(-hw, -hh, hw, hh), seatH, seatH + 5))
      parts.push(box(rect(-hw + 3, -hh, hw - 3, -hh + 7), seatH + 5, h))
      break
    }
    case 'wardrobe':
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h, { vSeams: [0.5] }))
      break
    case 'bookshelf': {
      const n = Math.max(2, Math.round(w / 30))
      const seams: number[] = []
      for (let i = 1; i < n; i++) seams.push(i / n)
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h, { vSeams: seams }))
      break
    }
    case 'dresser':
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h, { shelfLines: [1 / 3, 2 / 3] }))
      break
    case 'nightstand':
    case 'cashbox':
    case 'coffee_machine':
    case 'dishwasher':
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h))
      break
    case 'tv_stand': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h))
      parts.push(box(rect(-w * 0.42, -hh + 4, w * 0.42, -hh + 10), h, h + 62, { color: '#3B3733' }))
      break
    }
    case 'kitchen_set': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h - 4))
      const top = box(rect(-hw - 2, -hh - 2, hw + 2, hh + 2), h - 4, h, { color: '#CFC7B9' })
      const rSink = Math.min(22, d * 0.32)
      const rB = Math.min(10, d * 0.16)
      const cx = hw - w * 0.12
      top.circles = [
        { c: L(-hw + w * 0.2, 0), r: rSink, color: '#B9C6CD' },
        { c: L(cx - rB - 4, -d * 0.22), r: rB, color: '#4A443E' },
        { c: L(cx + rB + 4, -d * 0.22), r: rB, color: '#4A443E' },
        { c: L(cx - rB - 4, d * 0.22), r: rB, color: '#4A443E' },
        { c: L(cx + rB + 4, d * 0.22), r: rB, color: '#4A443E' },
      ]
      parts.push(top)
      break
    }
    case 'fridge':
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h, { shelfLines: [0.2] }))
      break
    case 'stove': {
      const body = box(rect(-hw, -hh, hw, hh), 0, h)
      const r = min * 0.18
      body.circles = [
        { c: L(-w * 0.22, -d * 0.22), r, color: '#57504A' },
        { c: L(w * 0.22, -d * 0.22), r, color: '#57504A' },
        { c: L(-w * 0.22, d * 0.22), r, color: '#57504A' },
        { c: L(w * 0.22, d * 0.22), r, color: '#57504A' },
      ]
      parts.push(body)
      break
    }
    case 'sink_cab': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h))
      parts[0].circles = [{ c: L(0, 0), r: min * 0.3, color: '#AEBDC6' }]
      parts.push(box(rect(-2.5, -min * 0.18 - 2.5, 2.5, -min * 0.18 + 2.5), h, h + 14, { color: '#8E979D' }))
      break
    }
    case 'bar_counter': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h - 4))
      parts.push(box(rect(-hw - 3, -hh - 3, hw + 3, hh + 3), h - 4, h, { color: shade(color, 0.85) }))
      break
    }
    case 'display_fridge': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, 16))
      const glass = box(rect(-hw + 2, -hh + 2, hw - 2, hh - 2), 16, h - 12, { color: '#D8E7ED', alpha: 0.5 })
      glass.vSeams = [0.38, 0.66]
      parts.push(glass)
      parts.push(box(rect(-hw, -hh, hw, hh), h - 12, h, { color: '#EFECE5' }))
      break
    }
    case 'rug': {
      const p = box(rect(-hw, -hh, hw, hh), 0, 3)
      p.topStrokes = [{ pts: rect(-hw + 12, -hh + 12, hw - 12, hh - 12), color: shade(color, 0.78), w: 2 }]
      parts.push(p)
      break
    }
    case 'stairs_straight':
    case 'stairs_l': {
      const steps = 7
      for (let i = 0; i < steps; i++) {
        const y1 = -hh + (d / steps) * i
        const y2 = -hh + (d / steps) * (i + 1)
        // подъём к дальнему краю (как стрелка на 2D-схеме)
        parts.push(box(rect(-hw, y1, hw, y2), 0, (h * (steps - i)) / steps))
      }
      break
    }
    case 'plant': {
      parts.push(box(rect(-hw + 7, -hh + 7, hw - 7, hh - 7), 0, 20, { color: '#A57C5B' }))
      parts.push(box(discPts(L, 0, 0, 3.5), 18, 26, { color: '#6E543F' }))
      parts.push(box(discPts(L, 0, 0, min * 0.48), 22, 36, { color: '#93B27E' }))
      parts.push(box(discPts(L, 2, -2, min * 0.38), 34, 47, { color: '#87A873' }))
      parts.push(box(discPts(L, -1, 2, min * 0.26), 45, 56, { color: '#7C9C68' }))
      break
    }
    case 'chandelier': {
      parts.push(box(discPts(L, 0, 0, 2.5), 0, h * 0.55))
      parts.push(box(discPts(L, 0, 0, Math.min(30, min / 2)), h * 0.55, h, { color: '#E4C078' }))
      break
    }
    case 'lamp':
      parts.push(box(discPts(L, 0, 0, min / 2), 0, h))
      break
    case 'hood': {
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h * 0.7))
      const k = 0.4
      parts.push(box(rect(-hw * (1 - k), -hh * (1 - k), hw * (1 - k), hh * (1 - k)), h * 0.7, h))
      break
    }
    case 'water_heater':
    case 'water_riser':
      parts.push(box(discPts(L, 0, 0, min / 2), 0, h))
      break
    default:
      parts.push(box(rect(-hw, -hh, hw, hh), 0, h))
      break
  }
  return parts
}

// ---------- рендер сцены ----------

/**
 * Рендер 3D-вида этажа. Канвас уже приведён к devicePixelRatio компонентом
 * (dpr — для правильной толщины линий).
 */
export function render3d(canvas: HTMLCanvasElement, floor: Floor, st: View3dState, dpr = 1) {
  const ctx0 = canvas.getContext('2d')
  if (!ctx0) return
  const ctx: CanvasRenderingContext2D = ctx0
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const hasRoom = !!floor.room && floor.room.length >= 3
  const objects = floor.objects.filter((o) => !isDoorWindowPreset(o.presetId))
  const built: { o: PlannerObject; parts: Part[] }[] = []
  for (const o of objects) built.push({ o, parts: objectParts(o) })
  if (!hasRoom && built.length === 0) return

  const az = (st.azimuth * Math.PI) / 180
  const el = (st.elevation * Math.PI) / 180
  const cosA = Math.cos(az)
  const sinA = Math.sin(az)
  const cosE = Math.cos(el)
  const sinE = Math.sin(el)
  /** направление на камеру в плане */
  const toCam: Pt = { x: sinA, y: cosA }
  // свет слева-сверху
  const lightLen = Math.hypot(-0.45, -0.89)
  const light: Pt = { x: -0.45 / lightLen, y: -0.89 / lightLen }
  // направление падения тени в плане (от источника света)
  const shLen = Math.hypot(0.42, 0.91)
  const shadowDir: Pt = { x: 0.42 / shLen, y: 0.91 / shLen }

  const proj = (x: number, y: number, z: number): U3 => ({
    u: x * cosA - y * sinA,
    v: (x * sinA + y * cosA) * cosE - z * sinE,
    d: x * sinA + y * cosA,
  })

  const lw = (v: number) => Math.max(1, v * dpr)

  // ---------- полигон пола в плане ----------
  const floorPlan: Pt[] = []
  if (hasRoom && floor.room) {
    for (const p of floor.room) floorPlan.push(p)
  } else {
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const b of built) {
      for (const part of b.parts) {
        for (const p of part.fp) {
          if (p.x < x1) x1 = p.x
          if (p.x > x2) x2 = p.x
          if (p.y < y1) y1 = p.y
          if (p.y > y2) y2 = p.y
        }
      }
    }
    if (!Number.isFinite(x1)) return
    const pad = 60
    floorPlan.push({ x: x1 - pad, y: y1 - pad }, { x: x2 + pad, y: y1 - pad }, { x: x2 + pad, y: y2 + pad }, { x: x1 - pad, y: y2 + pad })
  }

  // ---------- вписывание ----------
  const fitPts: U3[] = []
  for (const p of floorPlan) {
    fitPts.push(proj(p.x, p.y, -SLAB_H))
    fitPts.push(proj(p.x, p.y, hasRoom ? WALL_H : 0))
  }
  for (const b of built) {
    for (const part of b.parts) {
      for (const p of part.fp) {
        fitPts.push(proj(p.x, p.y, part.z0))
        fitPts.push(proj(p.x, p.y, part.z1))
      }
    }
  }
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of fitPts) {
    if (p.u < minU) minU = p.u
    if (p.u > maxU) maxU = p.u
    if (p.v < minV) minV = p.v
    if (p.v > maxV) maxV = p.v
  }
  const bw = Math.max(1, maxU - minU)
  const bh = Math.max(1, maxV - minV)
  const s = Math.min((W * 0.8) / bw, (H * 0.8) / bh) * st.zoom
  const ox = W / 2 - ((minU + maxU) / 2) * s
  const oy = H / 2 - ((minV + maxV) / 2) * s

  // ---------- фон ----------
  const bg = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.18, W / 2, H * 0.42, Math.max(W, H) * 0.75)
  bg.addColorStop(0, '#3A342C')
  bg.addColorStop(1, '#241F1B')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // ---------- цоколь (плита пола) ----------
  for (let i = 0; i < floorPlan.length; i++) {
    const a = floorPlan[i]
    const b = floorPlan[(i + 1) % floorPlan.length]
    fillPoly(
      ctx,
      [proj(a.x, a.y, -SLAB_H), proj(b.x, b.y, -SLAB_H), proj(b.x, b.y, 0), proj(a.x, a.y, 0)],
      s,
      ox,
      oy,
      shade(FLOOR_EDGE, 0.9),
      FLOOR_EDGE,
      lw(0.8),
    )
  }

  // ---------- пол ----------
  const floorPoly = floorPlan.map((p) => proj(p.x, p.y, 0))
  fillPoly(ctx, floorPoly, s, ox, oy, FLOOR_FILL, FLOOR_EDGE, lw(1))

  // ---------- доски пола ----------
  let px1 = Infinity
  let py1 = Infinity
  let px2 = -Infinity
  let py2 = -Infinity
  for (const p of floorPlan) {
    if (p.x < px1) px1 = p.x
    if (p.x > px2) px2 = p.x
    if (p.y < py1) py1 = p.y
    if (p.y > py2) py2 = p.y
  }
  ctx.save()
  polyPath(ctx, floorPoly, s, ox, oy)
  ctx.clip()
  ctx.strokeStyle = 'rgba(173,156,128,0.38)'
  ctx.lineWidth = lw(0.7)
  ctx.beginPath()
  const step = 45
  if (px2 - px1 >= py2 - py1) {
    for (let y = Math.ceil(py1 / step) * step; y <= py2; y += step) {
      const p1 = proj(px1, y, 0.4)
      const p2 = proj(px2, y, 0.4)
      ctx.moveTo(ox + p1.u * s, oy + p1.v * s)
      ctx.lineTo(ox + p2.u * s, oy + p2.v * s)
    }
  } else {
    for (let x = Math.ceil(px1 / step) * step; x <= px2; x += step) {
      const p1 = proj(x, py1, 0.4)
      const p2 = proj(x, py2, 0.4)
      ctx.moveTo(ox + p1.u * s, oy + p1.v * s)
      ctx.lineTo(ox + p2.u * s, oy + p2.v * s)
    }
  }
  ctx.stroke()
  ctx.restore()

  // ---------- центр сцены для внешних нормалей ----------
  let cx0 = 0
  let cy0 = 0
  for (const p of floorPlan) {
    cx0 += p.x
    cy0 += p.y
  }
  cx0 /= floorPlan.length
  cy0 /= floorPlan.length

  function nearSide(a: Pt, b: Pt): boolean {
    // сегмент на стороне камеры от центра сцены → ближняя стена (устойчиво для перегородок через центр)
    const mx = (a.x + b.x) / 2 - cx0
    const my = (a.y + b.y) / 2 - cy0
    return mx * toCam.x + my * toCam.y > 1
  }

  // ---------- стены и перегородки ----------
  interface WallFace {
    pts: U3[]
    depth: number
    fillFar: string
    fillNear: string
    stroke: string
  }
  const farFaces: WallFace[] = []
  const nearFaces: WallFace[] = []

  if (hasRoom && floor.room) {
    const room = floor.room
    for (let i = 0; i < room.length; i++) {
      const a = room[i]
      const b = room[(i + 1) % room.length]
      const near = nearSide(a, b)
      const ed = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const lam = Math.abs((-(b.y - a.y) / ed) * light.x + ((b.x - a.x) / ed) * light.y)
      const pts = [proj(a.x, a.y, 0), proj(b.x, b.y, 0), proj(b.x, b.y, WALL_H), proj(a.x, a.y, WALL_H)]
      const depth = (a.x * sinA + a.y * cosA + b.x * sinA + b.y * cosA) / 2
      const face: WallFace = {
        pts,
        depth,
        fillFar: shade(WALL_FILL, 0.84 + 0.1 * lam),
        fillNear: shade(WALL_FILL, 0.74 + 0.06 * lam),
        stroke: WALL_EDGE,
      }
      if (near) nearFaces.push(face)
      else farFaces.push(face)
    }
  }

  for (const part of floor.partitions) {
    for (let i = 0; i + 1 < part.pts.length; i++) {
      const a = part.pts[i]
      const b = part.pts[i + 1]
      const near = nearSide(a, b)
      const pts = [proj(a.x, a.y, 0), proj(b.x, b.y, 0), proj(b.x, b.y, PART_H), proj(a.x, a.y, PART_H)]
      const depth = (a.x * sinA + a.y * cosA + b.x * sinA + b.y * cosA) / 2
      const face: WallFace = {
        pts,
        depth,
        fillFar: shade(PART_FILL, 0.94),
        fillNear: shade(PART_FILL, 0.82),
        stroke: '#C4B394',
      }
      if (near) nearFaces.push(face)
      else farFaces.push(face)
    }
  }

  farFaces.sort((f1, f2) => f1.depth - f2.depth)
  for (const f of farFaces) fillPoly(ctx, f.pts, s, ox, oy, f.fillFar, f.stroke, lw(0.8))

  // верхние рёбра дальних стен комнаты
  if (hasRoom && floor.room) {
    const room = floor.room
    ctx.strokeStyle = '#8F7F63'
    ctx.lineWidth = lw(1.1)
    ctx.beginPath()
    for (let i = 0; i < room.length; i++) {
      const a = room[i]
      const b = room[(i + 1) % room.length]
      if (nearSide(a, b)) continue
      const p1 = proj(a.x, a.y, WALL_H)
      const p2 = proj(b.x, b.y, WALL_H)
      ctx.moveTo(ox + p1.u * s, oy + p1.v * s)
      ctx.lineTo(ox + p2.u * s, oy + p2.v * s)
    }
    ctx.stroke()
  }

  // ---------- тени (в мировых координатах, обрезаны по полу) ----------
  ctx.save()
  polyPath(ctx, floorPoly, s, ox, oy)
  ctx.clip()
  for (const b of built) {
    let zmax = 0
    for (const part of b.parts) zmax = Math.max(zmax, part.z1)
    const fp = objectCorners(b.o)
    // контактное затемнение под объектом
    fillPoly(
      ctx,
      fp.map((p) => proj(p.x, p.y, 0.4)),
      s,
      ox,
      oy,
      'rgba(40,34,28,0.07)',
    )
    if (zmax < 8) continue
    const off = { x: shadowDir.x * zmax * 0.28, y: shadowDir.y * zmax * 0.28 }
    const hull = convexHull([...fp, ...fp.map((p) => ({ x: p.x + off.x, y: p.y + off.y }))])
    fillPoly(
      ctx,
      hull.map((p) => proj(p.x, p.y, 0.3)),
      s,
      ox,
      oy,
      'rgba(40,34,28,0.13)',
    )
  }
  ctx.restore()

  // ---------- объекты: сортировка по глубине от дальних к ближним ----------
  interface BoxItem {
    depth: number
    draw: () => void
  }
  const items: BoxItem[] = []

  function drawPart(part: Part) {
    const P = part.fp.map((p) => ({ a: proj(p.x, p.y, part.z0), b: proj(p.x, p.y, part.z1) }))
    let ccx = 0
    let ccy = 0
    for (const p of part.fp) {
      ccx += p.x
      ccy += p.y
    }
    ccx /= part.fp.length
    ccy /= part.fp.length
    ctx.globalAlpha = part.alpha ?? 1
    const edgeCol = shadeA(part.color, 0.52, 0.5)

    // видимые боковые грани
    for (let i = 0; i < part.fp.length; i++) {
      const a = part.fp[i]
      const b = part.fp[(i + 1) % part.fp.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      let nx = -dy / len
      let ny = dx / len
      const mx = (a.x + b.x) / 2 - ccx
      const my = (a.y + b.y) / 2 - ccy
      if (nx * mx + ny * my < 0) {
        nx = -nx
        ny = -ny
      }
      if (nx * toCam.x + ny * toCam.y <= 0) continue
      const j = (i + 1) % part.fp.length
      const bright = 0.62 + 0.32 * Math.max(0, nx * light.x + ny * light.y)
      fillPoly(ctx, [P[i].a, P[j].a, P[j].b, P[i].b], s, ox, oy, shade(part.color, bright), edgeCol, lw(0.8))
      if (part.shelfLines) {
        ctx.strokeStyle = shadeA(part.color, 0.45, 0.7)
        ctx.lineWidth = lw(0.8)
        ctx.beginPath()
        for (const t of part.shelfLines) {
          const z = part.z0 + (part.z1 - part.z0) * t
          const p1 = proj(a.x, a.y, z)
          const p2 = proj(b.x, b.y, z)
          ctx.moveTo(ox + p1.u * s, oy + p1.v * s)
          ctx.lineTo(ox + p2.u * s, oy + p2.v * s)
        }
        ctx.stroke()
      }
      if (part.vSeams) {
        ctx.strokeStyle = shadeA(part.color, 0.45, 0.7)
        ctx.lineWidth = lw(0.8)
        ctx.beginPath()
        for (const f of part.vSeams) {
          const px = a.x + (b.x - a.x) * f
          const py = a.y + (b.y - a.y) * f
          const p1 = proj(px, py, part.z0)
          const p2 = proj(px, py, part.z1)
          ctx.moveTo(ox + p1.u * s, oy + p1.v * s)
          ctx.lineTo(ox + p2.u * s, oy + p2.v * s)
        }
        ctx.stroke()
      }
    }

    // верхняя грань
    const top = P.map((p) => p.b)
    fillPoly(ctx, top, s, ox, oy, shade(part.topFill || part.color, 1.07), edgeCol, lw(0.9))

    // схема из каталога на верхней грани (аффинное отображение)
    if (part.img && part.fp.length === 4) {
      const cached = imgCache.get(part.img.src)
      if (cached && cached.complete && cached.naturalWidth > 0) {
        const p0 = top[0]
        const pu = top[1]
        const pv = top[3]
        const iw = cached.naturalWidth
        const ih = cached.naturalHeight
        ctx.save()
        polyPath(ctx, top, s, ox, oy)
        ctx.clip()
        ctx.transform(
          (ox + pu.u * s - (ox + p0.u * s)) / iw,
          (oy + pu.v * s - (oy + p0.v * s)) / iw,
          (ox + pv.u * s - (ox + p0.u * s)) / ih,
          (oy + pv.v * s - (oy + p0.v * s)) / ih,
          ox + p0.u * s,
          oy + p0.v * s,
        )
        ctx.drawImage(cached, 0, 0)
        ctx.restore()
      }
    }

    if (part.topPolys) {
      for (const tp of part.topPolys) {
        fillPoly(
          ctx,
          tp.pts.map((p) => proj(p.x, p.y, part.z1 + 0.3)),
          s,
          ox,
          oy,
          tp.color,
        )
      }
    }
    if (part.topStrokes) {
      for (const ts of part.topStrokes) {
        polyPath(
          ctx,
          ts.pts.map((p) => proj(p.x, p.y, part.z1 + 0.3)),
          s,
          ox,
          oy,
        )
        ctx.strokeStyle = ts.color
        ctx.lineWidth = lw(ts.w ?? 1)
        ctx.stroke()
      }
    }
    if (part.circles) {
      for (const c of part.circles) {
        const ring: U3[] = []
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2
          ring.push(proj(c.c.x + Math.cos(a) * c.r, c.c.y + Math.sin(a) * c.r, part.z1 + 0.35))
        }
        fillPoly(ctx, ring, s, ox, oy, c.color)
      }
    }
    ctx.globalAlpha = 1
  }

  for (const b of built) {
    for (const part of b.parts) {
      let sum = 0
      for (const p of part.fp) sum += p.x * sinA + p.y * cosA
      items.push({ depth: sum / part.fp.length, draw: () => drawPart(part) })
    }
  }
  items.sort((b1, b2) => b1.depth - b2.depth)
  for (const it of items) it.draw()

  // ---------- ближние стены и перегородки ----------
  if (st.walls !== 'hide' && nearFaces.length) {
    nearFaces.sort((f1, f2) => f1.depth - f2.depth)
    for (const f of nearFaces) {
      if (st.walls === 'ghost') {
        polyPath(ctx, f.pts, s, ox, oy)
        ctx.fillStyle = 'rgba(239,230,214,0.22)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(185,168,140,0.6)'
        ctx.lineWidth = lw(0.8)
        ctx.stroke()
      } else {
        fillPoly(ctx, f.pts, s, ox, oy, f.fillNear, f.stroke, lw(0.8))
      }
    }
  }
}

// ---------- сборка сцены (общая для аксонометрии и снимка с камеры) ----------

/** Отрезок вертикальной стены для 3D-рендеров */
export interface WallSeg {
  a: Pt
  b: Pt
  /** высота, см */
  h: number
  fill: string
  stroke: string
  kind: 'wall' | 'partition'
}

export interface Scene3d {
  /** полигон пола (комната или fallback-прямоугольник вокруг объектов) */
  floorPlan: Pt[]
  walls: WallSeg[]
  /** объекты с собранными объёмными частями */
  objectsParts: { o: PlannerObject; parts: Part[] }[]
  /** центр сцены (для определения внутренних нормалей) */
  center: Pt
  hasRoom: boolean
}

/**
 * Сборка геометрии этажа для 3D-рендера: пол, стены, перегородки и объекты.
 * layers — фильтр видимости инженерных слоёв (undefined — показывать всё).
 */
export function buildScene(floor: Floor, layers?: LayerVis): Scene3d {
  const hasRoom = !!floor.room && floor.room.length >= 3
  const objects = floor.objects.filter(
    (o) => !isDoorWindowPreset(o.presetId) && (!layers || layers[o.layer ?? 'furniture']),
  )
  const objectsParts = objects.map((o) => ({ o, parts: objectParts(o) }))
  const walls: WallSeg[] = []

  if (hasRoom && floor.room) {
    const room = floor.room
    for (let i = 0; i < room.length; i++) {
      walls.push({ a: room[i], b: room[(i + 1) % room.length], h: WALL_H, fill: WALL_FILL, stroke: WALL_EDGE, kind: 'wall' })
    }
  }
  for (const part of floor.partitions) {
    for (let i = 0; i + 1 < part.pts.length; i++) {
      walls.push({ a: part.pts[i], b: part.pts[i + 1], h: PART_H, fill: PART_FILL, stroke: '#C4B394', kind: 'partition' })
    }
  }

  let floorPlan: Pt[]
  if (hasRoom && floor.room) {
    floorPlan = floor.room.slice()
  } else {
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const b of objectsParts) {
      for (const part of b.parts) {
        for (const p of part.fp) {
          if (p.x < x1) x1 = p.x
          if (p.x > x2) x2 = p.x
          if (p.y < y1) y1 = p.y
          if (p.y > y2) y2 = p.y
        }
      }
    }
    if (!Number.isFinite(x1)) {
      x1 = 0
      y1 = 0
      x2 = 600
      y2 = 500
    }
    const pad = 60
    floorPlan = [
      { x: x1 - pad, y: y1 - pad },
      { x: x2 + pad, y: y1 - pad },
      { x: x2 + pad, y: y2 + pad },
      { x: x1 - pad, y: y2 + pad },
    ]
  }

  let cx = 0
  let cy = 0
  for (const p of floorPlan) {
    cx += p.x
    cy += p.y
  }
  return { floorPlan, walls, objectsParts, center: { x: cx / floorPlan.length, y: cy / floorPlan.length }, hasRoom }
}
