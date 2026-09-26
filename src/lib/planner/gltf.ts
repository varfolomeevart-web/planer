import type { Floor, PlannerDoc, Pt } from './types'
import { currentFloor, partitionThickness } from './types'
import { isDoorWindowPreset } from './presets'
import { buildScene, partitionStyle } from './view3d'
import { download } from './export'

/**
 * Экспорт координатной 3D-модели этажа в GLB (glTF 2.0, binary).
 *
 * Единицы — метры. Оси: X = x плана / 100 (вправо), Z = y плана / 100 (глубина,
 * «вниз плана»), Y = высота / 100 (вверх) — правая тройка, вид сверху совпадает с планом.
 *
 * Состав модели:
 *  — плита пола по контуру помещения (цвет — материал пола, если задан HEX);
 *  — наружные стены объёмом наружу от контура (толщина 20 см принята по умолчанию,
 *    в ТЗ толщина наружных стен не задаётся);
 *  — перегородки объёмом симметрично своей оси с толщиной и конструкцией из ТЗ
 *    (стекло — прозрачный материал);
 *  — мебель/оборудование призмами по собранным частям (view3d.objectParts),
 *    с высотами из спецификации и цветами объектов.
 *
 * Вся геометрия собирается в сантиметрах и переводится в метры при упаковке.
 * Файл открывается в Blender, 3ds Max, SketchUp, Windows 3D Viewer, online glTF-просмотрщиках.
 */

/** Толщина наружных стен в модели, см (в ТЗ не задаётся) */
export const GLB_EXT_WALL_CM = 20
/** Толщина плиты пола, см (вниз от нуля) */
const SLAB_T = 10

/** см → метры с округлением до 0,1 мм */
const M = (cm: number): number => Math.round((cm / 100) * 10000) / 10000

type V3 = [number, number, number]

/* ---------- сборка треугольников по материалам ---------- */

interface Prim {
  label: string
  rgb: [number, number, number]
  alpha: number
  /** плоский массив вершин треугольников, в метрах */
  verts: number[]
}

function parseColor(c: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(c)
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]
  return [0.85, 0.82, 0.76]
}

/** Накопитель треугольников: вход — САНТИМЕТРЫ, хранение — метры */
function makeCollector() {
  const map = new Map<string, Prim>()
  const add = (label: string, hex: string, alpha: number, tri: [V3, V3, V3]) => {
    const key = `${hex}|${alpha}|${label}`
    let pr = map.get(key)
    if (!pr) {
      pr = { label, rgb: parseColor(hex), alpha, verts: [] }
      map.set(key, pr)
    }
    for (const v of tri) pr.verts.push(M(v[0]), M(v[1]), M(v[2]))
  }
  const quad = (label: string, hex: string, alpha: number, p1: V3, p2: V3, p3: V3, p4: V3) => {
    add(label, hex, alpha, [p1, p2, p3])
    add(label, hex, alpha, [p1, p3, p4])
  }
  return { add, quad, list: () => [...map.values()] }
}

/* ---------- триангуляция (ухо-вырезание, полигон в плоскости постоянной высоты) ---------- */

function earClip(poly: V3[]): [V3, V3, V3][] {
  const n = poly.length
  if (n === 3) return [[poly[0], poly[1], poly[2]]]
  if (n < 3) return []
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += poly[i][0] * poly[j][2] - poly[j][0] * poly[i][2]
  }
  const positive = area > 0
  const idx = poly.map((_, i) => i)
  const tris: [V3, V3, V3][] = []
  const cross2 = (o: V3, a: V3, b: V3) => (a[0] - o[0]) * (b[2] - o[2]) - (a[2] - o[2]) * (b[0] - o[0])
  const insideTri = (p: V3, a: V3, b: V3, c: V3) => {
    const d1 = cross2(a, b, p)
    const d2 = cross2(b, c, p)
    const d3 = cross2(c, a, p)
    const neg = d1 < 0 || d2 < 0 || d3 < 0
    const pos = d1 > 0 || d2 > 0 || d3 > 0
    return !(neg && pos)
  }
  let guard = 0
  while (idx.length > 3 && guard++ < n * n + 100) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]
      const i1 = idx[k]
      const i2 = idx[(k + 1) % idx.length]
      const a = poly[i0]
      const b = poly[i1]
      const c = poly[i2]
      const cr = cross2(a, b, c)
      if (cr === 0) continue
      if (positive ? cr < 0 : cr > 0) continue
      let ear = true
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue
        if (insideTri(poly[j], a, b, c)) {
          ear = false
          break
        }
      }
      if (!ear) continue
      tris.push([a, b, c])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (idx.length >= 3) {
    for (let k = 1; k + 1 < idx.length; k++) tris.push([poly[idx[0]], poly[idx[k]], poly[idx[k + 1]]])
  }
  return tris
}

