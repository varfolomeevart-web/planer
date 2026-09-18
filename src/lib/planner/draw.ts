import type { PlannerDoc, PlannerObject, Pt, Underlay } from './types'
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
 * Рисует глиф мебели в локальных координатах (центр 0,0).
 * Контекст уже перенесён/повёрнут; внутри применяется scale.
 */
export function drawGlyph(ctx: CanvasRenderingContext2D, presetId: string, color: string, w: number, h: number, scale: number) {
  const lw = 1.4 / scale
  const lw2 = 1 / scale
  ctx.save()
  ctx.scale(scale, scale)
  ctx.lineWidth = lw
  ctx.strokeStyle = COLORS.detail
  ctx.fillStyle = color

  const hw = w / 2
  const hh = h / 2
  const min = Math.min(w, h)

  const base = (r = 3) => {
    roundRectPath(ctx, -hw, -hh, w, h, r)
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

function drawObject(ctx: CanvasRenderingContext2D, o: PlannerObject, view: { scale: number; ox: number; oy: number }, selected: boolean) {
  const sx = o.x * view.scale + view.ox
  const sy = o.y * view.scale + view.oy
  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate((o.angle * Math.PI) / 180)
  if (selected) {
    ctx.save()
    ctx.shadowColor = 'rgba(232, 115, 12, 0.55)'
    ctx.shadowBlur = 14
    ctx.scale(view.scale, view.scale)
    ctx.fillStyle = 'transparent'
    ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h)
    ctx.restore()
  }
  drawGlyph(ctx, o.presetId, o.color, o.w, o.h, view.scale)
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

function drawUnderlay(
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

/** Полная отрисовка сцены. Ожидается, что ctx уже масштабирован под devicePixelRatio. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  doc: PlannerDoc,
  view: { scale: number; ox: number; oy: number },
  ui: DrawUI,
) {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, cssW, cssH)

  const hasRoom = !!(doc.room && doc.room.length >= 3)
  const hasUnderlay = !!(doc.underlay && doc.underlay.visible)

  // Порядок слоёв при подложке: заливка комнаты → подложка → сетка → стены
  if (hasUnderlay && hasRoom) {
    pathPolygon(ctx, doc.room!, view)
    ctx.closePath()
    ctx.save()
    ctx.shadowColor = 'rgba(74, 64, 54, 0.12)'
    ctx.shadowBlur = 16
    ctx.fillStyle = COLORS.roomFill
    ctx.fill()
    ctx.restore()
  }

  if (hasUnderlay && doc.underlay) drawUnderlay(ctx, doc.underlay, view, ui)

  if (ui.showGrid) drawGrid(ctx, cssW, cssH, doc, view)

  // Комната
  if (hasRoom && doc.room) {
    pathPolygon(ctx, doc.room, view)
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
    const n = doc.room.length
    for (let i = 0; i < n; i++) {
      const a = doc.room[i]
      const b = doc.room[(i + 1) % n]
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

  // Объекты
  for (const o of doc.objects) {
    drawObject(ctx, o, view, o.id === ui.selectedId)
  }

  // Рисование стен в процессе
  if (ui.drawingPts && ui.drawingPts.length > 0) {
    const pts = ui.drawingPts
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
      if (pts.length >= 2) {
        drawLabel(ctx, fmtLen(Math.hypot(ui.cursor.x - last.x, ui.cursor.y - last.y)), (last.x * view.scale + view.ox + ui.cursor.x * view.scale + view.ox) / 2, (last.y * view.scale + view.oy + ui.cursor.y * view.scale + view.oy) / 2, { accent: true })
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      drawLabel(ctx, fmtLen(Math.hypot(b.x - a.x, b.y - a.y)), (a.x * view.scale + view.ox + b.x * view.scale + view.ox) / 2, (a.y * view.scale + view.oy + b.y * view.scale + view.oy) / 2)
    }
    // маркеры точек
    pts.forEach((p, i) => {
      const x = p.x * view.scale + view.ox
      const y = p.y * view.scale + view.oy
      const closable = i === 0 && pts.length >= 3 && ui.cursor && Math.hypot(ui.cursor.x - p.x, ui.cursor.y - p.y) * view.scale < 12
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
  if (ui.showVertexHandles && doc.room && !ui.drawingPts) {
    doc.room.forEach((p, i) => {
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

  // Ручка поворота выбранного объекта
  const sel = doc.objects.find((o) => o.id === ui.selectedId)
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

  drawScaleBar(ctx, cssW, cssH, view.scale)
}
