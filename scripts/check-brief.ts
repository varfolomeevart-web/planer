/**
 * Проверка генерации текстового ТЗ (brief) с новыми разделами:
 * МАТЕРИАЛЫ И ТЕКСТУРЫ / ОСВЕЩЕНИЕ / РАКУРСЫ, HEX-цвета, срез цен «Клён».
 * Запуск: bun run scripts/check-brief.ts
 */
import { buildRenderBrief } from '../src/lib/planner/brief'
import type { Floor, PlannerDoc } from '../src/lib/planner/types'
import { makeSaveFile, validateSaveFile } from '../src/lib/planner/export'

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
    { id: 'p1', pts: [{ x: 620, y: 240 }, { x: 320, y: 240 }], thicknessCm: 12 },
    { id: 'p2', pts: [{ x: 320, y: 240 }, { x: 320, y: 540 }, { x: 100, y: 540 }], thicknessCm: 12 },
  ],
  dimensions: [],
  underlay: null,
  ceilingHeightCm: 270,
  floorMaterial: { kind: 'tile', desc: 'серая матовая, противоскользящая 60×60', color: '#505050' },
  wallMaterial: { kind: 'paint', desc: 'в зоне моек — плитка-кабанчик белая до 160 см', color: '#E0E0E0' },
  ceilingMaterial: { kind: 'plaster', desc: 'гладкий гипсокартон', color: '#F5F5F5' },
  levelNotes: 'перепада нет',
  renderNotes: 'По стене напротив бара — витражное остекление от пола до потолка',
  lightingNotes:
    'Кухня — яркие потолочные LED-панели (нейтральный свет)\nБар — три подвесных светильника (стиль лофт, тёплый свет) над стойкой',
  views: [
    { id: 'v1', name: 'Изометрия сверху' },
    { id: 'v2', name: 'Вид от входа (Дверь 80 см) на барную стойку', desc: 'камера на уровне глаз ~160 см' },
    { id: 'v3', name: 'Вид из кухни на лестницу' },
  ],
  objects: [
    {
      id: 'o1',
      presetId: 'klen_1',
      name: 'Стол охлаждаемый (сборка роллов) · HICOLD GNE 11/TN · 96 752 ₽',
      x: 100, y: 100, w: 140, h: 73, angle: 0, color: '#DCEBD3',
      heightCm: 90,
      material: { kind: 'metal', desc: 'нержавеющая сталь матовая' },
    },
    {
      id: 'o2',
      presetId: 'klen_2',
      name: 'Холодильный шкаф POLAIR ШХ-0,5 ДС · 61 200 ₽',
      x: 300, y: 100, w: 70, h: 73, angle: 0, color: '#DCEBD3',
      heightCm: 202,
      material: { kind: 'metal', desc: 'нержавеющая сталь матовая' },
    },
    {
      id: 'o3',
      presetId: 'bar_counter',
      name: 'Барная стойка',
      x: 300, y: 480, w: 220, h: 60, angle: 0, color: '#C9A87E',
      heightCm: 110,
      material: { kind: 'wood', desc: 'столешница — массив дуба (тёмный), фасад — рейки' },
    },
    {
      id: 'o4',
      presetId: 'stairs_straight',
      name: 'Лестница прямая',
      x: 550, y: 200, w: 100, h: 280, angle: 0, color: '#EAD9B0',
      showNext: true, heightCm: 270,
      stairs: { kind: 'straight', steps: 14, ascent: 'bottom', material: 'массив дуба (светлый)', desc: 'перила — стекло и нержавейка' },
    },
    {
      id: 'o5',
      presetId: 'door_single',
      name: 'Дверь 80 см',
      x: 60, y: 540, w: 80, h: 12, angle: 0, color: '#F5EFE3',
      heightCm: 210,
      opening: { openType: 'swing-left' },
    },
  ],
}

const doc: PlannerDoc = { floors: [floor], currentFloorId: 'f1', gridStep: 25, layers: { furniture: true, vent: true, water: true, electric: true } }

const brief = buildRenderBrief(doc)
console.log(brief)

