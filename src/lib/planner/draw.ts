import type { Dimension, LayerVis, Partition, PlannerDoc, PlannerObject, Pt, Underlay } from './types'
import { DEFAULT_LAYERS, ENG_COLORS } from './types'
import { getPreset, PRESETS } from './presets'
import { KLEN_STROKE } from './klen-presets'
import { isStairs } from './floors'
import { rotateHandlePos } from './geometry'

export const COLORS = {
  bg: '#F3EDE4',
  roomFill: '#FDFAF3',
  wall: '#4A4036',
  gridMinor: 'rgba(74, 64, 54, 0.08)',
  gridMajor: 'rgba(74, 64, 54, 0.16)',
  accent: '#E8730C',
  accentDark: '#C55F05',
  text: '#6B5D4F',
  dim: '#8B7D6B',
  detail: 'rgba(93, 78, 60, 0.75)',
  detailStrong: 'rgba(93, 78, 60, 0.9)',
}

export interface DrawUI {
  showGrid: boolean
  selectedId: string | null
  drawingPts: Pt[] | null
  cursor: Pt | null
  ghost: PlannerObject | null
  draggingVertex: number | null
  showVertexHandles: boolean
  /** выделена ли подложка */
  underlaySelected: boolean
  /** выделенная перегородка */
  selectedPartitionId: string | null
  /** перетаскиваемый узел выбранной перегородки */
  draggingPartitionVertex: number | null
  /** что рисуется инструментом-карандашом */
  drawingMode: 'room' | 'partition' | 'dimension'
  /** видимость слоёв */
  layers: LayerVis
  /** выделенная выноска-размер */
  selectedDimensionId: string | null
  /** рулетка: текущий замер */
  ruler: { a: Pt; b: Pt } | null
  /** призрак устанавливаемой камеры (инструмент «Камера», фаза наведения) */
  cameraGhost?: { x: number; y: number; angle: number } | null
  /** активен ли инструмент «Камера» — подсветка маркера */
  cameraTool?: boolean
  /** вызывается, когда картинка подложки догрузилась — для перерисовки */
  onImageLoad?: () => void
}

// ---------- кэш изображений подложки ----------

const underlayImgCache = new Map<string, HTMLImageElement>()

function getUnderlayImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  let img = underlayImgCache.get(src)
  if (!img) {
    img = new Image()
    img.onload = () => onLoad?.()
    img.src = src
    underlayImgCache.set(src, img)
    if (underlayImgCache.size > 5) {
      const oldest = underlayImgCache.keys().next().value
      if (oldest !== undefined) underlayImgCache.delete(oldest)
    }
    return null
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

/** Гарантирует, что картинка подложки загружена (для экспорта PNG) */
export function preloadUnderlayImage(src: string): Promise<void> {
  const cached = underlayImgCache.get(src)
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      underlayImgCache.set(src, img)
      resolve()
    }
    img.onerror = () => reject(new Error('underlay load failed'))
    img.src = src
  })
}

// ---------- кэш картинок пресетов (раздел «Клён»: схемы оборудования) ----------

const presetImgCache = new Map<string, HTMLImageElement>()
let presetImgLoadCb: (() => void) | null = null

function getPresetImage(src: string): HTMLImageElement | null {
  let img = presetImgCache.get(src)
  if (!img) {
    img = new Image()
    img.onload = () => presetImgLoadCb?.()
    img.src = src
    presetImgCache.set(src, img)
    return null
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

/** Предзагрузка всех картинок пресетов (для экспорта PNG/PDF) */
export function preloadPresetImages(): Promise<void> {
  const srcs = [...new Set(PRESETS.map((p) => p.img).filter((s): s is string => !!s))]
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const cached = presetImgCache.get(src)
          if (cached && cached.complete && cached.naturalWidth > 0) return resolve()
          const img = new Image()
          img.onload = () => {
            presetImgCache.set(src, img)
            resolve()
          }
          img.onerror = () => resolve()
          img.src = src
        }),
    ),
  ).then(() => undefined)
}

