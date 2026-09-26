import type { Floor, LayerVis, Pt } from './types'
import { DEFAULT_LAYERS } from './types'
import { objectCorners, polygonArea } from './geometry'
import { isStairs } from './floors'
import { drawObject, drawStairsGhost, drawUnderlay, type DrawUI } from './draw'

/**
 * 2D-снимок камеры: реалистичный план-рендер зоны обзора (сектор 65°
 * от точки камеры в направлении взгляда) на Canvas 2D без зависимостей.
 *
 * Стиль «2D-рендер плана»:
 *  - дощатый пол с пазами и торцевыми стыками (вразбежку), лёгкое выцветание от света камеры;
 *  - тёмные стены с толщиной в сантиметрах, внутренняя тень (AO) вдоль стен;
 *  - мягкие падающие тени под мебелью и перегородками;
 *  - остальной план скрыт: за пределами сектора — тёмный фон со световым ореолом у камеры;
 *  - тёплая тонировка, глубинное затемнение от камеры, виньетка, подпись снизу.
 */

const HALF_FOV = 32.5 // половина угла обзора, град (65° — как маркер на плане)
const WALL_T = 12 // толщина наружных стен, см
const PART_T = 6 // толщина перегородок, см
const PLANK = 16 // ширина доски пола, см
const PLANK_LEN = 130 // длина доски, см
const STRIP_MIN = 64 // подпись: минимальная высота, px
const STRIP_K = 0.032 // подпись: доля от ширины холста

const WALL_OUT = '#26201A'
const WALL_FILL = '#3D352B'
const PART_FILL = '#6E6150'
const BG_DARK = '#191510'
const BG_GLOW = 'rgba(236,176,92,0.10)'
const WEDGE_BACKDROP = '#2B241C'

// свет слева-сверху, тени — вправо-вниз (согласовано с 3D-режимами)
const SHADOW = { x: 0.42, y: 0.91 }

// ---------- цветовые утилиты ----------

function hexRgb(c: string): [number, number, number] {
  const m6 = /^#([0-9a-f]{6})$/i.exec(c)
  if (m6) {
    const n = parseInt(m6[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(c)
  if (m3) {
    const n = parseInt(m3[1], 16)
    return [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
  }
  return [216, 188, 144]
}

/** детерминированный «шум» для оттенка досок: -1..1 */
function plankNoise(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}

interface View {
  scale: number
  ox: number
  oy: number
}

const wx = (v: View, x: number) => x * v.scale + v.ox
const wy = (v: View, y: number) => y * v.scale + v.oy

function pathPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], v: View) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = wx(v, p.x)
    const y = wy(v, p.y)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
}

function pathPolyline(ctx: CanvasRenderingContext2D, pts: Pt[], v: View) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = wx(v, p.x)
    const y = wy(v, p.y)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
}

// размытие доступно в целевых браузерах (chrome>=61); проверяем фичу без сужения типа
function canBlur(ctx: CanvasRenderingContext2D): boolean {
  return typeof (ctx as unknown as { filter?: string }).filter === 'string'
}

// ---------- пол: доски ----------

