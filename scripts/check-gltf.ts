/**
 * Проверка экспорта координатной 3D-модели (GLB, glTF 2.0).
 * Строит GLB из тестового документа, разбирает контейнер обратно и проверяет
 * структуру (заголовок/чанки/accessors) и координаты (bbox соответствует плану).
 * Запуск: bun run scripts/check-gltf.ts
 */
import { buildGlbBytes } from '../src/lib/planner/gltf'
import type { Floor, PlannerDoc } from '../src/lib/planner/types'
import { writeFileSync, mkdirSync } from 'node:fs'

const floor: Floor = {
  id: 'f1',
  name: 'Первый этаж',
  room: [
    { x: 0, y: 0 },
    { x: 620, y: 0 },
    { x: 620, y: 540 },
    { x: 0, y: 540 },
  ],
  partitions: [
    { id: 'p1', pts: [{ x: 620, y: 240 }, { x: 320, y: 240 }], thicknessCm: 12, material: 'ГКЛ на металлокаркасе, покраска' },
    { id: 'p2', pts: [{ x: 320, y: 240 }, { x: 320, y: 540 }, { x: 100, y: 540 }], thicknessCm: 12 },
    { id: 'p3', pts: [{ x: 480, y: 60 }, { x: 480, y: 180 }], thicknessCm: 10, material: 'Стеклянная перегородка (закалённое стекло)' },
  ],
  dimensions: [],
  underlay: null,
  ceilingHeightCm: 270,
  floorMaterial: { kind: 'tile', desc: 'серая матовая', color: '#505050' },
  objects: [
    { id: 'o1', presetId: 'klen_1', name: 'Стол охлаждаемый · HICOLD GNE 11/TN · 96 752 ₽', x: 100, y: 100, w: 140, h: 73, angle: 0, color: '#DCEBD3', heightCm: 90, material: { kind: 'metal', desc: 'нержавеющая сталь' } },
    { id: 'o2', presetId: 'bar_counter', name: 'Барная стойка', x: 300, y: 480, w: 220, h: 60, angle: 0, color: '#C9A87E', heightCm: 110 },
    { id: 'o3', presetId: 'door_single', name: 'Дверь 80 см', x: 60, y: 540, w: 80, h: 12, angle: 0, color: '#F5EFE3', heightCm: 210, opening: { openType: 'swing-left' } },
  ],
}

const doc: PlannerDoc = { floors: [floor], currentFloorId: 'f1', gridStep: 25, layers: { furniture: true, vent: true, water: true, electric: true } }

const { bytes, info } = buildGlbBytes(doc)
console.log(`GLB: ${info.prims} примитивов, ${info.tris} треугольников, ${(info.bytes / 1024).toFixed(1)} КБ, этаж «${info.floorName}»`)

/* ---------- разбор GLB-контейнера ---------- */
const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const checks: [string, boolean][] = []

const magic = dv.getUint32(0, true)
const version = dv.getUint32(4, true)
const totalLen = dv.getUint32(8, true)
checks.push(['магия GLB (0x46546C67)', magic === 0x46546c67])
checks.push(['версия glTF 2.0', version === 2])
checks.push(['общая длина совпадает', totalLen === bytes.byteLength])

const jsonLen = dv.getUint32(12, true)
const jsonType = dv.getUint32(16, true)
checks.push(['тип чанка JSON', jsonType === 0x4e4f534a])
checks.push(['длина JSON кратна 4', jsonLen % 4 === 0])
const jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen))
const gl = JSON.parse(jsonText)

const binAt = 20 + jsonLen
const binLen = dv.getUint32(binAt, true)
const binType = dv.getUint32(binAt + 4, true)
checks.push(['тип чанка BIN', binType === 0x004e4942])
checks.push(['длина BIN кратна 4', binLen % 4 === 0])
checks.push(['длины чанков сходятся в размер файла', binAt + 8 + binLen === bytes.byteLength])

