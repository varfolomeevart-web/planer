import type { Floor, PlannerObject, Pt } from './types'
import { isDoorWindowPreset, getPreset } from './presets'
import { objectCorners } from './geometry'

/**
 * 3D-визуализация помещения: аксонометрический рендер на Canvas 2D без зависимостей.
 * Пол — многоугольник комнаты, стены — вертикальные грани, объекты — выдавленные боксы
 * с реальными высотами (у раздела «Клён» — из каталога, на верхней грани схема из каталога).
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

const WALL_H = 270
const PART_H = 250

const FLOOR_FILL = '#F4EEE2'
const FLOOR_EDGE = '#D8CBB6'
const WALL_FILL = '#EFE6D6'
const WALL_EDGE = '#B9A88C'
const PART_FILL = '#E3D7C1'
const KLEN_TOP = '#F4FAEF'
const KLEN_EDGE = '#5D8A4E'

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
  klen_9: 58, klen_10: 133, klen_11: 196, klen_12: 84, klen_13: 68, klen_14: 87,
  klen_15: 85, klen_16: 37, klen_17: 33, klen_18: 87, klen_19: 47, klen_21: 83,
  klen_22: 52, klen_23: 41, klen_24: 192, klen_25: 85,
}

/** Объекты, висящие над полом (зонты вытяжные, люстры и т.п.), см от пола */
const PRESET_ZOFF: Record<string, number> = {
  klen_8: 190, klen_20: 190,
  chandelier: 220, lamp: 250, wall_lamp: 140, hood: 150,
}

/** Кэш картинок пресетов (SVG-схемы «Клён») для верхних граней */
const imgCache = new Map<string, HTMLImageElement>()

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