function drawPlanks(ctx: CanvasRenderingContext2D, v: View, bbox: { minX: number; minY: number; maxX: number; maxY: number }) {
  const wCm = bbox.maxX - bbox.minX
  const hCm = bbox.maxY - bbox.minY
  // доски укладываем вдоль длинной стороны помещения
  const alongX = wCm >= hCm
  const base = hexRgb('#D8BC90')

  const drawPlankRect = (d0: number, d1: number, off0: number, off1: number, i: number, j: number) => {
    const f = 1 + plankNoise(i, j) * 0.055
    const r = Math.min(255, Math.round(base[0] * f))
    const g = Math.min(255, Math.round(base[1] * f))
    const b = Math.min(255, Math.round(base[2] * f))
    ctx.fillStyle = `rgb(${r},${g},${b})`
    const x = alongX ? off0 : d0
    const y = alongX ? d0 : off0
    const wPx = (alongX ? off1 - off0 : d1 - d0) * v.scale
    const hPx = (alongX ? d1 - d0 : off1 - off0) * v.scale
    ctx.fillRect(wx(v, x), wy(v, y), wPx, hPx)
  }

  const dMin = alongX ? bbox.minX : bbox.minY
  const dMax = alongX ? bbox.maxX : bbox.maxY
  const oMin = alongX ? bbox.minY : bbox.minX
  const oMax = alongX ? bbox.maxY : bbox.maxX

  let row = 0
  for (let d = Math.floor(dMin / PLANK) * PLANK; d < dMax; d += PLANK, row++) {
    const off = row % 2 === 0 ? 0 : PLANK_LEN / 2
    let col = 0
    for (let o = Math.floor((oMin - off) / PLANK_LEN) * PLANK_LEN + off; o < oMax; o += PLANK_LEN, col++) {
      drawPlankRect(d, d + PLANK, o, Math.min(o + PLANK_LEN, oMax + PLANK_LEN), col, row)
    }
    // паз между рядами
    ctx.strokeStyle = 'rgba(96,74,48,0.34)'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (alongX) {
      const y = wy(v, d)
      ctx.moveTo(wx(v, bbox.minX) - 4, y)
      ctx.lineTo(wx(v, bbox.maxX) + 4, y)
    } else {
      const x = wx(v, d)
      ctx.moveTo(x, wy(v, bbox.minY) - 4)
      ctx.lineTo(x, wy(v, bbox.maxY) + 4)
    }
    ctx.stroke()
  }
  // торцевые стыки (вразбежку) — тонкие линии
  ctx.strokeStyle = 'rgba(96,74,48,0.22)'
  ctx.lineWidth = 1
  row = 0
  for (let d = Math.floor(dMin / PLANK) * PLANK; d < dMax; d += PLANK, row++) {
    const off = row % 2 === 0 ? 0 : PLANK_LEN / 2
    for (let o = Math.floor((oMin - off) / PLANK_LEN) * PLANK_LEN + off; o < oMax; o += PLANK_LEN) {
      ctx.beginPath()
      if (alongX) {
        const x = wx(v, o)
        ctx.moveTo(x, wy(v, d))
        ctx.lineTo(x, wy(v, d + PLANK))
      } else {
        const y = wy(v, o)
        ctx.moveTo(wx(v, d), y)
        ctx.lineTo(wx(v, d + PLANK), y)
      }
      ctx.stroke()
    }
  }
}

// ---------- геометрия сектора ----------

interface Wedge {
  cam: { x: number; y: number; angle: number }
  a1: number
  a2: number
  radius: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}