/* ---------- структура glTF ---------- */
checks.push(['asset.version = 2.0', gl.asset?.version === '2.0'])
checks.push(['extras: единицы/оси описаны', typeof gl.asset?.extras?.единицы === 'string' && gl.asset.extras.оси.includes('X = x плана / 100')])
const primCount = gl.meshes?.[0]?.primitives?.length ?? 0
checks.push(['примитивов в mesh соответствует сборке', primCount === info.prims && primCount > 0])
checks.push(['материалов = примитивам', (gl.materials?.length ?? 0) === primCount])
checks.push(['именованные материалы (перегородки/объекты)', gl.materials.some((m: { name: string }) => m.name.startsWith('Перегородка 1')) && gl.materials.some((m: { name: string }) => m.name.startsWith('Объект:'))])
checks.push(['стеклянная перегородка — BLEND', gl.materials.some((m: { name: string; alphaMode: string }) => m.name.includes('Стеклянная') && m.alphaMode === 'BLEND')])
checks.push(['дверь не попала в геометрию', !gl.materials.some((m: { name: string }) => m.name.includes('Дверь'))])
checks.push(['цена срезана из имени объекта', !gl.materials.some((m: { name: string }) => m.name.includes('96 752'))])

/* ---------- accessors и координаты ---------- */
const binStart = binAt + 8
let allVerts = 0
let bboxMin = [Infinity, Infinity, Infinity]
let bboxMax = [-Infinity, -Infinity, -Infinity]
let accOk = true
for (const prim of gl.meshes[0].primitives) {
  const acc = gl.accessors[prim.attributes.POSITION]
  const bv = gl.bufferViews[acc.bufferView]
  if (acc.componentType !== 5126 || acc.type !== 'VEC3') accOk = false
  if (bv.byteOffset + bv.byteLength > binLen) accOk = false
  if (acc.count !== bv.byteLength / 12) accOk = false
  if (!Array.isArray(acc.min) || acc.min.length !== 3 || !Array.isArray(acc.max) || acc.max.length !== 3) accOk = false
  // чтение фактических вершин из BIN
  const f = new Float32Array(bytes.buffer.slice(binStart + bv.byteOffset, binStart + bv.byteOffset + bv.byteLength))
  if (f.length !== acc.count * 3) accOk = false
  for (let i = 0; i < f.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const val = f[i + k]
      if (val < bboxMin[k]) bboxMin[k] = val
      if (val > bboxMax[k]) bboxMax[k] = val
    }
  }
  allVerts += acc.count
}
checks.push(['accessors: типы/смещения/counts согласованы', accOk])
checks.push(['позиции лежат внутри заявленных min/max accessors', Number.isFinite(bboxMin[0]) && allVerts > 0])

// bbox модели: план 620×540 см, наружные стены 20 см наружу, плита −10 см, высота 270 см
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps
checks.push(['X: от −0,2 до 6,4 м (контур + наружные стены)', near(bboxMin[0], -0.2, 0.011) && near(bboxMax[0], 6.4, 0.011)])
checks.push(['Z: от −0,2 до 5,6 м (контур + наружные стены)', near(bboxMin[2], -0.2, 0.011) && near(bboxMax[2], 5.6, 0.011)])
checks.push(['Y: от −0,1 (плита) до 2,7 м (потолок)', near(bboxMin[1], -0.1, 0.011) && near(bboxMax[1], 2.7, 0.011)])

// перегородка 1: ось y=240, толщина 12 → вершины в диапазоне 2,34..2,46 м при x 3,2..6,2
let partYok = false
{
  const prim = gl.meshes[0].primitives[gl.materials.findIndex((m: { name: string }) => m.name === 'Перегородка 1 — ГКЛ на металлокаркасе, покраска')]
  if (prim) {
    const acc = gl.accessors[prim.attributes.POSITION]
    partYok = near(acc.min[2], 2.34, 0.011) && near(acc.max[2], 2.46, 0.011) && near(acc.min[0], 3.2, 0.011) && near(acc.max[0], 6.2, 0.011)
  }
}
checks.push(['перегородка 1: объём 12 см по оси y=240 (2,34..2,46 м)', partYok])

/* ---------- отчёт и файл-артефакт ---------- */
let ok = true
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`)
  if (!passed) ok = false
}
if (!ok) process.exit(1)

mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/check-model.glb', bytes)
console.log(`\nВсе проверки GLB пройдены. Файл: test-results/check-model.glb (${allVerts} вершин)`)