/* ---------- геометрические утилиты (план, см) ---------- */

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Единичная нормаль отрезка a→b, направленная НАРУЖУ от полигона */
function outwardNormal(a: Pt, b: Pt, poly: Pt[]): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const n1 = { x: -dy / len, y: dx / len }
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const probe = { x: mid.x + n1.x * 2, y: mid.y + n1.y * 2 }
  return pointInPoly(probe, poly) ? { x: -n1.x, y: -n1.y } : n1
}

/** срез цены из названия (как в ТЗ): «Стол · HICOLD … · 96 752 ₽» → «Стол · HICOLD …» */
function cleanName(name: string): string {
  return name.replace(/\s*·\s*[\d\s]+\s*₽[^·]*$/, '').trim()
}

/** Призма по плану (см): бока + крышка (+ дно при bottom) */
function addPrismCm(
  add: ReturnType<typeof makeCollector>['add'],
  quad: ReturnType<typeof makeCollector>['quad'],
  label: string,
  hex: string,
  alpha: number,
  plan: Pt[],
  z0: number,
  z1: number,
  opts?: { top?: boolean; bottom?: boolean },
) {
  if (plan.length < 3 || z1 - z0 < 0.5) return
  const top: V3[] = plan.map((p) => [p.x, z1, p.y])
  const bot: V3[] = plan.map((p) => [p.x, z0, p.y])
  const n = plan.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    quad(label, hex, alpha, bot[i], bot[j], top[j], top[i])
  }
  if (opts?.top !== false) for (const t of earClip(top)) add(label, hex, alpha, t)
  if (opts?.bottom) for (const t of earClip(bot.slice().reverse())) add(label, hex, alpha, t)
}

/** Упаковка JSON + BIN в GLB-контейнер */
function packGlb(json: string, bin: Uint8Array): Uint8Array {
  const enc = new TextEncoder()
  const j0 = enc.encode(json)
  const jp = (4 - (j0.length % 4)) % 4
  const jsonBytes = new Uint8Array(j0.length + jp)
  jsonBytes.set(j0)
  jsonBytes.fill(0x20, j0.length)
  const bp = (4 - (bin.length % 4)) % 4
  const binBytes = new Uint8Array(bin.length + bp)
  binBytes.set(bin)
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.length, true)
  dv.setUint32(16, 0x4e4f534a, true) // 'JSON'
  new Uint8Array(buf).set(jsonBytes, 20)
  const binAt = 20 + jsonBytes.length
  dv.setUint32(binAt, binBytes.length, true)
  dv.setUint32(binAt + 4, 0x004e4942, true) // 'BIN\0'
  new Uint8Array(buf).set(binBytes, binAt + 8)
  return new Uint8Array(buf)
}

export interface GlbExport {
  /** содержимое .glb */
  bytes: Uint8Array
  info: { prims: number; tris: number; bytes: number; floorName: string }
}

/**
 * Строит координатную 3D-модель этажа документа в формате GLB (по умолчанию — текущий).
 * Бросает ошибку, если на этаже нет ни контура, ни перегородок, ни объектов.
 */
