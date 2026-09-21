import type { PlannerDoc } from './types'
import { normalizeDoc } from './migrate'
import { currentFloor } from './types'
import { objectsBBox, pointsBBox, rectCorners, unionBBox } from './geometry'
import { drawScene, preloadUnderlayImage } from './draw'

export interface SaveFile {
  version: number
  doc: PlannerDoc
  showGrid: boolean
}

export function makeSaveFile(doc: PlannerDoc, showGrid: boolean): SaveFile {
  return { version: 2, doc, showGrid }
}

/**
 * Валидация файла проекта / автосохранения.
 * Принимает новые (v2, многоэтажные) и все старые форматы — см. migrate.normalizeDoc.
 */
export function validateSaveFile(data: unknown): PlannerDoc | null {
  return normalizeDoc(data)
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

export async function exportPNG(doc: PlannerDoc) {
  const floor = currentFloor(doc)
  const roomBbox = floor.room && floor.room.length >= 3 ? pointsBBox(floor.room) : null
  const objBbox = objectsBBox(floor.objects)
  const partBbox = floor.partitions.length > 0 ? pointsBBox(floor.partitions.flatMap((p) => p.pts)) : null
  const dimBbox = floor.dimensions.length > 0 ? pointsBBox(floor.dimensions.flatMap((d) => [d.a, d.b])) : null
  const underlayBbox = floor.underlay?.visible ? pointsBBox(rectCorners(floor.underlay)) : null
  const bbox = unionBBox(unionBBox(unionBBox(unionBBox(roomBbox, objBbox), partBbox), dimBbox), underlayBbox)
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

  // ждём загрузку картинки подложки, чтобы она гарантированно попала в PNG
  if (floor.underlay?.visible) {
    try {
      await preloadUnderlayImage(floor.underlay.src)
    } catch {
      // без подложки, но план всё равно экспортируем
    }
  }

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
    underlaySelected: false,
    selectedPartitionId: null,
    draggingPartitionVertex: null,
    drawingMode: 'room',
    layers: doc.layers,
    selectedDimensionId: null,
    ruler: null,
  })

  // подпись с площадью и этажом
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
  const label = floor.room && floor.room.length >= 3 ? `Площадь помещения: ${fmtAreaLabel(polysArea(floor.room))}` : 'План помещения'
  ctx.fillText(label, 20, cssH - stripH / 2 - 18)
  ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#8B7D6B'
  ctx.textAlign = 'right'
  ctx.fillText(floor.name, cssW - 20, cssH - stripH / 2 + 20)
  ctx.restore()

  canvas.toBlob((blob) => {
    if (blob) download(blob, 'plan-pomeshcheniya.png')
  }, 'image/png')
}

function polysArea(pts: { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}
