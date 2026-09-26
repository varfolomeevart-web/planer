import type { Floor, LayerVis, Pt } from './types'
import { buildScene, convexHull, get3dImage, type Part } from './view3d'
import { objectCorners } from './geometry'

/**
 * 3D-снимок с камеры: перспективный рендер «от первого лица» на Canvas 2D
 * без зависимостей. Точка съёмки — маркер камеры на плане (инструмент «Камера»).
 *
 * Качество и детализация:
 *  - честная перспектива с отсечением по ближней плоскости (можно стоять вплотную к стене);
 *  - дощатый пол с пазами и торцевыми стыками, контактные и падающие тени,
 *    затемнение-АО вдоль стен;
 *  - плинтусы на стенах и перегородках, затенение граней по свету,
 *    дымка расстояния, тёплая тональность и виньетка.
 */

export interface CamShotState {
  /** направление взгляда, градусы (0 — вверх плана, по часовой) */
  yaw: number
  /** высота глаза над полом, см */
  height: number
  /** наклон взгляда, градусы (вверх — плюс) */
  pitch: number
  /** горизонтальный угол обзора, градусы */
  fov: number
}

export const CAMSHOT_DEFAULT: Omit<CamShotState, 'yaw'> = { height: 160, pitch: -22, fov: 70 }

const NEAR = 4 // ближняя плоскость, см
const PLANK = 16 // ширина доски пола, см
const PLANK_LEN = 130 // длина доски, см
const SKIRT_H = 9 // высота плинтуса, см

const FLOOR_FILL = '#F2EADB'
const WALL_FILL = '#EFE6D6'
const PART_FILL = '#E3D7C1'
const BG_IN = '#4B4136'
const BG_OUT = '#211C16'

// свет слева-сверху (в плане) — согласован с аксонометрией
const LIGHT_N = Math.hypot(-0.45, -0.89)
const LIGHT = { x: -0.45 / LIGHT_N, y: -0.89 / LIGHT_N }
const SHADOW_N = Math.hypot(0.42, 0.91)
const SHADOW_DIR = { x: 0.42 / SHADOW_N, y: 0.91 / SHADOW_N }

// ---------- цветовые утилиты ----------

/** Разбор цвета: hex (#rgb/#rrggbb) или строка rgb()/rgba() (результат shade) */
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
  const mr = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c)
  if (mr) return [Number(mr[1]), Number(mr[2]), Number(mr[3])]
  return [190, 180, 165]
}

function shade(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`
}

function shadeA(hex: string, f: number, a: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))},${a})`
}

/** смесь с цветом «дымки» (тёмный фон) на расстоянии */
function fadeMix(hex: string, t: number): string {
  if (t <= 0) return shade(hex, 1)
  const [r, g, b] = hexRgb(hex)
  const tr = 33
  const tg = 28
  const tb = 23
  const k = Math.min(1, Math.max(0, t))
  return `rgb(${Math.round(r + (tr - r) * k)},${Math.round(g + (tg - g) * k)},${Math.round(b + (tb - b) * k)})`
}

// ---------- рендер ----------

/** Точка в камерном пространстве: x — вправо, y — глубина (вперёд), z — вверх */
interface C3 {
  x: number
  y: number
  z: number
}

