import type { Floor, PlannerDoc } from './types'
import { normalizeDoc } from './migrate'
import { currentFloor } from './types'
import { objectsBBox, pointsBBox, rectCorners, unionBBox } from './geometry'
import { drawScene, preloadPresetImages, preloadUnderlayImage } from './draw'
import { buildRenderBrief } from './brief'

export interface SaveFile {
  version: number
  doc: PlannerDoc
  showGrid: boolean
  /** автогенерированный текстовый бриф для 3D-визуализатора (v3) */
  brief?: string
}

export function makeSaveFile(doc: PlannerDoc, showGrid: boolean): SaveFile {
  return { version: 3, doc, showGrid, brief: buildRenderBrief(doc) }
}

/**
 * Валидация файла проекта / автосохранения.
 * Принимает новые (v3, v2 — многоэтажные) и все старые форматы — см. migrate.normalizeDoc.
 */
export function validateSaveFile(data: unknown): PlannerDoc | null {
  return normalizeDoc(data)
}

export function download(blob: Blob, filename: string) {
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

/**
 * Рендер одного этажа в canvas для экспорта PNG и PDF:
 * план по bbox (комната + объекты + перегородки + размеры + подложка)
 * и нижняя полоса с площадью и названием этажа.
 */
async function renderFloorCanvas(doc: PlannerDoc, floor: Floor): Promise<HTMLCanvasElement> {
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
  if (!ctx) throw new Error('canvas 2d недоступен')

  // ждём загрузку картинки подложки, чтобы она гарантированно попала в экспорт
  if (floor.underlay?.visible) {
    try {
      await preloadUnderlayImage(floor.underlay.src)
    } catch {
      // без подложки, но план всё равно экспортируем
    }
  }
  // картинки-схемы пресетов («Клён») тоже должны быть готовы
  await preloadPresetImages()

  // заливаем весь холст фоном (включая нижнюю полосу с подписью)
  ctx.fillStyle = '#FBF7EF'
  ctx.fillRect(0, 0, cssW, cssH)

  const view = { scale, ox: -minX * scale, oy: -minY * scale }
  drawScene(ctx, cssW, cssH - stripH, { ...doc, currentFloorId: floor.id }, view, {
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

  return canvas
}

export async function exportPNG(doc: PlannerDoc) {
  const canvas = await renderFloorCanvas(doc, currentFloor(doc))
  canvas.toBlob((blob) => {
    if (blob) download(blob, 'plan-pomeshcheniya.png')
  }, 'image/png')
}

/** Экспорт в PDF: каждый этаж — отдельная страница A4 (ориентация по форме плана) */
export async function exportPDF(doc: PlannerDoc) {
  const pages: { w: number; h: number; jpeg: string }[] = []
  for (const floor of doc.floors) {
    const canvas = await renderFloorCanvas(doc, floor)
    pages.push({ w: canvas.width, h: canvas.height, jpeg: canvas.toDataURL('image/jpeg', 0.92) })
  }
  const bytes = buildPdf(pages)
  download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'plan-pomeshcheniya.pdf')
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

// ---------------------------------------------------------------------------
// Минимальный сборщик PDF без внешних библиотек.
// План каждого этажа встраивается как JPEG (DCTDecode, DeviceRGB) на страницу
// A4 с полями ~10 мм; ориентация страницы выбирается по форме плана.
// Подписи уже отрисованы на самом изображении, поэтому текст в PDF не нужен —
// кириллица корректно отображается в любом просмотрщике.
// ---------------------------------------------------------------------------

const PDF_A4 = { w: 595, h: 842 } // размер в пунктах (1/72 дюйма)
const PDF_MARGIN = 28 // ~10 мм

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function b64Bytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function buildPdf(pages: { w: number; h: number; jpeg: string }[]): Uint8Array {
  const chunks: Uint8Array[] = []
  let offset = 0
  const offsets: number[] = []
  const push = (u8: Uint8Array) => {
    chunks.push(u8)
    offset += u8.length
  }
  const text = (s: string) => push(latin1(s))
  // объект с текстовым телом: запоминаем смещение для xref
  const obj = (num: number, body: string) => {
    offsets[num] = offset
    text(`${num} 0 obj\n${body}`)
    text('endobj\n')
  }

  // заголовок + бинарная метка (используем только байты latin1)
  text('%PDF-1.4\n%âãÏÓ\n')

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>\n')
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(2, `<< /Type /Pages /Kids [ ${kids} ] /Count ${pages.length} >>\n`)

  pages.forEach((p, i) => {
    const pageObj = 3 + i * 3
    const imgObj = pageObj + 1
    const contObj = pageObj + 2

    // ориентация A4 под аспект плана
    const pw = p.w > p.h ? PDF_A4.h : PDF_A4.w
    const ph = p.w > p.h ? PDF_A4.w : PDF_A4.h
    const k = Math.min((pw - 2 * PDF_MARGIN) / p.w, (ph - 2 * PDF_MARGIN) / p.h)
    const dw = (p.w * k).toFixed(2)
    const dh = (p.h * k).toFixed(2)
    const dx = ((pw - p.w * k) / 2).toFixed(2)
    const dy = ((ph - p.h * k) / 2).toFixed(2)

    const jpeg = b64Bytes(p.jpeg.slice(p.jpeg.indexOf(',') + 1))

    obj(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${pw} ${ph} ] ` +
        `/Resources << /XObject << /Im${i} ${imgObj} 0 R >> /ProcSet [ /PDF /ImageC ] >> ` +
        `/Contents ${contObj} 0 R >>\n`,
    )

    // бинарный объект-картинка
    offsets[imgObj] = offset
    text(
      `${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    )
    push(jpeg)
    text('\nendstream\n')
    text('endobj\n')

    const content = `q ${dw} 0 0 ${dh} ${dx} ${dy} cm /Im${i} Do Q`
    obj(contObj, `<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`)
  })

  const size = 3 + pages.length * 3
  const xrefStart = offset
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let i = 1; i < size; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  text(xref)

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}