export function fmtLen(cm: number): string {
  if (cm < 100) return `${Math.round(cm)} см`
  return `${(cm / 100).toFixed(2).replace('.', ',')} м`
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Рисует глиф мебели в локальных координатах (центр 0,0), единицы — сантиметры.
 * Контекст уже перенесён/повёрнут; внутри применяется scale (px→см).
 */
export function drawGlyph(ctx: CanvasRenderingContext2D, presetId: string, color: string, w: number, h: number, scale: number) {
  const lw = 1.4 / scale
  const lw2 = 1 / scale
  ctx.save()
  ctx.scale(scale, scale)
  ctx.lineWidth = lw
  // инженерные объекты: контур в цвет своей группы (вентиляция — серый, вода — синий, электрика — красный)
  const engLayer = getPreset(presetId).layer
  ctx.strokeStyle = engLayer && engLayer !== 'furniture' ? ENG_COLORS[engLayer].stroke : COLORS.detail
  ctx.fillStyle = color

  const hw = w / 2
  const hh = h / 2
  const min = Math.min(w, h)

  const base = (r = 3) => {
    roundRectPath(ctx, -hw, -hh, w, h, r)
    ctx.fill()
    ctx.stroke()
  }

  /** белый прямоугольник — «проём» в стене (двери и окна) */
  const opening = () => {
    roundRectPath(ctx, -hw, -hh, w, h, 1)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.stroke()
  }

  switch (presetId) {
    case 'sofa':
    case 'armchair': {
      base(8)
      const arm = Math.min(16, w * 0.12)
      const back = Math.min(22, h * 0.28)
      // спинка
      ctx.fillStyle = 'rgba(93, 78, 60, 0.14)'
      ctx.fillRect(-hw, -hh, w, back)
      // подлокотники
      ctx.fillRect(-hw, -hh + back, arm, h - back)
      ctx.fillRect(hw - arm, -hh + back, arm, h - back)
      ctx.strokeRect(-hw, -hh, w, back)
      ctx.strokeRect(-hw, -hh + back, arm, h - back)
      ctx.strokeRect(hw - arm, -hh + back, arm, h - back)
      // подушки сиденья
      ctx.lineWidth = lw2
      ctx.strokeStyle = COLORS.detail
      ctx.strokeRect(-hw + arm, -hh + back, (w - 2 * arm) / 2, (h - back) / 2)
      ctx.strokeRect(-hw + arm, -hh + back + (h - back) / 2, (w - 2 * arm) / 2, (h - back) / 2)
      break
    }
    case 'bed_double':
    case 'bed_single': {
      base(4)
      // подушки
      const pw = presetId === 'bed_double' ? (w - 30) / 2 : w - 20
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      if (presetId === 'bed_double') {
        roundRectPath(ctx, -hw + 10, -hh + 8, pw, 32, 6)
        ctx.fill()
        ctx.stroke()
        roundRectPath(ctx, hw - 10 - pw, -hh + 8, pw, 32, 6)
        ctx.fill()
        ctx.stroke()
      } else {
        roundRectPath(ctx, -hw + 10, -hh + 8, pw, 32, 6)
        ctx.fill()
        ctx.stroke()
      }
      // одеяло
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, -hh + 55)
      ctx.lineTo(hw, -hh + 55)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-hw, -hh + 62)
      ctx.lineTo(-hw + 14, -hh + 55)
      ctx.stroke()
      break
    }
    case 'coffee_table':
      base(min * 0.15)
      ctx.lineWidth = lw2
      roundRectPath(ctx, -hw + 8, -hh + 8, w - 16, h - 16, min * 0.1)
      ctx.stroke()
      break
    case 'tv_stand':
      base(2)
      ctx.lineWidth = lw2
      ctx.strokeRect(-hw + 8, -hh + 6, w - 16, h - 12)
      break
    case 'bookshelf': {
      base(2)
      ctx.lineWidth = lw2
      const n = Math.max(2, Math.round(w / 30))
      for (let i = 1; i < n; i++) {
        const x = -hw + (w / n) * i
        ctx.beginPath()
        ctx.moveTo(x, -hh)
        ctx.lineTo(x, hh)
        ctx.stroke()
      }
      break
    }
    case 'rug':
      ctx.setLineDash([10 / scale, 6 / scale])
      ctx.lineWidth = lw2
      ctx.fillStyle = color
      roundRectPath(ctx, -hw, -hh, w, h, 4)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      roundRectPath(ctx, -hw + 12, -hh + 12, w - 24, h - 24, 3)
      ctx.stroke()
      break
    case 'wardrobe':
      base(2)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(0, -hh)
      ctx.lineTo(0, hh)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-6, -6)
      ctx.lineTo(-6, 6)
      ctx.moveTo(6, -6)
      ctx.lineTo(6, 6)
      ctx.stroke()
      break
    case 'dresser':
      base(2)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, -hh + h / 3)
      ctx.lineTo(hw, -hh + h / 3)
      ctx.moveTo(-hw, -hh + (2 * h) / 3)
      ctx.lineTo(hw, -hh + (2 * h) / 3)
      ctx.stroke()
      break
    case 'desk':
      base(3)
      ctx.lineWidth = lw2
      ctx.strokeRect(-hw + 8, -hh + 6, w - 16, 14)
      break
    case 'kitchen_set': {
      base(2)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, -hh)
      ctx.lineTo(hw, -hh)
      ctx.moveTo(-hw, hh)
      ctx.lineTo(hw, hh)
      ctx.stroke()
      // мойка
      ctx.beginPath()
      ctx.arc(-hw + w * 0.2, 0, Math.min(22, h * 0.32), 0, Math.PI * 2)
      ctx.stroke()
      // конфорки
      const cx = hw - w * 0.12
      const r = Math.min(10, h * 0.16)
      for (const [dx, dy] of [
        [-r - 4, -h * 0.22],
        [r + 4, -h * 0.22],
        [-r - 4, h * 0.22],
        [r + 4, h * 0.22],
      ]) {
        ctx.beginPath()
        ctx.arc(cx + dx, dy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'dining_table':
      base(min * 0.12)
      break
    case 'chair':
      base(6)
      ctx.fillStyle = 'rgba(93, 78, 60, 0.16)'
      ctx.fillRect(-hw, -hh, w, Math.min(10, h * 0.2))
      ctx.strokeRect(-hw, -hh, w, Math.min(10, h * 0.2))
      break
    case 'fridge':
      base(4)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, hh - Math.min(12, h * 0.18))
      ctx.lineTo(hw, hh - Math.min(12, h * 0.18))
      ctx.stroke()
      break
    case 'stove': {
      base(3)
      ctx.lineWidth = lw2
      const r = min * 0.18
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath()
        ctx.arc(dx * w * 0.22, dy * h * 0.22, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'sink_cab':
      base(3)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, min * 0.3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -min * 0.18, 2.5, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'bathtub':
      roundRectPath(ctx, -hw, -hh, w, h, 14)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      roundRectPath(ctx, -hw + 9, -hh + 9, w - 18, h - 18, 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(-hw + 26, 0, 4, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'shower':
      base(4)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, -hh)
      ctx.lineTo(hw, hh)
      ctx.moveTo(hw, -hh)
      ctx.lineTo(-hw, hh)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, min * 0.12, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'toilet': {
      const tankH = Math.min(20, h * 0.3)
      roundRectPath(ctx, -hw, -hh, w, tankH, 3)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(0, hh - (h - tankH) / 2 - 1, w * 0.36, (h - tankH) / 2 - 3, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'washbasin':
      base(6)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.ellipse(0, 2, w * 0.32, h * 0.28, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -hh + 7, 2.5, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'washer': {
      base(4)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 2, min * 0.3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 2, min * 0.18, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeRect(-hw + 6, -hh + 4, w - 12, 7)
      break
    }
    // ---------- Кафе ----------
    case 'cafe_table2': {
      // стол
      roundRectPath(ctx, -27, -20, 54, 40, 4)
      ctx.fill()
      ctx.stroke()
      // два стула
      ctx.lineWidth = lw2
      for (const dy of [-32, 20]) {
        roundRectPath(ctx, -13, dy, 26, 12, 3)
        ctx.fill()
        ctx.stroke()
      }
      break
    }
    case 'cafe_table4': {
      roundRectPath(ctx, -35, -25, 70, 50, 4)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      for (const dy of [-37, 25]) {
        roundRectPath(ctx, -13, dy, 26, 12, 3)
        ctx.fill()
        ctx.stroke()
      }
      for (const dx of [-47, 35]) {
        roundRectPath(ctx, dx, -12, 12, 24, 3)
        ctx.fill()
        ctx.stroke()
      }
      break
    }
    case 'bar_counter': {
      base(4)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw + 8, -hh + 14)
      ctx.lineTo(hw - 8, -hh + 14)
      ctx.stroke()
      // барные стулья
      for (const dx of [-hw * 0.55, 0, hw * 0.55]) {
        ctx.beginPath()
        ctx.arc(dx, hh - 14, 9, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'coffee_machine':
      base(3)
      ctx.lineWidth = lw2
      ctx.strokeRect(-hw + 8, -hh + 5, w - 16, 10)
      ctx.strokeRect(-5, -2, 10, 12)
      break
    case 'cashbox':
      base(3)
      ctx.lineWidth = lw2
      ctx.strokeRect(-hw + 10, -hh + 8, w - 20, h * 0.35)
      ctx.beginPath()
      ctx.moveTo(-hw + 10, hh - 12)
      ctx.lineTo(hw - 10, hh - 12)
      ctx.stroke()
      break
    case 'display_fridge':
      base(3)
      ctx.lineWidth = lw2
      ctx.strokeRect(-hw + 7, -hh + 7, w - 14, h - 14)
      for (const dx of [-hw + w * 0.38, -hw + w * 0.66]) {
        ctx.beginPath()
        ctx.moveTo(dx, -hh + 7)
        ctx.lineTo(dx, hh - 7)
        ctx.stroke()
      }
      break
    case 'dishwasher':
      base(4)
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, -hh + Math.min(12, h * 0.2))
      ctx.lineTo(hw, -hh + Math.min(12, h * 0.2))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 4, min * 0.26, 0, Math.PI * 2)
      ctx.stroke()
      break
    // ---------- Лестницы ----------
    case 'stairs':
    case 'stairs_straight': {
      base(2)
      ctx.lineWidth = lw2
      // ступени каждые 25 см
      const n = Math.max(2, Math.round(h / 25))
      for (let i = 1; i < n; i++) {
        const y = -hh + (h / n) * i
        ctx.beginPath()
        ctx.moveTo(-hw + 3, y)
        ctx.lineTo(hw - 3, y)
        ctx.stroke()
      }
      // стрелка направления подъёма
      ctx.lineWidth = Math.max(1.6, 2.4 / scale)
      ctx.strokeStyle = COLORS.detailStrong
      ctx.beginPath()
      ctx.moveTo(0, hh - 12)
      ctx.lineTo(0, -hh + 20)
      ctx.moveTo(-8, -hh + 30)
      ctx.lineTo(0, -hh + 20)
      ctx.lineTo(8, -hh + 30)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, hh - 12, 4, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'stairs_l': {
      // Г-образная: контур буквой L
      const run = Math.min(100, w * 0.45, h * 0.45)
      ctx.beginPath()
      ctx.moveTo(-hw, -hh)
      ctx.lineTo(hw, -hh)
      ctx.lineTo(hw, -hh + run)
      ctx.lineTo(-hw + run, -hh + run)
      ctx.lineTo(-hw + run, hh)
      ctx.lineTo(-hw, hh)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      // ступени в вертикальном марше (левый столб)
      const nV = Math.max(2, Math.round((h - run) / 25))
      for (let i = 1; i <= nV; i++) {
        const y = -hh + run + ((h - run) / nV) * i
        ctx.beginPath()
        ctx.moveTo(-hw + 3, y)
        ctx.lineTo(-hw + run - 3, y)
        ctx.stroke()
      }
      // ступени в горизонтальном марше (верхний ряд)
      const nH = Math.max(2, Math.round((w - run) / 25))
      for (let i = 1; i <= nH; i++) {
        const x = -hw + run + ((w - run) / nH) * i
        ctx.beginPath()
        ctx.moveTo(x, -hh + 3)
        ctx.lineTo(x, -hh + run - 3)
        ctx.stroke()
      }
      // стрелка: вверх по левому маршу, поворот направо
      ctx.lineWidth = Math.max(1.6, 2.4 / scale)
      ctx.strokeStyle = COLORS.detailStrong
      const mx = -hw + run / 2
      const my = -hh + run / 2
      ctx.beginPath()
      ctx.moveTo(mx, hh - 12)
      ctx.lineTo(mx, my)
      ctx.lineTo(hw - 22, my)
      ctx.moveTo(hw - 32, my - 8)
      ctx.lineTo(hw - 22, my)
      ctx.lineTo(hw - 32, my + 8)
      ctx.stroke()
      break
    }
    // ---------- Двери ----------
    case 'door':
    case 'door_single': {
      opening()
      // полотно (открыто на 90°) и дуга открывания
      ctx.lineWidth = 4
      ctx.strokeStyle = COLORS.detailStrong
      ctx.beginPath()
      ctx.moveTo(-hw, 0)
      ctx.lineTo(-hw, -w)
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.setLineDash([6 / scale, 4 / scale])
      ctx.beginPath()
      ctx.arc(-hw, 0, w, -Math.PI / 2, 0)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    case 'door_double': {
      opening()
      const L = w / 2
      ctx.lineWidth = 4
      ctx.strokeStyle = COLORS.detailStrong
      ctx.beginPath()
      ctx.moveTo(-hw, 0)
      ctx.lineTo(-hw, -L)
      ctx.moveTo(hw, 0)
      ctx.lineTo(hw, -L)
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.setLineDash([6 / scale, 4 / scale])
      ctx.beginPath()
      ctx.arc(-hw, 0, L, -Math.PI / 2, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(hw, 0, L, -Math.PI / 2, Math.PI, true)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    case 'door_sliding': {
      opening()
      ctx.lineWidth = 4
      ctx.strokeStyle = COLORS.detailStrong
      ctx.beginPath()
      ctx.moveTo(-hw + 2, -hh + 1)
      ctx.lineTo(-2, -hh + 1)
      ctx.moveTo(2, hh - 1)
      ctx.lineTo(hw - 2, hh - 1)
      ctx.stroke()
      break
    }
    // ---------- Окна ----------
    case 'window':
    case 'window_120':
    case 'window_180': {
      opening()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw, 0)
      ctx.lineTo(hw, 0)
      ctx.moveTo(-hw, -hh * 0.45)
      ctx.lineTo(hw, -hh * 0.45)
      ctx.moveTo(-hw, hh * 0.45)
      ctx.lineTo(hw, hh * 0.45)
      ctx.stroke()
      break
    }
    // ---------- Инженерия: вентиляция ----------
    case 'hood': {
      base(3)
      ctx.lineWidth = lw2
      const r = min * 0.34
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.stroke()
      // лопасти вентилятора
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3
        ctx.beginPath()
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.32, a, a + Math.PI * 0.9)
        ctx.stroke()
      }
      break
    }
    case 'vent_channel': {
      base(2)
      ctx.lineWidth = lw2
      for (let i = 1; i <= 3; i++) {
        const off = (-hh + (h / 4) * i)
        ctx.beginPath()
        ctx.moveTo(-hw + 4, off + 5)
        ctx.lineTo(hw - 4, off - 5)
        ctx.stroke()
      }
      break
    }
    case 'vent_duct': {
      base(3)
      ctx.lineWidth = lw2
      // стенки воздуховода
      const off = Math.max(2.5, h * 0.22)
      ctx.beginPath()
      ctx.moveTo(-hw + 4, -off)
      ctx.lineTo(hw - 4, -off)
      ctx.moveTo(-hw + 4, off)
      ctx.lineTo(hw - 4, off)
      ctx.stroke()
      // фланцы по концам
      ctx.beginPath()
      ctx.moveTo(-hw + 14, -off)
      ctx.lineTo(-hw + 14, off)
      ctx.moveTo(hw - 14, -off)
      ctx.lineTo(hw - 14, off)
      ctx.stroke()
      break
    }
    case 'vent_grille': {
      base(1)
      ctx.lineWidth = lw2
      const n = Math.max(2, Math.round(h / 5))
      for (let i = 1; i < n; i++) {
        const y = -hh + (h / n) * i
        ctx.beginPath()
        ctx.moveTo(-hw + 2, y)
        ctx.lineTo(hw - 2, y)
        ctx.stroke()
      }
      break
    }
    case 'vent_fan':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(a) * hw * 0.72, Math.sin(a) * hw * 0.72)
        ctx.stroke()
      }
      break
    case 'vent_valve':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw * 0.45, 0)
      ctx.lineTo(hw * 0.45, 0)
      ctx.moveTo(0, -hw * 0.45)
      ctx.lineTo(0, hw * 0.45)
      ctx.stroke()
      break
    case 'ac_unit': {
      base(3)
      ctx.lineWidth = lw2
      // жалюзи
      ctx.strokeRect(-hw + 5, -hh + 4, w - 10, h * 0.3)
      ctx.beginPath()
      ctx.moveTo(-hw + 6, hh - 8)
      ctx.lineTo(hw - 6, hh - 8)
      ctx.stroke()
      break
    }
    // ---------- Инженерия: вода ----------
    case 'water_riser':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.45, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.detailStrong
      ctx.fill()
      break
    case 'water_pipe':
    case 'sewer_pipe': {
      base(3)
      ctx.lineWidth = lw2
      ctx.setLineDash(presetId === 'sewer_pipe' ? [8 / scale, 5 / scale] : [3 / scale, 3 / scale])
      ctx.beginPath()
      ctx.moveTo(-hw + 6, 0)
      ctx.lineTo(hw - 6, 0)
      ctx.stroke()
      ctx.setLineDash([])
      // соединительные муфты
      const mr = Math.min(6, h * 0.4)
      ctx.beginPath()
      ctx.arc(-hw + 10, 0, mr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(hw - 10, 0, mr, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'water_heater':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.68, 0, Math.PI * 2)
      ctx.stroke()
      // волна — символ воды
      ctx.beginPath()
      ctx.moveTo(-hw * 0.4, 0)
      ctx.quadraticCurveTo(-hw * 0.2, -hw * 0.3, 0, 0)
      ctx.quadraticCurveTo(hw * 0.2, hw * 0.3, hw * 0.4, 0)
      ctx.stroke()
      break
    case 'radiator': {
      base(2)
      ctx.lineWidth = lw2
      const n = Math.max(4, Math.round(w / 14))
      for (let i = 1; i < n; i++) {
        const x = -hw + (w / n) * i
        ctx.beginPath()
        ctx.moveTo(x, -hh + 2)
        ctx.lineTo(x, hh - 2)
        ctx.stroke()
      }
      break
    }
    case 'heated_manifold': {
      base(2)
      ctx.lineWidth = lw2
      const cr = Math.min(5, h * 0.3)
      ctx.beginPath()
      ctx.arc(-hw * 0.45, 0, cr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(hw * 0.45, 0, cr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-hw * 0.45, 0)
      ctx.lineTo(hw * 0.45, 0)
      ctx.stroke()
      break
    }
    case 'towel_dryer': {
      base(3)
      ctx.lineWidth = lw2
      // лестница-полотенцесушитель
      ctx.beginPath()
      ctx.moveTo(-hw * 0.5, -hh + 3)
      ctx.lineTo(-hw * 0.5, hh - 3)
      ctx.moveTo(hw * 0.5, -hh + 3)
      ctx.lineTo(hw * 0.5, hh - 3)
      ctx.stroke()
      const nRungs = Math.max(3, Math.round(h / 12))
      for (let i = 0; i <= nRungs; i++) {
        const y = -hh + 3 + ((h - 6) / nRungs) * i
        ctx.beginPath()
        ctx.moveTo(-hw * 0.5, y)
        ctx.lineTo(hw * 0.5, y)
        ctx.stroke()
      }
      break
    }
    // ---------- Инженерия: электрика ----------
    case 'socket':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      for (const dx of [-hw * 0.35, hw * 0.35]) {
        ctx.beginPath()
        ctx.arc(dx, 0, Math.max(1.2, hw * 0.14), 0, Math.PI * 2)
        ctx.fillStyle = COLORS.detailStrong
        ctx.fill()
      }
      break
    case 'switch':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw * 0.4, hw * 0.4)
      ctx.lineTo(hw * 0.35, -hw * 0.35)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(hw * 0.35, -hw * 0.35, Math.max(1.2, hw * 0.16), 0, Math.PI * 2)
      ctx.fillStyle = COLORS.detailStrong
      ctx.fill()
      break
    case 'lamp':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.moveTo(-hw * 0.45, -hw * 0.45)
      ctx.lineTo(hw * 0.45, hw * 0.45)
      ctx.moveTo(hw * 0.45, -hw * 0.45)
      ctx.lineTo(-hw * 0.45, hw * 0.45)
      ctx.stroke()
      break
    case 'panel_el': {
      base(2)
      ctx.lineWidth = Math.max(1.6, 2 / scale)
      ctx.strokeStyle = COLORS.detailStrong
      ctx.beginPath()
      ctx.moveTo(2, -hh + 8)
      ctx.lineTo(-6, -2)
      ctx.lineTo(3, -2)
      ctx.lineTo(-4, hh - 8)
      ctx.stroke()
      break
    }
    case 'socket_double': {
      const r = Math.min(hh, w / 4) * 0.9
      for (const dx of [-w / 4, w / 4]) {
        ctx.beginPath()
        ctx.arc(dx, 0, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.lineWidth = lw2
      for (const dx of [-w / 4, w / 4]) {
        for (const off of [-r * 0.32, r * 0.32]) {
          ctx.beginPath()
          ctx.arc(dx + off, 0, Math.max(1, r * 0.13), 0, Math.PI * 2)
          ctx.fillStyle = COLORS.detailStrong
          ctx.fill()
        }
      }
      break
    }
    case 'chandelier':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.38, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * hw * 0.55, Math.sin(a) * hw * 0.55)
        ctx.lineTo(Math.cos(a) * hw * 0.85, Math.sin(a) * hw * 0.85)
        ctx.stroke()
      }
      break
    case 'wall_lamp':
      // полукруг с плоской стороной к стене
      ctx.beginPath()
      ctx.arc(0, 0, hw, Math.PI * 0.5, Math.PI * 1.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.5, Math.PI * 0.5, Math.PI * 1.5)
      ctx.stroke()
      break
    case 'net_socket': {
      base(3)
      ctx.lineWidth = lw2
      // символ: экран ТВ + линия сети
      ctx.beginPath()
      ctx.moveTo(-hw * 0.45, -hh * 0.35)
      ctx.lineTo(hw * 0.45, -hh * 0.35)
      ctx.lineTo(0, hh * 0.2)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-hw * 0.35, hh * 0.45)
      ctx.lineTo(hw * 0.35, hh * 0.45)
      ctx.stroke()
      break
    }
    case 'warm_floor': {
      base(6)
      ctx.lineWidth = lw2
      // змейка нагревательного кабеля
      const rows = Math.max(3, Math.round(h / 28))
      const rh = (h - 12) / rows
      ctx.beginPath()
      for (let i = 0; i < rows; i++) {
        const y = -hh + 6 + i * rh
        ctx.moveTo(-hw + 6, y + rh / 2)
        ctx.lineTo(hw - 6, y + rh / 2)
        if (i < rows - 1) {
          const x = i % 2 === 0 ? hw - 6 : -hw + 6
          ctx.lineTo(x, y + rh)
        }
      }
      ctx.stroke()
      break
    }
    case 'motion_sensor':
      ctx.beginPath()
      ctx.arc(0, 0, hw, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(1.2, hw * 0.18), 0, Math.PI * 2)
      ctx.fillStyle = COLORS.detailStrong
      ctx.fill()
      // волны обнаружения
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.55, -Math.PI * 0.25, Math.PI * 0.25)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.8, -Math.PI * 0.35, Math.PI * 0.35)
      ctx.stroke()
      break
    case 'cable_tray': {
      base(2)
      ctx.lineWidth = lw2
      ctx.setLineDash([6 / scale, 4 / scale])
      ctx.beginPath()
      ctx.moveTo(-hw + 5, 0)
      ctx.lineTo(hw - 5, 0)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    case 'plant':
      ctx.beginPath()
      ctx.arc(0, 0, min / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = lw2
      ctx.beginPath()
      ctx.arc(0, 0, min * 0.3, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + Math.PI / 4
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * min * 0.12, Math.sin(a) * min * 0.12)
        ctx.lineTo(Math.cos(a) * min * 0.42, Math.sin(a) * min * 0.42)
        ctx.stroke()
      }
      break
    default:
      base(2)
      break
  }
  ctx.restore()
}

export function drawObject(ctx: CanvasRenderingContext2D, o: PlannerObject, view: { scale: number; ox: number; oy: number }, selected: boolean) {
  const sx = o.x * view.scale + view.ox
  const sy = o.y * view.scale + view.oy
  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate((o.angle * Math.PI) / 180)
  if (o.flip) ctx.scale(-1, 1)
  if (selected) {
    ctx.save()
    ctx.shadowColor = 'rgba(232, 115, 12, 0.55)'
    ctx.shadowBlur = 14
    ctx.scale(view.scale, view.scale)
    ctx.fillStyle = 'transparent'
    ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h)
    ctx.restore()
  }
  // пресет с картинкой-схемой (раздел «Клён»): зелёная подложка + схема из каталога
  const presetImg = getPreset(o.presetId).img
  if (presetImg) {
    ctx.save()
    ctx.scale(view.scale, view.scale)
    roundRectPath(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 1.5)
    ctx.fillStyle = o.color
    ctx.fill()
    ctx.lineWidth = 1.4 / view.scale
    ctx.strokeStyle = KLEN_STROKE
    ctx.stroke()
    const img = getPresetImage(presetImg)
    if (img) ctx.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h)
    ctx.restore()
  } else {
    drawGlyph(ctx, o.presetId, o.color, o.w, o.h, view.scale)
  }
  if (selected) {
    ctx.save()
    ctx.scale(view.scale, view.scale)
    ctx.lineWidth = 1.6 / view.scale
    ctx.strokeStyle = COLORS.accentDark
    ctx.setLineDash([7 / view.scale, 5 / view.scale])
    ctx.strokeRect(-o.w / 2 - 3, -o.h / 2 - 3, o.w + 6, o.h + 6)
    ctx.setLineDash([])
    ctx.restore()
  }
  ctx.restore()
}

/** Призрак лестницы на своём этаже: пунктирный контур со ступенями */
export function drawStairsGhost(ctx: CanvasRenderingContext2D, o: PlannerObject, view: { scale: number; ox: number; oy: number }) {
  const wpx = o.w * view.scale
  const hpx = o.h * view.scale
  const cx = o.x * view.scale + view.ox
  const cy = o.y * view.scale + view.oy
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((o.angle * Math.PI) / 180)
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = COLORS.accentDark
  ctx.lineWidth = 1.7
  ctx.setLineDash([7, 5])
  roundRectPath(ctx, -wpx / 2, -hpx / 2, wpx, hpx, 4)
  ctx.stroke()
  ctx.setLineDash([])
  // ступени
  const stepPx = 25 * view.scale
  const alongW = o.h >= o.w
  if (stepPx >= 7) {
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    if (alongW) {
      for (let y = -hpx / 2 + stepPx; y < hpx / 2 - 2; y += stepPx) {
        ctx.moveTo(-wpx / 2 + 2, y)
        ctx.lineTo(wpx / 2 - 2, y)
      }
    } else {
      for (let x = -wpx / 2 + stepPx; x < wpx / 2 - 2; x += stepPx) {
        ctx.moveTo(x, -hpx / 2 + 2)
        ctx.lineTo(x, hpx / 2 - 2)
      }
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Внутренние стены-перегородки: полилинии + длины сегментов */
function drawPartitions(
  ctx: CanvasRenderingContext2D,
  partitions: Partition[],
  view: { scale: number; ox: number; oy: number },
  ui: DrawUI,
) {
  const toPx = (p: Pt) => ({ x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy })
  for (const part of partitions) {
    if (part.pts.length < 2) continue
    const sel = part.id === ui.selectedPartitionId
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (sel) {
      ctx.shadowColor = 'rgba(232, 115, 12, 0.5)'
      ctx.shadowBlur = 10
    }
    ctx.strokeStyle = sel ? COLORS.accentDark : COLORS.wall
    ctx.lineWidth = sel ? 4.5 : 4
    ctx.beginPath()
    part.pts.forEach((p, i) => {
      const q = toPx(p)
      if (i === 0) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    })
    ctx.stroke()
    ctx.restore()
  }
  // длины сегментов — поверх линий
  for (const part of partitions) {
    if (part.pts.length < 2) continue
    for (let i = 0; i < part.pts.length - 1; i++) {
      const a = part.pts[i]
      const b = part.pts[i + 1]
      const ax = a.x * view.scale + view.ox
      const ay = a.y * view.scale + view.oy
      const bx = b.x * view.scale + view.ox
      const by = b.y * view.scale + view.oy
      if (Math.hypot(bx - ax, by - ay) < 46) continue
      const ang = Math.atan2(by - ay, bx - ax)
      const nx = Math.cos(ang + Math.PI / 2) * 13
      const ny = Math.sin(ang + Math.PI / 2) * 13
      drawLabel(ctx, fmtLen(Math.hypot(b.x - a.x, b.y - a.y)), (ax + bx) / 2 + nx, (ay + by) / 2 + ny)
    }
  }
}

/** Выноска-размер */
function drawDimension(ctx: CanvasRenderingContext2D, d: Dimension, view: { scale: number; ox: number; oy: number }, selected: boolean) {
  const ax = d.a.x * view.scale + view.ox
  const ay = d.a.y * view.scale + view.oy
  const bx = d.b.x * view.scale + view.ox
  const by = d.b.y * view.scale + view.oy
  const ang = Math.atan2(by - ay, bx - ax)
  const nx = Math.cos(ang + Math.PI / 2)
  const ny = Math.sin(ang + Math.PI / 2)
  ctx.save()
  ctx.strokeStyle = selected ? COLORS.accentDark : COLORS.dim
  ctx.lineWidth = selected ? 2 : 1.5
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  // засечки на концах
  ctx.moveTo(ax - nx * 6, ay - ny * 6)
  ctx.lineTo(ax + nx * 6, ay + ny * 6)
  ctx.moveTo(bx - nx * 6, by - ny * 6)
  ctx.lineTo(bx + nx * 6, by + ny * 6)
  ctx.stroke()
  // точки
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ]) {
    ctx.beginPath()
    ctx.arc(x, y, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.stroke()
  }
  ctx.restore()
  const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
  drawLabel(ctx, fmtLen(len), (ax + bx) / 2 + nx * 14, (ay + by) / 2 + ny * 14, { accent: selected })
}

function drawGrid(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, doc: PlannerDoc, view: { scale: number; ox: number; oy: number }) {
  const stepPx = doc.gridStep * view.scale
  if (stepPx >= 6) {
    ctx.strokeStyle = COLORS.gridMinor
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = view.ox % stepPx; x < cssW; x += stepPx) {
      ctx.moveTo(Math.floor(x) + 0.5, 0)
      ctx.lineTo(Math.floor(x) + 0.5, cssH)
    }
    for (let y = view.oy % stepPx; y < cssH; y += stepPx) {
      ctx.moveTo(0, Math.floor(y) + 0.5)
      ctx.lineTo(cssW, Math.floor(y) + 0.5)
    }
    ctx.stroke()
  }
  const majorPx = 100 * view.scale
  if (majorPx >= 10 && majorPx !== stepPx) {
    ctx.strokeStyle = COLORS.gridMajor
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = view.ox % majorPx; x < cssW; x += majorPx) {
      ctx.moveTo(Math.floor(x) + 0.5, 0)
      ctx.lineTo(Math.floor(x) + 0.5, cssH)
    }
    for (let y = view.oy % majorPx; y < cssH; y += majorPx) {
      ctx.moveTo(0, Math.floor(y) + 0.5)
      ctx.lineTo(cssW, Math.floor(y) + 0.5)
    }
    ctx.stroke()
  }
}

function pathPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], view: { scale: number; ox: number; oy: number }) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const x = p.x * view.scale + view.ox
    const y = p.y * view.scale + view.oy
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts?: { accent?: boolean }) {
  ctx.save()
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  roundRectPath(ctx, x - w / 2 - 4, y - 8, w + 8, 16, 7)
  ctx.fill()
  ctx.fillStyle = opts?.accent ? COLORS.accentDark : COLORS.text
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawScaleBar(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, scale: number) {
  const candidates = [25, 50, 100, 200, 250, 500, 1000, 2000]
  let len = candidates[candidates.length - 1]
  for (const c of candidates) {
    if (c * scale >= 60 && c * scale <= 170) {
      len = c
      break
    }
  }
  const px = len * scale
  const x = 18
  const y = cssH - 22
  ctx.save()
  ctx.strokeStyle = COLORS.text
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + px, y)
  ctx.moveTo(x, y - 4)
  ctx.lineTo(x, y + 4)
  ctx.moveTo(x + px, y - 4)
  ctx.lineTo(x + px, y + 4)
  ctx.stroke()
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = COLORS.text
  ctx.textAlign = 'center'
  ctx.fillText(fmtLen(len), x + px / 2, y - 10)
  ctx.restore()
}