export function buildGlbBytes(doc: PlannerDoc, floorId?: string): GlbExport {
  const floor: Floor = floorId ? (doc.floors.find((f) => f.id === floorId) ?? currentFloor(doc)) : currentFloor(doc)
  const hasRoom = !!floor.room && floor.room.length >= 3
  const hasObjects = floor.objects.some((o) => !isDoorWindowPreset(o.presetId))
  if (!hasRoom && floor.partitions.length === 0 && !hasObjects) {
    throw new Error('На этаже нет геометрии: нарисуйте контур помещения, перегородки или добавьте объекты')
  }

  const scene = buildScene(floor)
  const wallH = scene.walls.find((w) => w.kind === 'wall')?.h ?? 270
  const collector = makeCollector()
  const { add, quad } = collector

  // 1) плита пола по контуру (цвет — материал пола, если задан HEX)
  const slabColor =
    floor.floorMaterial?.color && /^#[0-9a-f]{6}$/i.test(floor.floorMaterial.color) ? floor.floorMaterial.color : '#F6F0E4'
  addPrismCm(add, quad, 'Плита пола', slabColor, 1, scene.floorPlan, -SLAB_T, 0, { top: true, bottom: true })

  // 2) наружные стены: объём наружу от контура, чтобы внутренние размеры = контуру
  if (hasRoom && floor.room) {
    const room = floor.room
    const T = GLB_EXT_WALL_CM
    for (let i = 0; i < room.length; i++) {
      const a = room[i]
      const b = room[(i + 1) % room.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const dir = { x: dx / len, y: dy / len }
      const nrm = outwardNormal(a, b, room)
      const o = { x: nrm.x * T, y: nrm.y * T }
      const a0 = { x: a.x - dir.x * T, y: a.y - dir.y * T }
      const b0 = { x: b.x + dir.x * T, y: b.y + dir.y * T }
      const quadPts = [a0, b0, { x: b0.x + o.x, y: b0.y + o.y }, { x: a0.x + o.x, y: a0.y + o.y }]
      addPrismCm(add, quad, 'Стены наружные', '#EFE6D6', 1, quadPts, 0, wallH, { top: true })
    }
  }

  // 3) перегородки: объём симметрично оси, толщина и конструкция из ТЗ
  floor.partitions.forEach((p, pi) => {
    const stl = partitionStyle(p)
    const t = partitionThickness(p)
    const label = `Перегородка ${pi + 1}${p.material ? ` — ${p.material}` : ''}`
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const a = p.pts[i]
      const b = p.pts[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = (-dy / len) * (t / 2)
      const ny = (dx / len) * (t / 2)
      const quadPts = [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
      ]
      addPrismCm(add, quad, label, stl.fill, stl.alpha ?? 1, quadPts, 0, wallH, { top: true })
    }
  })

  // 4) мебель и оборудование призмами (двери/окна — спецификация, не объём)
  for (const b of scene.objectsParts) {
    const label = `Объект: ${cleanName(b.o.name) || b.o.presetId}`
    for (const part of b.parts) {
      if (part.fp.length < 3) continue
      addPrismCm(add, quad, label, part.color, part.alpha ?? 1, part.fp, part.z0, part.z1, {
        top: true,
        bottom: part.z0 > 0.5,
      })
    }
  }

  /* ---------- упаковка в glTF ---------- */
  const prims = collector.list()
  let triCount = 0
  for (const p of prims) triCount += p.verts.length / 9

  const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

  const materials = prims.map((p) => ({
    name: p.label,
    pbrMetallicRoughness: {
      baseColorFactor: [srgbToLinear(p.rgb[0]), srgbToLinear(p.rgb[1]), srgbToLinear(p.rgb[2]), p.alpha] as number[],
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
    alphaMode: (p.alpha < 1 ? 'BLEND' : 'OPAQUE') as 'BLEND' | 'OPAQUE',
    doubleSided: true,
  }))

  const binChunks: Uint8Array[] = []
  const bufferViews: unknown[] = []
  const accessors: unknown[] = []
  const primitives: unknown[] = []
  let byteOffset = 0
  prims.forEach((p, i) => {
    const f32 = new Float32Array(p.verts)
    const bytes = new Uint8Array(f32.buffer)
    binChunks.push(bytes)
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength })
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (let v = 0; v < p.verts.length; v += 3) {
      const x = p.verts[v]
      const y = p.verts[v + 1]
      const z = p.verts[v + 2]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    accessors.push({
      bufferView: i,
      componentType: 5126,
      count: p.verts.length / 3,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    })
    primitives.push({ attributes: { POSITION: i }, material: i, mode: 4 })
    byteOffset += bytes.byteLength
  })

  const gl = {
    asset: {
      version: '2.0',
      generator: 'Room Planner RU (room-planner-ru.surge.sh)',
      extras: {
        описание: `Координатная 3D-модель этажа «${floor.name}» из планировщика помещения`,
        единицы: 'метры',
        оси: 'X = x плана / 100 (вправо), Z = y плана / 100 (глубина, «вниз плана»), Y = высота / 100',
        стены: `наружные — объёмом ${GLB_EXT_WALL_CM} см наружу от контура; перегородки — объёмом по оси линии на плане, толщина из ТЗ`,
        соответствие: 'внутренний габарит модели равен контуру помещения из ТЗ; высоты стен = высоте потолка',
        дата: new Date().toISOString().slice(0, 10),
      },
    },
    scene: 0,
    scenes: [{ name: floor.name, nodes: [0] }],
    nodes: [{ name: floor.name, mesh: 0 }],
    meshes: [{ name: 'Геометрия этажа', primitives }],
    materials,
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
  }

  const bin = new Uint8Array(byteOffset)
  let at = 0
  for (const ch of binChunks) {
    bin.set(ch, at)
    at += ch.byteLength
  }
  const bytes = packGlb(JSON.stringify(gl), bin)
  return { bytes, info: { prims: prims.length, tris: triCount, bytes: bytes.length, floorName: floor.name } }
}

/** Скачивает координатную 3D-модель этажа (GLB). Бросает ошибку при пустой геометрии. */
export function exportGltfModel(doc: PlannerDoc): void {
  const { bytes } = buildGlbBytes(doc)
  const ab = bytes.slice().buffer as ArrayBuffer
  download(new Blob([ab]), 'plan-3d-model.glb')
}