export function renderCamShot(
  canvas: HTMLCanvasElement,
  floor: Floor,
  cam: { x: number; y: number },
  st: CamShotState,
  dpr = 1,
  layers?: LayerVis,
) {
  const ctx0 = canvas.getContext('2d')
  if (!ctx0) return
  const ctx: CanvasRenderingContext2D = ctx0
  const W = canvas.width
  const H = canvas.height
  const scene = buildScene(floor, layers)

  // фон
  const bg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.max(W, H) * 0.8)
  bg.addColorStop(0, BG_IN)
  bg.addColorStop(1, BG_OUT)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  if (scene.floorPlan.length < 3) return

  const yaw = (st.yaw * Math.PI) / 180
  const fx = Math.sin(yaw)
  const fy = -Math.cos(yaw)
  const rx = Math.cos(yaw)
  const ry = Math.sin(yaw)
  const pitch = Math.max(-60, Math.min(60, st.pitch))
  const cp = Math.cos((pitch * Math.PI) / 180)
  const sp = Math.sin((pitch * Math.PI) / 180)
  const fov = Math.max(25, Math.min(110, st.fov))
  const F = W / 2 / Math.tan(((fov / 2) * Math.PI) / 180)

  const toCam = (x: number, y: number, z: number): C3 => {
    const px = x - cam.x
    const py = y - cam.y
    const Xc = px * rx + py * ry
    const Yc = px * fx + py * fy
    const Zc = z - st.height
    return { x: Xc, y: Yc * cp + Zc * sp, z: Zc * cp - Yc * sp }
  }
  const scr = (p: C3): [number, number] => [W / 2 + (F * p.x) / p.y, H / 2 - (F * p.z) / p.y]

  /** отсечение полигона ближней плоскостью y = NEAR (Сазерленд–Ходжман) */
  const clipNear = (pts: C3[]): C3[] => {
    const out: C3[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const inA = a.y >= NEAR
      const inB = b.y >= NEAR
      if (inA) out.push(a)
      if (inA !== inB) {
        const t = (NEAR - a.y) / (b.y - a.y)
        out.push({ x: a.x + (b.x - a.x) * t, y: NEAR, z: a.z + (b.z - a.z) * t })
      }
    }
    return out
  }

  const lw = (v: number) => Math.max(1, v * dpr)
  const fadeT = (depth: number) => Math.min(0.24, Math.max(0, (depth - 260) / 2600) * 0.24)

  function screenPath(pts: [number, number][]) {
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1])
      else ctx.lineTo(pts[i][0], pts[i][1])
    }
    ctx.closePath()
  }

  /** элемент очереди художника */
  interface Item {
    depth: number
    draw: () => void
  }
  const items: Item[] = []

  /** проекция полигона в экран; null — целиком за ближней плоскостью */
  function project(world: { x: number; y: number; z: number }[]): [number, number][] | null {
    const cam = world.map((p) => toCam(p.x, p.y, p.z))
    if (cam.every((p) => p.y < NEAR)) return null
    const vis = clipNear(cam)
    if (vis.length < 3) return null
    return vis.map(scr)
  }

  function fillWorld(
    world: { x: number; y: number; z: number }[],
    fill: string,
    stroke?: string,
    alpha = 1,
    lineW = 0.9,
  ) {
    const spts = project(world)
    if (!spts) return
    ctx.globalAlpha = alpha
    screenPath(spts)
    ctx.fillStyle = fill
    ctx.fill()
    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = lw(lineW)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  function lineWorld(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: string, w: number) {
    const pa = scr(toCam(a.x, a.y, a.z))
    const pb = scr(toCam(b.x, b.y, b.z))
    if (!Number.isFinite(pa[0]) || !Number.isFinite(pb[0])) return
    ctx.strokeStyle = color
    ctx.lineWidth = lw(w)
    ctx.beginPath()
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
    ctx.stroke()
  }

  // ---------- пол: заливка, доски, тени, АО (всё в клипе видимой части пола) ----------

  const flCam = scene.floorPlan.map((p) => toCam(p.x, p.y, 0))
  const flVis = clipNear(flCam)
  if (flVis.length >= 3) {
    ctx.save()
    screenPath(flVis.map(scr))
    ctx.clip()

    // заливка пола
    ctx.fillStyle = FLOOR_FILL
    ctx.fill()

    // доски: пазы вдоль длинной стороны + торцевые стыки вразбежку
    let px1 = Infinity
    let py1 = Infinity
    let px2 = -Infinity
    let py2 = -Infinity
    for (const p of scene.floorPlan) {
      if (p.x < px1) px1 = p.x
      if (p.x > px2) px2 = p.x
      if (p.y < py1) py1 = p.y
      if (p.y > py2) py2 = p.y
    }
    const alongX = px2 - px1 >= py2 - py1
    ctx.strokeStyle = 'rgba(151,129,98,0.30)'
    ctx.lineWidth = lw(0.9)
    ctx.beginPath()
    let row = 0
    if (alongX) {
      for (let y = Math.floor(py1 / PLANK) * PLANK; y <= py2; y += PLANK, row++) {
        const off = row % 2 === 0 ? 0 : PLANK_LEN / 2
        const a = scr(toCam(px1, y, 0.5))
        const b = scr(toCam(px2, y, 0.5))
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        // торцевые стыки этой доски
        for (let x = Math.floor(px1 / PLANK_LEN) * PLANK_LEN + off; x <= px2; x += PLANK_LEN) {
          const j1 = scr(toCam(x, y, 0.5))
          const j2 = scr(toCam(x, y + PLANK, 0.5))
          ctx.moveTo(j1[0], j1[1])
          ctx.lineTo(j2[0], j2[1])
        }
      }
    } else {
      for (let x = Math.floor(px1 / PLANK) * PLANK; x <= px2; x += PLANK, row++) {
        const off = row % 2 === 0 ? 0 : PLANK_LEN / 2
        const a = scr(toCam(x, py1, 0.5))
        const b = scr(toCam(x, py2, 0.5))
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        for (let y = Math.floor(py1 / PLANK_LEN) * PLANK_LEN + off; y <= py2; y += PLANK_LEN) {
          const j1 = scr(toCam(x, y, 0.5))
          const j2 = scr(toCam(x + PLANK, y, 0.5))
          ctx.moveTo(j1[0], j1[1])
          ctx.lineTo(j2[0], j2[1])
        }
      }
    }
    ctx.stroke()

    // тени объектов: контактная + смещённая от света
    for (const b of scene.objectsParts) {
      const fp = objectCorners(b.o)
      screenPath(fp.map((p) => scr(toCam(p.x, p.y, 0.6))))
      ctx.fillStyle = 'rgba(40,34,28,0.08)'
      ctx.fill()
      let zmax = 0
      for (const part of b.parts) zmax = Math.max(zmax, part.z1)
      if (zmax < 8) continue
      const off = { x: SHADOW_DIR.x * zmax * 0.3, y: SHADOW_DIR.y * zmax * 0.3 }
      const hull = convexHull([...fp, ...fp.map((p) => ({ x: p.x + off.x, y: p.y + off.y }))])
      screenPath(hull.map((p) => scr(toCam(p.x, p.y, 0.5))))
      ctx.fillStyle = 'rgba(40,34,28,0.15)'
      ctx.fill()
    }

    // затемнение-АО вдоль основания стен и перегородок
    for (const w of scene.walls) {
      const dx = w.b.x - w.a.x
      const dy = w.b.y - w.a.y
      const len = Math.hypot(dx, dy) || 1
      let nx = -dy / len
      let ny = dx / len
      const mx = (w.a.x + w.b.x) / 2 - scene.center.x
      const my = (w.a.y + w.b.y) / 2 - scene.center.y
      if (nx * mx + ny * my < 0) {
        nx = -nx
        ny = -ny
      }
      const inW = w.kind === 'wall' ? 1 : 0.5
      const sides = w.kind === 'wall' ? [1] : [1, -1]
      for (const s of sides) {
        fillWorld(
          [
            { x: w.a.x, y: w.a.y, z: 0.7 },
            { x: w.b.x, y: w.b.y, z: 0.7 },
            { x: w.b.x + nx * s * 7, y: w.b.y + ny * s * 7, z: 0.7 },
            { x: w.a.x + nx * s * 7, y: w.a.y + ny * s * 7, z: 0.7 },
          ],
          `rgba(45,38,30,${0.1 * inW * (s > 0 ? 1 : 0.7)})`,
        )
      }
    }
    ctx.restore()
  }

  // ---------- стены и перегородки ----------

  for (const w of scene.walls) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const len = Math.hypot(dx, dy) || 1
    let nx = -dy / len
    let ny = dx / len
    const mx = (w.a.x + w.b.x) / 2 - scene.center.x
    const my = (w.a.y + w.b.y) / 2 - scene.center.y
    if (nx * mx + ny * my < 0) {
      nx = -nx
      ny = -ny
    } // nx, ny — внутрь комнаты
    const lam = Math.abs(nx * LIGHT.x + ny * LIGHT.y)
    const bright = 0.72 + 0.22 * lam
    const depth = toCam((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2, w.h / 2).y

    items.push({
      depth,
      draw: () => {
        const face = [
          { x: w.a.x, y: w.a.y, z: 0 },
          { x: w.b.x, y: w.b.y, z: 0 },
          { x: w.b.x, y: w.b.y, z: w.h },
          { x: w.a.x, y: w.a.y, z: w.h },
        ]
        const camSide = (cam.x - (w.a.x + w.b.x) / 2) * nx + (cam.y - (w.a.y + w.b.y) / 2) * ny
        const skirt = (s: number) =>
          fillWorld(
            [
              { x: w.a.x + nx * s * 0.8, y: w.a.y + ny * s * 0.8, z: 0 },
              { x: w.b.x + nx * s * 0.8, y: w.b.y + ny * s * 0.8, z: 0 },
              { x: w.b.x + nx * s * 0.8, y: w.b.y + ny * s * 0.8, z: SKIRT_H },
              { x: w.a.x + nx * s * 0.8, y: w.a.y + ny * s * 0.8, z: SKIRT_H },
            ],
            fadeMix(shade(w.fill, 0.58), fadeT(depth)),
            undefined,
          )
        if (w.kind === 'wall') {
          // плинтус только с внутренней стороны; порядок — по стороне камеры
          if (camSide >= 0) {
            fillWorld(face, fadeMix(shade(w.fill, bright), fadeT(depth)), w.stroke, 1, 0.9)
            skirt(1)
          } else {
            skirt(1)
            fillWorld(face, fadeMix(shade(w.fill, bright), fadeT(depth)), w.stroke, 1, 0.9)
          }
        } else {
          // перегородка: плинтусы с обеих сторон
          fillWorld(face, fadeMix(shade(w.fill, bright), fadeT(depth)), w.stroke, 1, 0.9)
          skirt(1)
          skirt(-1)
        }
      },
    })
  }

  // ---------- объекты: один элемент очереди на объект, части — в порядке сборки ----------

  for (const b of scene.objectsParts) {
    const o = b.o
    let sum = 0
    for (const part of b.parts) {
      for (const p of part.fp) sum += toCam(p.x, p.y, (part.z0 + part.z1) / 2).y
    }
    const depth = b.parts.length ? sum / b.parts.length : 0
    items.push({
      depth,
      draw: () => {
        for (const part of b.parts) drawPart(part)
      },
    })
  }

  function drawPart(part: Part) {
    const fp = part.fp
    let ccx = 0
    let ccy = 0
    for (const p of fp) {
      ccx += p.x
      ccy += p.y
    }
    ccx /= fp.length
    ccy /= fp.length
    const edgeCol = shadeA(part.color, 0.52, 0.55)

    // видимые боковые грани (перспективный тест: нормаль к точке камеры)
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i]
      const b = fp[(i + 1) % fp.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      let nx = -dy / len
      let ny = dx / len
      const mx = (a.x + b.x) / 2 - ccx
      const my = (a.y + b.y) / 2 - ccy
      if (nx * mx + ny * my < 0) {
        nx = -nx
        ny = -ny
      }
      const vx = cam.x - (a.x + b.x) / 2
      const vy = cam.y - (a.y + b.y) / 2
      if (nx * vx + ny * vy <= 0) continue
      const bright = 0.6 + 0.34 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y)
      const midDepth = toCam((a.x + b.x) / 2, (a.y + b.y) / 2, (part.z0 + part.z1) / 2).y
      const j = (i + 1) % fp.length
      const quad = [
        { x: a.x, y: a.y, z: part.z0 },
        { x: b.x, y: b.y, z: part.z0 },
        { x: b.x, y: b.y, z: part.z1 },
        { x: a.x, y: a.y, z: part.z1 },
      ]
      const alpha = part.alpha ?? 1
      // детали на этой грани
      const details: (() => void)[] = []
      if (part.shelfLines) {
        for (const t of part.shelfLines) {
          const z = part.z0 + (part.z1 - part.z0) * t
          details.push(() => lineWorld({ x: a.x, y: a.y, z }, { x: b.x, y: b.y, z }, shadeA(part.color, 0.45, 0.7), 0.8))
        }
      }
      if (part.vSeams) {
        for (const f of part.vSeams) {
          const px = a.x + (b.x - a.x) * f
          const py = a.y + (b.y - a.y) * f
          details.push(() =>
            lineWorld({ x: px, y: py, z: part.z0 }, { x: px, y: py, z: part.z1 }, shadeA(part.color, 0.45, 0.7), 0.8),
          )
        }
      }
      fillWorld(quad, fadeMix(shade(part.color, bright), fadeT(midDepth)), edgeCol, alpha, 0.85)
      for (const d of details) d()
    }

    // верхняя грань (видна, если глаз выше неё)
    if (st.height > part.z1 + 0.5) {
      const topWorld = fp.map((p) => ({ x: p.x, y: p.y, z: part.z1 }))
      const topDepth = toCam(ccx, ccy, part.z1).y
      fillWorld(topWorld, fadeMix(shade(part.topFill || part.color, 1.06), fadeT(topDepth)), edgeCol, part.alpha ?? 1, 0.9)

      if (part.alpha == null || part.alpha > 0.7) {
        // детали крышки
        if (part.topPolys) {
          for (const tp of part.topPolys) {
            fillWorld(
              tp.pts.map((p) => ({ x: p.x, y: p.y, z: part.z1 + 0.3 })),
              tp.color,
            )
          }
        }
        if (part.topStrokes) {
          for (const ts of part.topStrokes) {
            const pts = ts.pts
            ctx.strokeStyle = ts.color
            ctx.lineWidth = lw(ts.w ?? 1)
            ctx.beginPath()
            for (let i = 0; i < pts.length; i++) {
              const s = scr(toCam(pts[i].x, pts[i].y, part.z1 + 0.3))
              if (i === 0) ctx.moveTo(s[0], s[1])
              else ctx.lineTo(s[0], s[1])
            }
            ctx.closePath()
            ctx.stroke()
          }
        }
        if (part.circles) {
          for (const c of part.circles) {
            const ring: { x: number; y: number; z: number }[] = []
            for (let i = 0; i < 20; i++) {
              const ang = (i / 20) * Math.PI * 2
              ring.push({ x: c.c.x + Math.cos(ang) * c.r, y: c.c.y + Math.sin(ang) * c.r, z: part.z1 + 0.35 })
            }
            fillWorld(ring, c.color)
          }
        }
        // схема каталога на крышке (аффинное отображение по 3 углам)
        if (part.img && fp.length === 4) {
          const camPts = fp.map((p) => toCam(p.x, p.y, part.z1 + 0.25))
          // грань должна целиком лежать перед камерой — иначе аффинная проекция вырождается
          if (camPts.every((c) => c.y > NEAR + 1) && camPts.every((c) => Number.isFinite(c.x) && Number.isFinite(c.z))) {
            const img = get3dImage(part.img.src)
            if (img) {
              const spts = camPts.map(scr)
              ctx.save()
              screenPath(spts)
              ctx.clip()
              const iw = img.naturalWidth
              const ih = img.naturalHeight
              ctx.transform(
                (spts[1][0] - spts[0][0]) / iw,
                (spts[1][1] - spts[0][1]) / iw,
                (spts[3][0] - spts[0][0]) / ih,
                (spts[3][1] - spts[0][1]) / ih,
                spts[0][0],
                spts[0][1],
              )
              ctx.drawImage(img, 0, 0)
              ctx.restore()
            }
          }
        }
      }
    }
  }

  // ---------- художник: от дальних к ближним ----------
  items.sort((i1, i2) => i2.depth - i1.depth)
  for (const it of items) it.draw()

  // ---------- атмосфера: тёплый свет сверху и виньетка ----------
  const warm = ctx.createLinearGradient(0, 0, 0, H * 0.55)
  warm.addColorStop(0, 'rgba(255,232,190,0.07)')
  warm.addColorStop(1, 'rgba(255,232,190,0)')
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H * 0.55)

  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.44, W / 2, H / 2, Math.max(W, H) * 0.74)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(16,12,8,0.30)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)
}