function buildWedge(floor: Floor): Wedge | null {
  const cam = floor.camera
  if (!cam) return null
  let maxD = 0
  if (floor.room && floor.room.length >= 3) {
    for (const p of floor.room) maxD = Math.max(maxD, Math.hypot(p.x - cam.x, p.y - cam.y))
  }
  if (maxD === 0) {
    for (const o of floor.objects) {
      for (const c of objectCorners(o)) maxD = Math.max(maxD, Math.hypot(c.x - cam.x, c.y - cam.y))
    }
  }
  if (maxD === 0) maxD = 500
  const radius = maxD * 1.04 + 50

  const rad = (cam.angle * Math.PI) / 180
  const half = (HALF_FOV * Math.PI) / 180
  const a1 = rad - Math.PI / 2 - half
  const a2 = rad - Math.PI / 2 + half

  // bbox сектора: вершина + дуга (с запасом по выборке)
  const pts: Pt[] = [{ x: cam.x, y: cam.y }]
  const N = 64
  for (let i = 0; i <= N; i++) {
    const a = a1 + ((a2 - a1) * i) / N
    pts.push({ x: cam.x + Math.cos(a) * radius, y: cam.y + Math.sin(a) * radius })
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { cam, a1, a2, radius, bbox: { minX, minY, maxX, maxY } }
}

function wedgePath(ctx: CanvasRenderingContext2D, w: Wedge, v: View) {
  ctx.beginPath()
  ctx.moveTo(wx(v, w.cam.x), wy(v, w.cam.y))
  ctx.arc(wx(v, w.cam.x), wy(v, w.cam.y), w.radius * v.scale, w.a1, w.a2)
  ctx.closePath()
}

// ---------- основной рендер ----------

export interface Snap2dOptions {
  /** экспортный режим: ширина холста в px (холст будет переразмерен) */
  width?: number
  /** рисовать подпись снизу (по умолчанию true) */
  caption?: boolean
}

/**
 * Рендерит 2D-снимок зоны обзора камеры на canvas.
 * Без opts.width — «вписать»: используется текущий размер canvas,
 * сектор масштабируется по центру (режим модалки, canvas уже под DPR).
 */
export function renderSnapshot2d(canvas: HTMLCanvasElement, floor: Floor, layers?: LayerVis, opts?: Snap2dOptions) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const wedge = buildWedge(floor)
  if (!wedge) return

  const vis: LayerVis = { ...DEFAULT_LAYERS, ...(layers ?? {}) }
  const layerOn = (id: string | undefined) => vis[(id ?? 'furniture') as keyof LayerVis] !== false
  const objects = floor.objects.filter((o) => layerOn(o.layer))
  const room = floor.room && floor.room.length >= 3 ? floor.room : null
  const underlay = floor.underlay && floor.underlay.visible ? floor.underlay : null

  // ---------- раскладка ----------
  const padCm = 80
  const bw = wedge.bbox.maxX - wedge.bbox.minX + padCm * 2
  const bh = wedge.bbox.maxY - wedge.bbox.minY + padCm * 2
  const W = canvas.width
  const H = canvas.height
  const stripH = opts?.width ? Math.max(STRIP_MIN, Math.round(W * STRIP_K)) : Math.min(110, Math.max(STRIP_MIN, Math.round(H * 0.11)))
  let scale: number
  let ox: number
  let oy: number
  if (opts?.width) {
    scale = Math.min(W / bw, 3600 / bh)
    const contentH = bh * scale
    canvas.height = Math.round(contentH) + stripH
    ox = (W - bw * scale) / 2 - (wedge.bbox.minX - padCm) * scale
    oy = -(wedge.bbox.minY - padCm) * scale
  } else {
    scale = Math.min(W / bw, (H - stripH * 0.4) / bh) * 0.985
    ox = (W - bw * scale) / 2 - (wedge.bbox.minX - padCm) * scale
    oy = (H - stripH * 0.4 - bh * scale) / 2 - (wedge.bbox.minY - padCm) * scale
  }
  const v: View = { scale, ox, oy }
  const cw = canvas.width
  const ch = canvas.height

  const apexX = wx(v, wedge.cam.x)
  const apexY = wy(v, wedge.cam.y)

  // ---------- фон ----------
  ctx.clearRect(0, 0, cw, ch)
  ctx.fillStyle = BG_DARK
  ctx.fillRect(0, 0, cw, ch)
  const glow = ctx.createRadialGradient(apexX, apexY, 0, apexX, apexY, wedge.radius * scale * 0.75)
  glow.addColorStop(0, BG_GLOW)
  glow.addColorStop(1, 'rgba(236,176,92,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, cw, ch)

  // ---------- контент внутри сектора ----------
  ctx.save()
  wedgePath(ctx, wedge, v)
  ctx.clip()

  // подложка сектора (пол отсутствует — тёмная поверхность)
  ctx.fillStyle = WEDGE_BACKDROP
  ctx.fillRect(0, 0, cw, ch)

  const ui: DrawUI = {
    showGrid: false,
    selectedId: null,
    drawingPts: null,
    cursor: null,
    ghost: null,
    draggingVertex: null,
    showVertexHandles: false,
    underlaySelected: false,
    selectedPartitionId: null,
    draggingPartitionVertex: null,
    drawingMode: 'room',
    layers: vis,
    selectedDimensionId: null,
    ruler: null,
    cameraGhost: null,
    cameraTool: false,
  }

  if (room) {
    // пол: доски, выцветание от света камеры, АО вдоль стен — всё в клипе комнаты
    ctx.save()
    pathPolygon(ctx, room, v)
    ctx.closePath()
    ctx.clip()
    const roomBbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    for (const p of room) {
      roomBbox.minX = Math.min(roomBbox.minX, p.x)
      roomBbox.minY = Math.min(roomBbox.minY, p.y)
      roomBbox.maxX = Math.max(roomBbox.maxX, p.x)
      roomBbox.maxY = Math.max(roomBbox.maxY, p.y)
    }
    drawPlanks(ctx, v, roomBbox)
    // свет камеры на полу
    const lg = ctx.createRadialGradient(apexX, apexY, 0, apexX, apexY, wedge.radius * scale)
    lg.addColorStop(0, 'rgba(255,224,170,0.16)')
    lg.addColorStop(0.45, 'rgba(255,224,170,0.04)')
    lg.addColorStop(1, 'rgba(22,15,8,0.30)')
    ctx.fillStyle = lg
    ctx.fillRect(0, 0, cw, ch)
    // внутренняя тень вдоль стен (AO)
    ctx.save()
    if (canBlur(ctx)) ctx.filter = `blur(${Math.max(2, scale * 3)}px)`
    pathPolygon(ctx, room, v)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(24,18,12,0.30)'
    ctx.lineWidth = 26 * scale
    ctx.stroke()
    ctx.strokeStyle = 'rgba(24,18,12,0.18)'
    ctx.lineWidth = 52 * scale
    ctx.stroke()
    ctx.restore()
    ctx.restore()

    // подложка-скан поверх досок (прозрачность пользователя)
    if (underlay) drawUnderlay(ctx, underlay, v, ui)
  } else if (underlay) {
    drawUnderlay(ctx, underlay, v, ui)
  }

  // тени стен внутрь помещения
  if (room) {
    ctx.save()
    pathPolygon(ctx, room, v)
    ctx.closePath()
    ctx.clip()
    ctx.save()
    if (canBlur(ctx)) ctx.filter = `blur(${Math.max(2, scale * 2.5)}px)`
    ctx.translate(SHADOW.x * 7 * scale, SHADOW.y * 7 * scale)
    pathPolygon(ctx, room, v)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(20,15,10,0.38)'
    ctx.lineWidth = WALL_T * scale
    ctx.stroke()
    ctx.restore()
    ctx.restore()
  }
  // тени перегородок
  if (floor.partitions.length > 0) {
    ctx.save()
    if (room) {
      pathPolygon(ctx, room, v)
      ctx.closePath()
      ctx.clip()
    }
    ctx.save()
    if (canBlur(ctx)) ctx.filter = `blur(${Math.max(2, scale * 2)}px)`
    ctx.translate(SHADOW.x * 5 * scale, SHADOW.y * 5 * scale)
    for (const p of floor.partitions) {
      pathPolyline(ctx, p.pts, v)
      ctx.strokeStyle = 'rgba(20,15,10,0.30)'
      ctx.lineWidth = (PART_T + 4) * scale
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    ctx.restore()
    ctx.restore()
  }

  // тени мебели (силуэты следов объектов со смещением по свету)
  if (objects.length > 0) {
    ctx.save()
    if (room) {
      pathPolygon(ctx, room, v)
      ctx.closePath()
      ctx.clip()
    }
    ctx.save()
    if (canBlur(ctx)) ctx.filter = `blur(${Math.max(2, scale * 3.5)}px)`
    else ctx.globalAlpha = 0.16
    for (const o of objects) {
      const cs = objectCorners(o)
      if (cs.length < 3) continue
      const lift = 5 + Math.min(7, (o.w * o.h) / 40000) // крупная мебель — шире тень
      ctx.save()
      ctx.translate(SHADOW.x * lift * scale, SHADOW.y * lift * scale)
      pathPolygon(ctx, cs, v)
      ctx.closePath()
      ctx.fillStyle = 'rgba(28,21,14,0.30)'
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
    ctx.restore()
  }

  // стены и перегородки
  if (room) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    pathPolygon(ctx, room, v)
    ctx.closePath()
    ctx.strokeStyle = WALL_OUT
    ctx.lineWidth = (WALL_T + 3) * scale
    ctx.stroke()
    ctx.strokeStyle = WALL_FILL
    ctx.lineWidth = WALL_T * scale
    ctx.stroke()
  }
  for (const p of floor.partitions) {
    pathPolyline(ctx, p.pts, v)
    ctx.strokeStyle = WALL_OUT
    ctx.lineWidth = (PART_T + 2.5) * scale
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.strokeStyle = PART_FILL
    ctx.lineWidth = PART_T * scale
    ctx.stroke()
  }

  // объекты (лестницы текущего этажа — пунктиром, как в редакторе)
  for (const o of objects) {
    if (isStairs(o)) continue
    drawObject(ctx, o, v, false)
  }
  for (const o of objects) {
    if (isStairs(o)) drawStairsGhost(ctx, o, v)
  }

  // камера: оранжевый корпус с объективом в вершине сектора
  const camR = Math.min(34, Math.max(12, 42 * scale))
  ctx.save()
  ctx.beginPath()
  ctx.arc(apexX, apexY, camR * 1.9, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(apexX, apexY, camR, 0, Math.PI * 2)
  ctx.fillStyle = '#E8730C'
  ctx.fill()
  ctx.lineWidth = Math.max(2, camR * 0.22)
  ctx.strokeStyle = '#FFFFFF'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(apexX, apexY, camR * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()

  ctx.restore() // конец клипа сектора

  // контур сектора — тонкая тёплая линия
  wedgePath(ctx, wedge, v)
  ctx.strokeStyle = 'rgba(232,115,12,0.38)'
  ctx.lineWidth = 2.2
  ctx.stroke()

  // глубинное затемнение от камеры + виньетка
  const depth = ctx.createRadialGradient(apexX, apexY, wedge.radius * scale * 0.35, apexX, apexY, wedge.radius * scale * 1.02)
  depth.addColorStop(0, 'rgba(12,9,6,0)')
  depth.addColorStop(1, 'rgba(12,9,6,0.42)')
  ctx.fillStyle = depth
  ctx.fillRect(0, 0, cw, ch)
  const vig = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.max(cw, ch) * 0.74)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.26)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, cw, ch)

  // ---------- подпись ----------
  if (opts?.caption !== false) {
    const fs = Math.max(0.6, cw / 3200)
    const strip = opts?.width ? stripH : Math.min(stripH, ch * 0.2)
    ctx.fillStyle = 'rgba(20,16,12,0.94)'
    ctx.fillRect(0, ch - strip, cw, strip)
    ctx.strokeStyle = 'rgba(232,115,12,0.9)'
    ctx.lineWidth = Math.max(2, 3 * fs)
    ctx.beginPath()
    ctx.moveTo(0, ch - strip)
    ctx.lineTo(cw, ch - strip)
    ctx.stroke()
    const area = room ? Math.abs(polygonArea(room)) / 10000 : 0
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = `700 ${Math.round(30 * fs)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = '#F3EDE2'
    ctx.fillText(`Снимок камеры · ${floor.name}`, 36 * fs, ch - strip / 2 - 12 * fs)
    ctx.font = `500 ${Math.round(19 * fs)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = '#A99A82'
    const sub = `зона обзора 65°${area > 0 ? ` · ${(Math.round(area * 10) / 10).toFixed(1).replace('.', ',')} м²` : ''}`
    ctx.fillText(sub, 36 * fs, ch - strip / 2 + 15 * fs)
    ctx.textAlign = 'right'
    ctx.font = `500 ${Math.round(19 * fs)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = '#A99A82'
    ctx.fillText(
      new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }),
      cw - 36 * fs,
      ch - strip / 2,
    )
  }
}