// проверки
const checks: [string, boolean][] = [
  ['раздел МАТЕРИАЛЫ И ТЕКСТУРЫ', brief.includes('МАТЕРИАЛЫ И ТЕКСТУРЫ')],
  ['раздел ОСВЕЩЕНИЕ', brief.includes('ОСВЕЩЕНИЕ')],
  ['раздел РАКУРСЫ', brief.includes('РАКУРСЫ')],
  ['HEX-цвет пола', brief.includes('HEX: #505050')],
  ['HEX-цвет стен', brief.includes('HEX: #E0E0E0')],
  ['цена срезана из названия Klen', !brief.includes('96 752 ₽') && !brief.includes('61 200 ₽')],
  ['модель HICOLD сохранена', brief.includes('HICOLD GNE 11/TN')],
  ['модель POLAIR сохранена', brief.includes('POLAIR ШХ-0,5 ДС')],
  ['материал лестницы (ступени+перила)', brief.includes('массив дуба (светлый)') && brief.includes('перила — стекло и нержавейка')],
  ['освещение по зонам (2 строки)', brief.includes('LED-панели') && brief.includes('лофт')],
  ['ракурсы пронумерованы', brief.includes('1. Изометрия сверху') && brief.includes('3. Вид из кухни на лестницу')],
  ['оборудование сгруппировано по материалу', brief.includes('Оборудование/мебель — Металл, нержавеющая сталь матовая (')],
  ['контур стен: вершины перечислены', brief.includes('Стены помещения: замкнутый контур') && brief.includes('Вершины контура')],
  ['габарит и площадь помещения', brief.includes('620×540') && brief.includes('33,5 м²')],
  ['перегородки: количество и толщина', brief.includes('Перегородки (внутренние стены): 2 шт., толщина 12 см')],
  ['перегородка 1: отрезок + координаты + длина', brief.includes('Перегородка 1: отрезок от (620; 240) до (320; 240) см, длина 300 см, толщина 12 см')],
  ['перегородка 2: 3 узла', brief.includes('Перегородка 2: 3 узла') && brief.includes('толщина 12 см')],
  ['легенда системы координат', brief.includes('Система координат: сантиметры')],
]
let ok = true
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`)
  if (!passed) ok = false
}
if (!ok) process.exit(1)
console.log('\nВсе проверки брифа пройдены.')

// ---------- round-trip: экспорт → импорт сохраняет перегородки с толщиной ----------
const saved = makeSaveFile(doc, true)
const json = JSON.parse(JSON.stringify(saved)) // имитация передачи файла
const restored = validateSaveFile(json)
if (!restored) {
  console.error('FAIL  round-trip: документ не восстановлен')
  process.exit(1)
}
const rp = restored.floors[0].partitions
const rtChecks: [string, boolean][] = [
  ['round-trip: перегородок 2', rp.length === 2],
  ['round-trip: толщина 12 сохранена', rp[0]?.thicknessCm === 12 && rp[1]?.thicknessCm === 12],
  ['round-trip: точки перегородки совпадают', rp[0]?.pts[0].x === 620 && rp[1]?.pts.length === 3],
  ['round-trip: бриф в файле содержит перегородки', (json.brief as string).includes('Перегородки (внутренние стены)')],
]
let ok2 = true
for (const [name, passed] of rtChecks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`)
  if (!passed) ok2 = false
}
if (!ok2) process.exit(1)
console.log('\nRound-trip экспорт/импорт перегородок пройден.')

// ---------- разные толщины у перегородок ----------
const doc2: PlannerDoc = {
  ...doc,
  floors: [
    {
      ...floor,
      partitions: [
        { id: 'q1', pts: [{ x: 0, y: 100 }, { x: 200, y: 100 }], thicknessCm: 8 },
        { id: 'q2', pts: [{ x: 0, y: 300 }, { x: 200, y: 300 }] }, // без толщины → дефолт 10
      ],
    },
  ],
}
const brief2 = buildRenderBrief(doc2)
const c1 = brief2.includes('Перегородки (внутренние стены): 2 шт. (толщина у каждой своя — см. ниже).')
const c2 = brief2.includes('толщина 8 см')
const c3 = brief2.includes('толщина 10 см')
const checks3: [string, boolean][] = [
  ['разные толщины: заголовок без двойной точки', c1],
  ['разные толщины: 8 см упомянута', c2],
  ['разные толщины: дефолт 10 см подставлен', c3],
]
let ok3 = true
for (const [name, passed] of checks3) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`)
  if (!passed) ok3 = false
}
if (!ok3) process.exit(1)
console.log('\nВсе проверки пройдены.')
