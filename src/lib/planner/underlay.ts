import type { PlannerDoc, Underlay, View } from './types'
import { currentFloor } from './types'
import { objectsBBox, pointsBBox, screenToPlan, unionBBox } from './geometry'

/** Максимальный размер изображения-подложки по большей стороне, px (экономия localStorage) */
const MAX_IMG_PX = 2000

export interface UnderlaySource {
  src: string
  imgW: number
  imgH: number
  bytes: number
}

function readAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('bad image'))
    }
    img.src = url
  })
}

/**
 * Читает файл картинки, при необходимости уменьшает до MAX_IMG_PX
 * и возвращает data URL (PNG для чётких схем, JPEG для фото — что компактнее).
 */
export async function fileToUnderlaySource(file: File): Promise<UnderlaySource> {
  const img = await readAsImage(file)
  const k = Math.min(1, MAX_IMG_PX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  // белая подложка — на случай прозрачных PNG
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  const jpeg = canvas.toDataURL('image/jpeg', 0.9)
  const png = canvas.toDataURL('image/png')
  // PNG предпочитаем, пока он не слишком тяжелее JPEG (чёткие линии схем)
  const src = png.length <= jpeg.length * 1.35 ? png : jpeg
  return { src, imgW: w, imgH: h, bytes: Math.round(src.length * 0.75) }
}

/** Куда и какого размера положить новую подложку: вписать в комнату/объекты или в видимую область */
export function computeUnderlayPlacement(
  imgW: number,
  imgH: number,
  doc: PlannerDoc,
  size: { w: number; h: number },
  view: View,
): { x: number; y: number; w: number; h: number } {
  const fl = currentFloor(doc)
  const bbox = unionBBox(fl.room && fl.room.length >= 3 ? pointsBBox(fl.room) : null, objectsBBox(fl.objects))
  let tw: number
  let th: number
  let cx: number
  let cy: number
  if (bbox) {
    tw = Math.max(50, bbox.maxX - bbox.minX)
    th = Math.max(50, bbox.maxY - bbox.minY)
    cx = (bbox.minX + bbox.maxX) / 2
    cy = (bbox.minY + bbox.maxY) / 2
  } else {
    const c = screenToPlan(size.w / 2, size.h / 2, view)
    tw = (size.w * 0.8) / Math.max(view.scale, 0.01)
    th = (size.h * 0.8) / Math.max(view.scale, 0.01)
    cx = c.x
    cy = c.y
  }
  const k = Math.min(tw / imgW, th / imgH)
  return { x: cx, y: cy, w: Math.round(imgW * k), h: Math.round(imgH * k) }
}

// ---------- история: не храним копию data URL в каждом снапшоте ----------

let poolCounter = 0
const tokenToSrc = new Map<string, string>()
const srcToToken = new Map<string, string>()

function tokenFor(src: string): string {
  let t = srcToToken.get(src)
  if (!t) {
    poolCounter += 1
    t = `@@src#${poolCounter}`
    srcToToken.set(src, t)
    tokenToSrc.set(t, src)
  }
  return t
}

/** Сериализация doc для истории: data URL подложки заменяется на короткий токен */
export function packDocForHistory(doc: PlannerDoc): string {
  return JSON.stringify(doc, (key, value) => {
    if (key === 'src' && typeof value === 'string' && value.startsWith('data:image/')) {
      return tokenFor(value)
    }
    return value
  })
}

/** Обратная распаковка снапшота истории: восстанавливаем data URL подложек во всех этажах */
export function unpackDocFromHistory(raw: string): PlannerDoc {
  const doc = JSON.parse(raw) as PlannerDoc
  const fix = (u: Underlay | null): Underlay | null => {
    if (u && typeof u.src === 'string' && u.src.startsWith('@@src#')) {
      const src = tokenToSrc.get(u.src)
      return src ? { ...u, src } : null
    }
    return u
  }
  if (Array.isArray(doc?.floors)) {
    for (const f of doc.floors) f.underlay = fix(f.underlay ?? null)
  }
  if (doc && 'underlay' in doc) {
    // на случай старых снапшотов с подложкой верхнего уровня
    const legacy = fix((doc as unknown as { underlay: Underlay | null }).underlay)
    if (legacy && Array.isArray(doc.floors) && doc.floors[0] && !doc.floors[0].underlay) {
      doc.floors[0].underlay = legacy
    }
  }
  return doc
}
