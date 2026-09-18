import type { PlannerDoc, PlannerObject } from './types'
import { objectsBBox, pointsBBox, unionBBox } from './geometry'
import { drawScene } from './draw'

export interface SaveFile {
  version: number
  doc: PlannerDoc
  showGrid: boolean
}

export function makeSaveFile(doc: PlannerDoc, showGrid: boolean): SaveFile {
  return { version: 1, doc, showGrid }
}

export function validateSaveFile(data: unknown): PlannerDoc | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<SaveFile>
  const doc = d.doc
  if (!doc || typeof doc !== 'object') return null
  const room =
    doc.room === null
      ? null
      : Array.isArray(doc.room) && doc.room.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
        ? doc.room
        : null
  const objects = Array.isArray(doc.objects)
    ? doc.objects.filter(
        (o): o is PlannerObject =>
          !!o && typeof o.id === 'string' && typeof o.x === 'number' && typeof o.y === 'number' && typeof o.w === 'number' && typeof o.h === 'number',
      )
    : []
  const gridStep = typeof doc.gridStep === 'number' && doc.gridStep > 0 ? doc.gridStep : 25
  return { room, objects, gridStep }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export function exportJSON(doc: PlannerDoc, showGrid: boolean) {
  const file = makeSaveFile(doc, showGrid)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  download(blob, 'plan-pomeshcheniya.json')
}

function fmtAreaLabel(cm2: number): string {
  return `${(cm2 / 10000).toFixed(1).replace('.', ',')} м²`
}

export function exportPNG(doc: PlannerDoc) {
  const bbox = unionBBox(doc.room && doc.room.length >= 3 ? pointsBBox(doc.room) : null, objectsBBox(doc.objects))
  const pad = 60
  let minX = 0
  let minY = 0
  let maxX = 800
  let maxY = 600
  if (bbox) {
    minX = bbox.minX - pad
    minY = bbox.minY - pad
    maxX = bbox.maxX + pad
    maxY = bbox.maxY + pad
  }
  const wCm = maxX - minX
  const hCm = maxY - minY
  const targetPx = 1800
  const scale = Math.min(3, Math.max(0.4, targetPx / Math.max(wCm, hCm)))
  const cssW = Math.round(wCm * scale)
  const stripH = 64
  const cssH = Math.round(hCm * scale) + stripH

  const canvas = document.createElement('canvas')
  canvas.width = cssW
  canvas.height = cssH
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // заливаем весь холст фоном (включая нижнюю полосу с подписью)
  ctx.fillStyle = '#FBF7EF'
  ctx.fillRect(0, 0, cssW, cssH)

  const view = { scale, ox: -minX * scale, oy: -minY * scale }
  drawScene(ctx, cssW, cssH - stripH, { ...doc }, view, {
    showGrid: false,
    selectedId: null,
    drawingPts: null,
    cursor: null,
    ghost: null,
    draggingVertex: null,
    showVertexHandles: false,
  })

  // подпись с площадью
  if (doc.room && doc.room.length >= 3) {
    let area = 0
    for (let i = 0; i < doc.room.length; i++) {
      const a = doc.room[i]
      const b = doc.room[(i + 1) % doc.room.length]
      area += a.x * b.y - b.x * a.y
    }
    area = Math.abs(area) / 2
    ctx.save()
    ctx.strokeStyle = '#D8CBB6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(20, cssH - stripH / 2)
    ctx.lineTo(cssW - 20, cssH - stripH / 2)
    ctx.stroke()
    ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#6B5D4F'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`Площадь помещения: ${fmtAreaLabel(area)}`, 20, cssH - stripH / 2 - 18)
    ctx.restore()
  }

  canvas.toBlob((blob) => {
    if (blob) download(blob, 'plan-pomeshcheniya.png')
  }, 'image/png')
}