export function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  u: Underlay,
  view: { scale: number; ox: number; oy: number },
  ui: DrawUI,
) {
  const wPx = u.w * view.scale
  const hPx = u.h * view.scale
  const cx = u.x * view.scale + view.ox
  const cy = u.y * view.scale + view.oy
  const img = getUnderlayImage(u.src, ui.onImageLoad)
  if (img) {
    ctx.save()
    ctx.globalAlpha = Math.max(0.05, Math.min(1, u.opacity))
    ctx.translate(cx, cy)
    ctx.rotate((u.angle * Math.PI) / 180)
    ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx)
    ctx.restore()
  }
  if (ui.underlaySelected) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((u.angle * Math.PI) / 180)
    ctx.strokeStyle = COLORS.accentDark
    ctx.lineWidth = 1.6
    ctx.setLineDash([8, 6])
    ctx.strokeRect(-wPx / 2 - 4, -hPx / 2 - 4, wPx + 8, hPx + 8)
    ctx.setLineDash([])
    // угловые маркеры
    const hw = wPx / 2 + 4
    const hh = hPx / 2 + 4
    for (const [sx, sy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]) {
      ctx.beginPath()
      ctx.arc(sx, sy, 4, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.accent
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#FFFFFF'
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ---------- маркер камеры ----------

const CAM_WEDGE_R = 150 // радиус сектора обзора, см
const CAM_HALF_FOV = 32.5 // половина угла обзора, град (обзор 65°)

/** Маркер камеры на плане: сектор обзора, корпус с объективом и указатель направления */
function drawCameraMark(
  ctx: CanvasRenderingContext2D,
  cam: { x: number; y: number; angle: number },
  view: { scale: number; ox: number; oy: number },
  opts: { ghost?: boolean; active?: boolean },
) {
  const px = cam.x * view.scale + view.ox
  const py = cam.y * view.scale + view.oy
  const rad = (cam.angle * Math.PI) / 180
  const half = (CAM_HALF_FOV * Math.PI) / 180
  const r = CAM_WEDGE_R * view.scale
  // план угол φ (0 — вверх, по часовой) → канвас-угол φ − 90°
  const a1 = rad - Math.PI / 2 - half
  const a2 = rad - Math.PI / 2 + half

  ctx.save()
  if (opts.ghost) {
    ctx.globalAlpha = 0.75
    ctx.setLineDash([7, 5])
  }

  // сектор обзора
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.arc(px, py, r, a1, a2)
  ctx.closePath()
  ctx.fillStyle = 'rgba(232,115,12,0.14)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(232,115,12,0.65)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.setLineDash([])

  // указатель направления
  const tx = px + Math.cos(rad - Math.PI / 2) * 17
  const ty = py + Math.sin(rad - Math.PI / 2) * 17
  ctx.strokeStyle = '#3D3428'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  const hx = px + Math.cos(rad - Math.PI / 2 + 2.5) * 12
  const hy = py + Math.sin(rad - Math.PI / 2 + 2.5) * 12
  ctx.beginPath()
  ctx.arc(hx, hy, 2.4, 0, Math.PI * 2)
  ctx.fillStyle = '#3D3428'
  ctx.fill()

  // корпус с объективом
  ctx.beginPath()
  ctx.arc(px, py, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#E8730C'
  ctx.fill()
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(px, py, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  // подсветка активного инструмента
  if (opts.active) {
    ctx.beginPath()
    ctx.arc(px, py, 15, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(232,115,12,0.8)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
  }
  ctx.restore()
}

/** Полная отрисовка сцены. Ожидается, что ctx уже масштабирован под devicePixelRatio. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  doc: PlannerDoc,
  view: { scale: number; ox: number; oy: number },
  ui: DrawUI,
) {
  presetImgLoadCb = ui.onImageLoad ?? null
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, cssW, cssH)

  const floor = doc.floors.find((f) => f.id === doc.currentFloorId) ?? doc.floors[0]
  if (!floor) return
  const floorIdx = doc.floors.indexOf(floor)
  const vis: LayerVis = { ...DEFAULT_LAYERS, ...(doc.layers ?? {}) }
  const layerOn = (o: PlannerObject) => vis[o.layer ?? 'furniture']

  const hasRoom = !!(floor.room && floor.room.length >= 3)
  const hasUnderlay = !!(floor.underlay && floor.underlay.visible)

  // Порядок слоёв при подложке: заливка комнаты → подложка → сетка → стены
  if (hasUnderlay && hasRoom) {
    pathPolygon(ctx, floor.room!, view)
    ctx.closePath()
    ctx.save()
    ctx.shadowColor = 'rgba(74, 64, 54, 0.12)'
    ctx.shadowBlur = 16
    ctx.fillStyle = COLORS.roomFill
    ctx.fill()
    ctx.restore()
  }

  if (hasUnderlay && floor.underlay) drawUnderlay(ctx, floor.underlay, view, ui)

  if (ui.showGrid) drawGrid(ctx, cssW, cssH, doc, view)

  // Комната
  if (hasRoom && floor.room) {
    pathPolygon(ctx, floor.room, view)
    ctx.closePath()
    if (!hasUnderlay) {
      ctx.save()
      ctx.shadowColor = 'rgba(74, 64, 54, 0.12)'
      ctx.shadowBlur = 16
      ctx.fillStyle = COLORS.roomFill
      ctx.fill()
      ctx.restore()
    }
    ctx.strokeStyle = COLORS.wall
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.stroke()

    // длины стен
    const n = floor.room.length
    for (let i = 0; i < n; i++) {
      const a = floor.room[i]
      const b = floor.room[(i + 1) % n]
      const ax = a.x * view.scale + view.ox
      const ay = a.y * view.scale + view.oy
      const bx = b.x * view.scale + view.ox
      const by = b.y * view.scale + view.oy
      const segPx = Math.hypot(bx - ax, by - ay)
      if (segPx < 46) continue
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      const ang = Math.atan2(by - ay, bx - ax)
      const nx = Math.cos(ang + Math.PI / 2) * 16
      const ny = Math.sin(ang + Math.PI / 2) * 16
      drawLabel(ctx, fmtLen(Math.hypot(b.x - a.x, b.y - a.y)), mx + nx, my + ny)
    }
  }

  // Перегородки
  if (floor.partitions.length > 0) drawPartitions(ctx, floor.partitions, view, ui)

  // Лестницы с нижних этажей — целиком
  for (let i = 0; i < floorIdx; i++) {
    for (const o of doc.floors[i].objects) {
      if (isStairs(o) && layerOn(o)) drawObject(ctx, o, view, false)
    }
  }

  // Призраки лестниц текущего этажа (пунктир) — под объектами
  for (const o of floor.objects) {
    if (isStairs(o)) drawStairsGhost(ctx, o, view)
  }

  // Объекты текущего этажа (лестницы уже нарисованы пунктиром)
  for (const o of floor.objects) {
    if (isStairs(o)) continue
    if (!layerOn(o)) continue
    drawObject(ctx, o, view, o.id === ui.selectedId)
  }

  // Выноски-размеры
  for (const d of floor.dimensions) {
    drawDimension(ctx, d, view, d.id === ui.selectedDimensionId)
  }

  // Камера для 3D-снимка и призрак установки
  if (floor.camera) drawCameraMark(ctx, floor.camera, view, { active: ui.cameraTool === true })
  if (ui.cameraGhost) drawCameraMark(ctx, ui.cameraGhost, view, { ghost: true })

  // Рисование стен/перегородок/размера в процессе
  if (ui.drawingPts && ui.drawingPts.length > 0) {
    const pts = ui.drawingPts
    const isPartition = ui.drawingMode === 'partition'
    ctx.save()
    ctx.strokeStyle = COLORS.accentDark
    ctx.lineWidth = 3
    ctx.setLineDash([8, 6])
    pathPolygon(ctx, pts, view)
    ctx.stroke()
    ctx.setLineDash([])
    if (ui.cursor) {
      const last = pts[pts.length - 1]
      ctx.beginPath()
      ctx.moveTo(last.x * view.scale + view.ox, last.y * view.scale + view.oy)
      ctx.lineTo(ui.cursor.x * view.scale + view.ox, ui.cursor.y * view.scale + view.oy)
      ctx.stroke()
      if (pts.length >= 1) {
        drawLabel(ctx, fmtLen(Math.hypot(ui.cursor.x - last.x, ui.cursor.y - last.y)), (last.x * view.scale + view.ox + ui.cursor.x * view.scale + view.ox) / 2, (last.y * view.scale + view.oy + ui.cursor.y * view.scale + view.oy) / 2, { accent: true })
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      drawLabel(ctx, fmtLen(Math.hypot(b.x - a.x, b.y - a.y)), (a.x * view.scale + view.ox + b.x * view.scale + view.ox) / 2, (a.y * view.scale + view.oy + b.y * view.scale + view.oy) / 2)
    }
    // маркеры точек: у комнаты подсвечивается первая (замыкание), у перегородки — последняя (завершение)
    pts.forEach((p, i) => {
      const x = p.x * view.scale + view.ox
      const y = p.y * view.scale + view.oy
      const near = !!ui.cursor && Math.hypot(ui.cursor.x - p.x, ui.cursor.y - p.y) * view.scale < 12
      const closable = isPartition
        ? i === pts.length - 1 && pts.length >= 2 && near
        : ui.drawingMode === 'room'
          ? i === 0 && pts.length >= 3 && near
          : false
      ctx.beginPath()
      ctx.arc(x, y, closable ? 9 : 6, 0, Math.PI * 2)
      ctx.fillStyle = closable ? COLORS.accent : '#FFFFFF'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = COLORS.accentDark
      ctx.stroke()
    })
    ctx.restore()
  }

  // Ручки вершин комнаты
  if (ui.showVertexHandles && floor.room && !ui.drawingPts) {
    floor.room.forEach((p, i) => {
      const x = p.x * view.scale + view.ox
      const y = p.y * view.scale + view.oy
      const active = ui.draggingVertex === i
      ctx.beginPath()
      ctx.arc(x, y, active ? 8 : 5.5, 0, Math.PI * 2)
      ctx.fillStyle = active ? COLORS.accent : '#FFFFFF'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = COLORS.accentDark
      ctx.stroke()
    })
  }

  // Ручки вершин выбранной перегородки
  if (ui.selectedPartitionId && !ui.drawingPts) {
    const part = floor.partitions.find((p) => p.id === ui.selectedPartitionId)
    if (part) {
      part.pts.forEach((p, i) => {
        const x = p.x * view.scale + view.ox
        const y = p.y * view.scale + view.oy
        const active = ui.draggingPartitionVertex === i
        ctx.beginPath()
        ctx.arc(x, y, active ? 8 : 5.5, 0, Math.PI * 2)
        ctx.fillStyle = active ? COLORS.accent : '#FFFFFF'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = COLORS.accentDark
        ctx.stroke()
      })
    }
  }

  // Ручка поворота выбранного объекта (только если его слой виден)
  const sel = floor.objects.find((o) => o.id === ui.selectedId && (vis[o.layer ?? 'furniture'] || isStairs(o)))
  if (sel) {
    const handleOffsetCm = 26 / view.scale
    const hp = rotateHandlePos(sel, handleOffsetCm)
    const hx = hp.x * view.scale + view.ox
    const hy = hp.y * view.scale + view.oy
    const rad = (sel.angle * Math.PI) / 180
    const topX = (sel.x - Math.sin(rad) * (sel.h / 2)) * view.scale + view.ox
    const topY = (sel.y - Math.cos(rad) * (sel.h / 2)) * view.scale + view.oy
    ctx.save()
    ctx.strokeStyle = COLORS.accentDark
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(topX, topY)
    ctx.lineTo(hx, hy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(hx, hy, 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.accent
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  // Призрак размещаемого объекта
  if (ui.ghost) {
    ctx.save()
    ctx.globalAlpha = 0.55
    drawObject(ctx, ui.ghost, view, false)
    ctx.restore()
  }

  // Рулетка
  if (ui.ruler) {
    const { a, b } = ui.ruler
    const ax = a.x * view.scale + view.ox
    const ay = a.y * view.scale + view.oy
    const bx = b.x * view.scale + view.ox
    const by = b.y * view.scale + view.oy
    ctx.save()
    ctx.strokeStyle = COLORS.accent
    ctx.lineWidth = 2
    ctx.setLineDash([9, 6])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.setLineDash([])
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
    ]) {
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.restore()
    drawLabel(ctx, fmtLen(Math.hypot(b.x - a.x, b.y - a.y)), (ax + bx) / 2, (ay + by) / 2 - 16, { accent: true })
  }

  drawScaleBar(ctx, cssW, cssH, view.scale)
}