function polyPath(ctx: CanvasRenderingContext2D, pts: U3[], s: number, ox: number, oy: number) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!p) continue
    const x = ox + p.u * s
    const y = oy + p.v * s
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: U3[], s: number, ox: number, oy: number, fill: string, stroke?: string) {
  polyPath(ctx, pts, s, ox, oy)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

// ---------- геометрия сцены ----------

interface BoxFace {
  pts: U3[]
  fill: string
  stroke?: string
  depth: number
  img?: { src: string; flip: boolean }
}

/** Углы повёрнутого прямоугольника объекта */
function footprint(o: PlannerObject): Pt[] {
  return objectCorners(o)
}

function objectHeight(o: PlannerObject): number {
  return PRESET_H[o.presetId] ?? 60
}

function objectZoff(o: PlannerObject): number {
  return PRESET_ZOFF[o.presetId] ?? 0
}

/**
 * Рендер 3D-вида этажа. Канвас уже приведён к devicePixelRatio компонентом.
 */
export function render3d(canvas: HTMLCanvasElement, floor: Floor, st: View3dState) {
  const ctx0 = canvas.getContext('2d')
  if (!ctx0) return
  const ctx: CanvasRenderingContext2D = ctx0
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const hasRoom = !!floor.room && floor.room.length >= 3
  const hasObjects = floor.objects.length > 0
  if (!hasRoom && !hasObjects) return

  const az = (st.azimuth * Math.PI) / 180
  const el = (st.elevation * Math.PI) / 180
  const cosA = Math.cos(az)
  const sinA = Math.sin(az)
  const cosE = Math.cos(el)
  const sinE = Math.sin(el)
  const viewDir: Pt = { x: sinA, y: cosA }
  // свет слева-сверху
  const lightLen = Math.hypot(-0.45, -0.89)
  const light: Pt = { x: -0.45 / lightLen, y: -0.89 / lightLen }

  const proj = (x: number, y: number, z: number): U3 => ({
    u: x * cosA - y * sinA,
    v: (x * sinA + y * cosA) * cosE - z * sinE,
    d: x * sinA + y * cosA,
  })

  // ---------- собрать точки для вписывания ----------
  const fitPts: U3[] = []
  if (hasRoom && floor.room) {
    for (const p of floor.room) {
      fitPts.push(proj(p.x, p.y, 0), proj(p.x, p.y, WALL_H))
    }
  }
  for (const o of floor.objects) {
    const fp = footprint(o)
    const z0 = objectZoff(o)
    const z1 = z0 + objectHeight(o)
    for (const p of fp) fitPts.push(proj(p.x, p.y, z0), proj(p.x, p.y, z1))
  }
  if (!fitPts.length) return
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
  const s = Math.min((W * 0.82) / bw, (H * 0.82) / bh) * st.zoom
  const ox = W / 2 - ((minU + maxU) / 2) * s
  const oy = H / 2 - ((minV + maxV) / 2) * s

  // ---------- фон ----------
  ctx.fillStyle = '#2E2924'
  ctx.fillRect(0, 0, W, H)

  // ---------- пол ----------
  let floorPoly: U3[] = []
  if (hasRoom && floor.room) {
    floorPoly = floor.room.map((p) => proj(p.x, p.y, 0))
  } else {
    // без комнаты — площадка вокруг объектов
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const o of floor.objects) {
      for (const p of footprint(o)) {
        if (p.x < x1) x1 = p.x
        if (p.x > x2) x2 = p.x
        if (p.y < y1) y1 = p.y
        if (p.y > y2) y2 = p.y
      }
    }
    const pad = 60
    floorPoly = [
      proj(x1 - pad, y1 - pad, 0),
      proj(x2 + pad, y1 - pad, 0),
      proj(x2 + pad, y2 + pad, 0),
      proj(x1 - pad, y2 + pad, 0),
    ]
  }
  fillPoly(ctx, floorPoly, s, ox, oy, FLOOR_FILL, FLOOR_EDGE)

  // ---------- нормали ребер комнаты ----------
  const room = floor.room && floor.room.length >= 3 ? floor.room : null
  let cx0 = 0
  let cy0 = 0
  if (room) {
    for (const p of room) {
      cx0 += p.x
      cy0 += p.y
    }
    cx0 /= room.length
    cy0 /= room.length
  }
  /** внешняя нормаль ребра (от центра комнаты) */
  function outwardNormal(a: Pt, b: Pt): Pt {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    let nx = -dy / len
    let ny = dx / len
    const mx = (a.x + b.x) / 2 - cx0
    const my = (a.y + b.y) / 2 - cy0
    if (nx * mx + ny * my < 0) {
      nx = -nx
      ny = -ny
    }
    return { x: nx, y: ny }
  }

  // ---------- стены и перегородки ----------
  const farFaces: BoxFace[] = []
  const nearFaces: BoxFace[] = []

  if (room) {
    for (let i = 0; i < room.length; i++) {
      const a = room[i]
      const b = room[(i + 1) % room.length]
      if (!a || !b) continue
      const n = outwardNormal(a, b)
      const facingCam = n.x * viewDir.x + n.y * viewDir.y < 0
      const pts = [proj(a.x, a.y, 0), proj(b.x, b.y, 0), proj(b.x, b.y, WALL_H), proj(a.x, a.y, WALL_H)]
      const depth = (a.x * sinA + a.y * cosA + b.x * sinA + b.y * cosA) / 2
      const bright = 0.9 + 0.1 * Math.max(0, n.x * light.x + n.y * light.y)
      const face: BoxFace = {
        pts,
        depth,
        fill: facingCam ? shade(WALL_FILL, bright) : shade(WALL_FILL, bright),
        stroke: WALL_EDGE,
      }
      if (facingCam) nearFaces.push(face)
      else farFaces.push(face)
    }
  }

  for (const part of floor.partitions) {
    for (let i = 0; i + 1 < part.pts.length; i++) {
      const a = part.pts[i]
      const b = part.pts[i + 1]
      if (!a || !b) continue
      farFaces.push({
        pts: [proj(a.x, a.y, 0), proj(b.x, b.y, 0), proj(b.x, b.y, PART_H), proj(a.x, a.y, PART_H)],
        depth: (a.x * sinA + a.y * cosA + b.x * sinA + b.y * cosA) / 2,
        fill: PART_FILL,
        stroke: '#C4B394',
      })
    }
  }

  farFaces.sort((f1, f2) => f1.depth - f2.depth)
  for (const f of farFaces) fillPoly(ctx, f.pts, s, ox, oy, f.fill, f.stroke)

  // ---------- тени объектов ----------
  const boxes = floor.objects.filter((o) => !isDoorWindowPreset(o.presetId))
  for (const o of boxes) {
    const h = objectHeight(o)
    if (h < 5) continue
    const fp = footprint(o)
    const off = h * 0.12 * s
    ctx.beginPath()
    for (let i = 0; i < fp.length; i++) {
      const p = proj(fp[i].x, fp[i].y, 0)
      const x = ox + p.u * s + off
      const y = oy + p.v * s + off * 0.6
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(46,41,36,0.16)'
    ctx.fill()
  }

  // ---------- объекты-боксы ----------
  interface BoxItem {
    depth: number
    draw: () => void
  }
  const items: BoxItem[] = []

  function pushBox(fp: Pt[], z0: number, z1: number, color: string, cx: number, cy: number, img?: { src: string; flip: boolean }) {
    const P = fp.map((p) => ({
      z0: proj(p.x, p.y, z0),
      z1: proj(p.x, p.y, z1),
    }))
    const depth = P.reduce((acc, p) => acc + p.z0.d, 0) / P.length
    items.push({
      depth,
      draw: () => {
        // видимые боковые грани: нормаль смотрит на камеру
        for (let i = 0; i < P.length; i++) {
          const c1 = P[i]
          const c2 = P[(i + 1) % P.length]
          if (!c1 || !c2) continue
          // нормаль ребра в мировых координатах
          const a = fp[i]
          const b = fp[(i + 1) % fp.length]
          if (!a || !b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          let nx = -dy / len
          let ny = dx / len
          const mx = (a.x + b.x) / 2 - cx
          const my = (a.y + b.y) / 2 - cy
          if (nx * mx + ny * my < 0) {
            nx = -nx
            ny = -ny
          }
          if (nx * viewDir.x + ny * viewDir.y >= 0) continue
          const bright = 0.72 + 0.24 * Math.max(0, nx * light.x + ny * light.y)
          fillPoly(ctx, [c1.z0, c2.z0, c2.z1, c1.z1], s, ox, oy, shade(color, bright), 'rgba(61,52,40,0.28)')
        }
        // верхняя грань
        const top = P.map((p) => p.z1)
        fillPoly(ctx, top, s, ox, oy, color, 'rgba(61,52,40,0.32)')
        if (img) {
          const cached = imgCache.get(img.src)
          if (cached && cached.complete && cached.naturalWidth > 0) {
            // аффинное отображение картинки на верхнюю грань
            const i0 = img.flip ? 1 : 0
            const iu = img.flip ? 0 : 1
            const iv = img.flip ? 2 : 3
            const p0 = top[i0]
            const pu = top[iu]
            const pv = top[iv]
            if (p0 && pu && pv) {
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
          } else {
            fillPoly(ctx, top, s, ox, oy, KLEN_TOP, KLEN_EDGE)
          }
        }
      },
    })
  }

  for (const o of boxes) {
    const h = objectHeight(o)
    const z0 = objectZoff(o)
    const preset = getPreset(o.presetId)
    const isKlen = o.presetId.startsWith('klen_')
    const img = isKlen && preset.img ? { src: preset.img, flip: !!o.flip } : undefined
    const color = o.color || preset.color

    if (o.presetId === 'stairs_straight' || o.presetId === 'stairs_l') {
      // лестница — ступени
      const steps = 4
      const long = o.w >= o.h
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps
        const t1 = (i + 1) / steps
        const fp: Pt[] = long
          ? [
              { x: o.x - o.w / 2 + o.w * t0, y: o.y - o.h / 2 },
              { x: o.x - o.w / 2 + o.w * t1, y: o.y - o.h / 2 },
              { x: o.x - o.w / 2 + o.w * t1, y: o.y + o.h / 2 },
              { x: o.x - o.w / 2 + o.w * t0, y: o.y + o.h / 2 },
            ]
          : [
              { x: o.x - o.w / 2, y: o.y - o.h / 2 + o.h * t0 },
              { x: o.x + o.w / 2, y: o.y - o.h / 2 + o.h * t0 },
              { x: o.x + o.w / 2, y: o.y - o.h / 2 + o.h * t1 },
              { x: o.x - o.w / 2, y: o.y - o.h / 2 + o.h * t1 },
            ]
        // поворот ступеней вместе с объектом
        const a = (o.angle * Math.PI) / 180
        const c = Math.cos(a)
        const sn = Math.sin(a)
        const rot = fp.map((p) => ({
          x: o.x + (p.x - o.x) * c - (p.y - o.y) * sn,
          y: o.y + (p.x - o.x) * sn + (p.y - o.y) * c,
        }))
        pushBox(rot, 0, (h * (i + 1)) / steps, color, o.x, o.y)
      }
      continue
    }

    pushBox(footprint(o), z0, z0 + h, color, o.x, o.y, img)
  }

  items.sort((b1, b2) => b1.depth - b2.depth)
  for (const it of items) it.draw()

  // ---------- передние стены ----------
  if (st.walls !== 'hide' && nearFaces.length) {
    nearFaces.sort((f1, f2) => f1.depth - f2.depth)
    for (const f of nearFaces) {
      if (st.walls === 'ghost') {
        polyPath(ctx, f.pts, s, ox, oy)
        ctx.fillStyle = 'rgba(239,230,214,0.16)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(185,168,140,0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        fillPoly(ctx, f.pts, s, ox, oy, f.fill, f.stroke)
      }
    }
  }
}
