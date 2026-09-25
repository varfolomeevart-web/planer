'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dimension, Floor, ObjLayer, PlannerDoc, PlannerObject, Pt, Underlay, View } from '@/lib/planner/types'
import { MAX_FLOORS, currentFloor, emptyFloor, makeDoc, uid } from '@/lib/planner/types'
import type { Preset } from '@/lib/planner/presets'
import { isDoorWindowPreset } from '@/lib/planner/presets'
import type { Tool } from '@/lib/planner/tools'
import {
  distToSegment,
  nearestWall,
  pointInObject,
  pointInRect,
  pointsBBox,
  objectsBBox,
  unionBBox,
  rotateHandlePos,
  screenToPlan,
  snapObjectPos,
  snapValue,
  floorWallSegments,
} from '@/lib/planner/geometry'
import { computeUnderlayPlacement, fileToUnderlaySource, packDocForHistory, unpackDocFromHistory } from '@/lib/planner/underlay'
import { drawScene } from '@/lib/planner/draw'
import { exportJSON, exportPNG, exportPDF, makeSaveFile, validateSaveFile } from '@/lib/planner/export'
import { Catalog } from './Catalog'
import { PropertiesPanel } from './PropertiesPanel'
import { TopBar } from './TopBar'
import { View3dModal } from './View3dModal'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PencilLine, Ruler } from 'lucide-react'
import {
  CURSOR_ARROW,
  CURSOR_DIM,
  CURSOR_ERASE,
  CURSOR_GRAB,
  CURSOR_GRABBING,
  CURSOR_MOVE,
  CURSOR_PARTITION,
  CURSOR_PLACE,
  CURSOR_ROTATE,
  CURSOR_RULER,
  CURSOR_VERTEX,
  CURSOR_WALL,
} from '@/lib/planner/cursors'

const STORAGE_KEY = 'room-planner-v1'
const MIN_SCALE = 0.02
const MAX_SCALE = 2

interface Interaction {
  type: 'none' | 'pan' | 'drag' | 'rotate' | 'vertex' | 'underlayDrag' | 'partitionVertex' | 'ruler'
  panStart?: { ox: number; oy: number; px: number; py: number }
  grabDX?: number
  grabDY?: number
  moved?: boolean
  vertexIdx?: number
  partitionId?: string
}

export function Planner() {
  // ---------- состояние ----------
  const [doc, setDoc] = useState<PlannerDoc>(() => makeDoc())
  const [showGrid, setShowGrid] = useState(true)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [placePreset, setPlacePreset] = useState<Preset | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hist, setHist] = useState({ p: 0, f: 0 })
  const [underlaySelected, setUnderlaySelected] = useState(false)
  const [selectedPartitionId, setSelectedPartitionId] = useState<string | null>(null)
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(null)
  const [view3dOpen, setView3dOpen] = useState(false)

  // ---------- refs ----------
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const underlayInputRef = useRef<HTMLInputElement | null>(null)
  const coordsRef = useRef<HTMLSpanElement | null>(null)
  const zoomRef = useRef<HTMLSpanElement | null>(null)
  const drawRef = useRef<() => void>(() => {})

  const viewRef = useRef<View>({ scale: 0.3, ox: 250, oy: 180 })
  const sizeRef = useRef({ w: 800, h: 600 })
  const docRef = useRef(doc)
  const toolRef = useRef(tool)
  const selectedIdRef = useRef(selectedId)
  const placePresetRef = useRef(placePreset)
  const showGridRef = useRef(showGrid)
  const drawingPtsRef = useRef<Pt[] | null>(null)
  const cursorPlanRef = useRef<Pt | null>(null)
  const pointerScreenRef = useRef<Pt | null>(null)
  const ghostRef = useRef<PlannerObject | null>(null)
  const dragVertexRef = useRef<number | null>(null)
  const spaceRef = useRef(false)
  const userViewRef = useRef(false)
  const loadedRef = useRef(false)
  const lastNudgeRef = useRef(0)
  const underlaySelectedRef = useRef(false)
  const selectedPartitionIdRef = useRef<string | null>(null)
  const selectedDimensionIdRef = useRef<string | null>(null)
  const partitionVertexRef = useRef<number | null>(null)
  const rulerRef = useRef<{ a: Pt; b: Pt } | null>(null)
  const interRef = useRef<Interaction>({ type: 'none' })
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] })

  // ---------- зеркала состояния для слушателей ----------
  useEffect(() => void (docRef.current = doc), [doc])
  useEffect(() => void (toolRef.current = tool), [tool])
  useEffect(() => void (selectedIdRef.current = selectedId), [selectedId])
  useEffect(() => void (placePresetRef.current = placePreset), [placePreset])
  useEffect(() => void (showGridRef.current = showGrid), [showGrid])
  useEffect(() => void (underlaySelectedRef.current = underlaySelected), [underlaySelected])
  useEffect(() => void (selectedPartitionIdRef.current = selectedPartitionId), [selectedPartitionId])
  useEffect(() => void (selectedDimensionIdRef.current = selectedDimensionId), [selectedDimensionId])

  // ---------- базовые операции ----------
  const applyDoc = useCallback((next: PlannerDoc) => {
    docRef.current = next
    setDoc(next)
  }, [])

  const pushHistory = useCallback((snapshot?: PlannerDoc) => {
    const h = historyRef.current
    h.past.push(packDocForHistory(snapshot ?? docRef.current))
    if (h.past.length > 60) h.past.shift()
    h.future = []
    setHist({ p: h.past.length, f: 0 })
  }, [])

  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.past.length) return
    h.future.push(packDocForHistory(docRef.current))
    const prev = h.past.pop() as string
    applyDoc(unpackDocFromHistory(prev))
    setHist({ p: h.past.length, f: h.future.length })
  }, [applyDoc])

  const redo = useCallback(() => {
    const h = historyRef.current
    if (!h.future.length) return
    h.past.push(packDocForHistory(docRef.current))
    const next = h.future.pop() as string
    applyDoc(unpackDocFromHistory(next))
    setHist({ p: h.past.length, f: h.future.length })
  }, [applyDoc])

  /** Изменить текущий этаж */
  const withFloors = useCallback(
    (fn: (f: Floor) => Floor) => {
      const d = docRef.current
      applyDoc({ ...d, floors: d.floors.map((f) => (f.id === d.currentFloorId ? fn(f) : f)) })
    },
    [applyDoc],
  )

  const clearSelection = useCallback(() => {
    selectedIdRef.current = null
    setSelectedId(null)
    selectedPartitionIdRef.current = null
    setSelectedPartitionId(null)
    selectedDimensionIdRef.current = null
    setSelectedDimensionId(null)
    underlaySelectedRef.current = false
    setUnderlaySelected(false)
  }, [])

  const fitView = useCallback(() => {
    const fl = currentFloor(docRef.current)
    let bbox = unionBBox(fl.room && fl.room.length >= 3 ? pointsBBox(fl.room) : null, objectsBBox(fl.objects))
    bbox = unionBBox(bbox, fl.partitions.length > 0 ? pointsBBox(fl.partitions.flatMap((p) => p.pts)) : null)
    bbox = unionBBox(bbox, fl.dimensions.length > 0 ? pointsBBox(fl.dimensions.flatMap((d) => [d.a, d.b])) : null)
    if (!bbox) bbox = { minX: 0, minY: 0, maxX: 600, maxY: 500 }
    const pad = 60
    const wCm = Math.max(100, bbox.maxX - bbox.minX + pad * 2)
    const hCm = Math.max(100, bbox.maxY - bbox.minY + pad * 2)
    const { w, h } = sizeRef.current
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((w - 24) / wCm, (h - 24) / hCm)))
    viewRef.current = {
      scale,
      ox: (w - (bbox.maxX - bbox.minX) * scale) / 2 - bbox.minX * scale,
      oy: (h - (bbox.maxY - bbox.minY) * scale) / 2 - bbox.minY * scale,
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawScene(ctx, sizeRef.current.w, sizeRef.current.h, docRef.current, viewRef.current, {
      showGrid: showGridRef.current,
      selectedId: selectedIdRef.current,
      drawingPts: drawingPtsRef.current,
      cursor: cursorPlanRef.current,
      ghost: ghostRef.current,
      draggingVertex: dragVertexRef.current,
      showVertexHandles: toolRef.current === 'select' && !placePresetRef.current,
      underlaySelected: underlaySelectedRef.current,
      selectedPartitionId: selectedPartitionIdRef.current,
      draggingPartitionVertex: partitionVertexRef.current,
      drawingMode: toolRef.current === 'partition' ? 'partition' : toolRef.current === 'dimension' ? 'dimension' : 'room',
      layers: docRef.current.layers,
      selectedDimensionId: selectedDimensionIdRef.current,
      ruler: rulerRef.current,
      onImageLoad: () => drawRef.current(),
    })
    if (zoomRef.current) zoomRef.current.textContent = `${Math.round(viewRef.current.scale * 100)}%`
  }, [])

  useEffect(() => void (drawRef.current = draw), [draw])

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const v = viewRef.current
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const plan = screenToPlan(px, py, v)
      viewRef.current = { scale: ns, ox: px - plan.x * ns, oy: py - plan.y * ns }
      userViewRef.current = true
      draw()
    },
    [draw],
  )

  const zoomCenter = useCallback(
    (factor: number) => {
      const { w, h } = sizeRef.current
      zoomAt(w / 2, h / 2, factor)
    },
    [zoomAt],
  )

  // ---------- размеры канваса ----------
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      sizeRef.current = { w: r.width, h: r.height }
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      if (!userViewRef.current) fitView()
      draw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw, fitView])

  // ---------- загрузка из localStorage ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsedJson = JSON.parse(raw)
        const parsed = validateSaveFile(parsedJson)
        if (parsed) {
          docRef.current = parsed
          setDoc(parsed)
          const sg = (parsedJson as { showGrid?: unknown }).showGrid
          if (typeof sg === 'boolean') {
            showGridRef.current = sg
            setShowGrid(sg)
          }
        }
      }
    } catch {
      // повреждённое сохранение — игнорируем
    }
    loadedRef.current = true
  }, [])

  // ---------- автосохранение ----------
  useEffect(() => {
    if (!loadedRef.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(makeSaveFile(doc, showGrid)))
        setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
      } catch {
        // нет доступа к localStorage
      }
    }, 500)
    return () => clearTimeout(t)
  }, [doc, showGrid])

  // ---------- перерисовка при изменении состояния ----------
  useEffect(() => {
    draw()
  }, [doc, showGrid, tool, selectedId, placePreset, underlaySelected, selectedPartitionId, selectedDimensionId, draw])

  // ---------- очистка выделения ----------
  useEffect(() => {
    const fl = currentFloor(doc)
    if (selectedId && !fl.objects.some((o) => o.id === selectedId)) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
  }, [doc, selectedId])

  useEffect(() => {
    const fl = currentFloor(doc)
    if (selectedPartitionId && !fl.partitions.some((p) => p.id === selectedPartitionId)) {
      selectedPartitionIdRef.current = null
      setSelectedPartitionId(null)
    }
  }, [doc, selectedPartitionId])

  useEffect(() => {
    const fl = currentFloor(doc)
    if (selectedDimensionId && !fl.dimensions.some((d) => d.id === selectedDimensionId)) {
      selectedDimensionIdRef.current = null
      setSelectedDimensionId(null)
    }
  }, [doc, selectedDimensionId])

  // ---------- действия ----------
  const startWallDrawing = useCallback(() => {
    drawingPtsRef.current = []
    cursorPlanRef.current = null
    placePresetRef.current = null
    setPlacePreset(null)
    toolRef.current = 'wall'
    setTool('wall')
    draw()
  }, [draw])

  const handleToolChange = useCallback(
    (t: Tool) => {
      if (toolRef.current !== t) {
        drawingPtsRef.current = null
        rulerRef.current = null
      }
      if (t !== 'select') {
        placePresetRef.current = null
        setPlacePreset(null)
        ghostRef.current = null
      }
      toolRef.current = t
      setTool(t)
      draw()
    },
    [draw],
  )

  const closeRoom = useCallback(() => {
    const pts = drawingPtsRef.current
    if (!pts) return
    if (pts.length < 3) {
      drawingPtsRef.current = null
      draw()
      return
    }
    pushHistory()
    withFloors((f) => ({ ...f, room: pts }))
    drawingPtsRef.current = null
    cursorPlanRef.current = null
    toolRef.current = 'select'
    setTool('select')
    userViewRef.current = false
    fitView()
    draw()
    toast.success('Комната создана — добавьте объекты из каталога')
  }, [withFloors, pushHistory, fitView, draw])

  /** Привязка точки: вершины → проекция на линии стен → сетка */
  const snapPoint = useCallback((plan: Pt): Pt => {
    const s = viewRef.current.scale
    const fl = currentFloor(docRef.current)
    const radV = 10 / s
    let bestVert: Pt | null = null
    let bestVertD = radV
    const verts = [...(fl.room ?? []), ...fl.partitions.flatMap((p) => p.pts)]
    for (const v of verts) {
      const d = Math.hypot(v.x - plan.x, v.y - plan.y)
      if (d < bestVertD) {
        bestVertD = d
        bestVert = v
      }
    }
    if (bestVert) return bestVert
    const radS = 12 / s
    let bestSeg: Pt | null = null
    let bestSegD = radS
    for (const [a, b] of floorWallSegments(fl)) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((plan.x - a.x) * dx + (plan.y - a.y) * dy) / len2))
      const c = { x: a.x + t * dx, y: a.y + t * dy }
      const d = Math.hypot(c.x - plan.x, c.y - plan.y)
      if (d < bestSegD) {
        bestSegD = d
        bestSeg = c
      }
    }
    if (bestSeg) return bestSeg
    const step = docRef.current.gridStep
    return { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
  }, [])

  /** Завершить рисование перегородки: Enter, клик по последней точке или двойной клик */
  const finishPartition = useCallback(() => {
    const pts = drawingPtsRef.current
    if (!pts) return
    drawingPtsRef.current = null
    cursorPlanRef.current = null
    // убираем дубли точек от прилипания
    const cleaned: Pt[] = []
    for (const p of pts) {
      const q = cleaned[cleaned.length - 1]
      if (!q || Math.hypot(q.x - p.x, q.y - p.y) > 1) cleaned.push(p)
    }
    if (cleaned.length >= 2) {
      pushHistory()
      const part = { id: uid(), pts: cleaned }
      withFloors((f) => ({ ...f, partitions: [...f.partitions, part] }))
      toast.success('Перегородка добавлена — можно рисовать следующую, Esc — выйти из режима')
    }
    draw()
  }, [withFloors, pushHistory, draw])

  const deletePartition = useCallback(
    (id: string) => {
      pushHistory()
      withFloors((f) => ({ ...f, partitions: f.partitions.filter((p) => p.id !== id) }))
      toast('Перегородка удалена', { icon: '🗑️' })
    },
    [withFloors, pushHistory],
  )

  /** Привязка двери/окна к ближайшей стене */
  const doorWindowSnap = useCallback((presetId: string, plan: Pt): { x: number; y: number; angle: number } | null => {
    if (!isDoorWindowPreset(presetId)) return null
    const s = viewRef.current.scale
    const hit = nearestWall(currentFloor(docRef.current), plan, Math.max(20, 14 / s))
    if (!hit) return null
    return { x: hit.pt.x, y: hit.pt.y, angle: hit.ang }
  }, [])

  const placeObject = useCallback(
    (plan: Pt, keep: boolean) => {
      const preset = placePresetRef.current
      if (!preset) return
      let x = plan.x
      let y = plan.y
      let angle = 0
      const snap = doorWindowSnap(preset.id, plan)
      if (snap) {
        x = snap.x
        y = snap.y
        angle = snap.angle
      } else if (showGridRef.current) {
        const s = snapObjectPos({ x, y, w: preset.w, h: preset.h }, docRef.current.gridStep)
        x = s.x
        y = s.y
      }
      const obj: PlannerObject = {
        id: uid(),
        presetId: preset.id,
        name: preset.name,
        x,
        y,
        w: preset.w,
        h: preset.h,
        angle,
        color: preset.color,
      }
      if (preset.layer) obj.layer = preset.layer
      if (preset.showNext) obj.showNext = true
      pushHistory()
      withFloors((f) => ({ ...f, objects: [...f.objects, obj] }))
      selectedIdRef.current = obj.id
      setSelectedId(obj.id)
      if (!keep) {
        placePresetRef.current = null
        setPlacePreset(null)
        ghostRef.current = null
      }
    },
    [doorWindowSnap, withFloors, pushHistory],
  )

  const deleteObject = useCallback(
    (id: string) => {
      pushHistory()
      withFloors((f) => ({ ...f, objects: f.objects.filter((o) => o.id !== id) }))
      toast('Объект удалён', { icon: '🗑️' })
    },
    [withFloors, pushHistory],
  )

  const duplicateObject = useCallback(
    (id: string) => {
      const o = currentFloor(docRef.current).objects.find((x) => x.id === id)
      if (!o) return
      pushHistory()
      const copy: PlannerObject = { ...o, id: uid(), x: o.x + 20, y: o.y + 20 }
      withFloors((f) => ({ ...f, objects: [...f.objects, copy] }))
      selectedIdRef.current = copy.id
      setSelectedId(copy.id)
    },
    [withFloors, pushHistory],
  )

  const updateObject = useCallback(
    (id: string, patch: Partial<PlannerObject>) => {
      withFloors((f) => ({ ...f, objects: f.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))
    },
    [withFloors],
  )

  /** Отзеркалить объект (горизонтально) */
  const toggleMirror = useCallback(
    (id: string) => {
      const o = currentFloor(docRef.current).objects.find((x) => x.id === id)
      if (!o) return
      pushHistory()
      updateObject(id, { flip: !o.flip })
      toast.success(o.flip ? 'Зеркалирование отменено' : 'Объект отзеркален')
    },
    [pushHistory, updateObject],
  )

  const deleteDimension = useCallback(
    (id: string) => {
      pushHistory()
      withFloors((f) => ({ ...f, dimensions: f.dimensions.filter((d) => d.id !== id) }))
      toast('Размер удалён', { icon: '🗑️' })
    },
    [withFloors, pushHistory],
  )

  const addDimension = useCallback(
    (a: Pt, b: Pt) => {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return
      pushHistory()
      const dim: Dimension = { id: uid(), a: { ...a }, b: { ...b } }
      withFloors((f) => ({ ...f, dimensions: [...f.dimensions, dim] }))
      toast.success('Размер зафиксирован')
    },
    [withFloors, pushHistory],
  )

  /** Ластик: удалить часть стены (вершину комнаты / сегмент перегородки) или размер */
  const eraseAt = useCallback(
    (plan: Pt) => {
      const s = viewRef.current.scale
      const fl = currentFloor(docRef.current)
      // 1) сегмент перегородки
      let bestPart: { id: string; seg: number } | null = null
      let bestD = 9 / s
      for (const part of fl.partitions) {
        for (let j = 0; j < part.pts.length - 1; j++) {
          const d = distToSegment(plan, part.pts[j], part.pts[j + 1])
          if (d < bestD) {
            bestD = d
            bestPart = { id: part.id, seg: j }
          }
        }
      }
      if (bestPart) {
        const part = fl.partitions.find((p) => p.id === bestPart!.id)!
        pushHistory()
        if (part.pts.length === 2) {
          withFloors((f) => ({ ...f, partitions: f.partitions.filter((p) => p.id !== part.id) }))
          toast('Перегородка удалена', { icon: '🧽' })
        } else if (bestPart.seg === 0) {
          withFloors((f) => ({
            ...f,
            partitions: f.partitions.map((p) => (p.id === part.id ? { ...p, pts: p.pts.slice(1) } : p)),
          }))
          toast('Часть перегородки удалена', { icon: '🧽' })
        } else if (bestPart.seg === part.pts.length - 2) {
          withFloors((f) => ({
            ...f,
            partitions: f.partitions.map((p) => (p.id === part.id ? { ...p, pts: p.pts.slice(0, -1) } : p)),
          }))
          toast('Часть перегородки удалена', { icon: '🧽' })
        } else {
          // разрезаем полилинию на две
          const p1 = { id: uid(), pts: part.pts.slice(0, bestPart.seg + 2) }
          const p2 = { id: uid(), pts: part.pts.slice(bestPart.seg + 1) }
          withFloors((f) => ({
            ...f,
            partitions: f.partitions.flatMap((p) => (p.id === part.id ? [p1, p2] : [p])),
          }))
          toast('Сегмент удалён — перегородка разделена', { icon: '🧽' })
        }
        draw()
        return
      }
      // 2) вершина комнаты
      if (fl.room) {
        for (let i = 0; i < fl.room.length; i++) {
          if (Math.hypot((fl.room[i].x - plan.x) * s, (fl.room[i].y - plan.y) * s) < 9) {
            pushHistory()
            const room = fl.room.filter((_, k) => k !== i)
            withFloors((f) => ({ ...f, room: room.length >= 3 ? room : null }))
            toast(room.length >= 3 ? 'Стена удалена' : 'Стены удалены', { icon: '🧽' })
            draw()
            return
          }
        }
      }
      // 3) выноска-размер
      for (const d of fl.dimensions) {
        if (distToSegment(plan, d.a, d.b) * s < 8) {
          deleteDimension(d.id)
          draw()
          return
        }
      }
    },
    [deleteDimension, draw, pushHistory, withFloors],
  )

  const clearRoom = useCallback(() => {
    if (!currentFloor(docRef.current).room) return
    pushHistory()
    withFloors((f) => ({ ...f, room: null }))
    toast('Стены удалены — нарисуйте новый контур')
  }, [withFloors, pushHistory])

  // ---------- этажи ----------
  /** Переход на этаж: область просмотра сохраняется как есть — в центре остаётся та же часть проекта */
  const switchFloorTo = useCallback(
    (id: string) => {
      const d = docRef.current
      if (id === d.currentFloorId) return
      applyDoc({ ...d, currentFloorId: id })
      clearSelection()
      drawingPtsRef.current = null
      rulerRef.current = null
      draw()
    },
    [applyDoc, clearSelection, draw],
  )

  const addFloor = useCallback(() => {
    const d = docRef.current
    if (d.floors.length >= MAX_FLOORS) {
      toast.error(`Максимум ${MAX_FLOORS} этажей`)
      return
    }
    pushHistory()
    const f = emptyFloor(`Этаж ${d.floors.length + 1}`)
    applyDoc({ ...d, floors: [...d.floors, f], currentFloorId: f.id })
    clearSelection()
    drawingPtsRef.current = null
    toast.success(`Добавлен ${f.name}`)
  }, [applyDoc, clearSelection, pushHistory])

  const copyFloor = useCallback(() => {
    const d = docRef.current
    if (d.floors.length >= MAX_FLOORS) {
      toast.error(`Максимум ${MAX_FLOORS} этажей`)
      return
    }
    const src = currentFloor(d)
    pushHistory()
    const copy: Floor = {
      id: uid(),
      name: `${src.name} — копия`,
      room: src.room ? src.room.map((p) => ({ ...p })) : null,
      partitions: src.partitions.map((p) => ({ id: uid(), pts: p.pts.map((q) => ({ ...q })) })),
      objects: src.objects.map((o) => ({ ...o, id: uid() })),
      dimensions: src.dimensions.map((m) => ({ id: uid(), a: { ...m.a }, b: { ...m.b } })),
      underlay: src.underlay ? { ...src.underlay } : null,
    }
    const idx = d.floors.findIndex((f) => f.id === src.id)
    const floors = [...d.floors]
    floors.splice(idx + 1, 0, copy)
    applyDoc({ ...d, floors, currentFloorId: copy.id })
    clearSelection()
    drawingPtsRef.current = null
    toast.success(`Создан «${copy.name}» — все объекты скопированы`)
  }, [applyDoc, clearSelection, pushHistory])

  const deleteCurrentFloor = useCallback(() => {
    const d = docRef.current
    if (d.floors.length <= 1) {
      toast.error('Нельзя удалить единственный этаж')
      return
    }
    pushHistory()
    const idx = d.floors.findIndex((f) => f.id === d.currentFloorId)
    const floors = d.floors.filter((f) => f.id !== d.currentFloorId)
    const currentFloorId = floors[Math.max(0, idx - 1)]?.id ?? floors[0].id
    applyDoc({ ...d, floors, currentFloorId })
    clearSelection()
    drawingPtsRef.current = null
    toast('Этаж удалён', { icon: '🗑️' })
  }, [applyDoc, clearSelection, pushHistory])

  const toggleLayer = useCallback(
    (id: ObjLayer) => {
      const d = docRef.current
      applyDoc({ ...d, layers: { ...d.layers, [id]: !d.layers[id] } })
    },
    [applyDoc],
  )

  // ---------- подложка ----------
  const handleUnderlayFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      if (!file.type.startsWith('image/')) {
        toast.error('Выберите файл изображения (PNG, JPG, WebP)')
        return
      }
      try {
        const { src, imgW, imgH, bytes } = await fileToUnderlaySource(file)
        const place = computeUnderlayPlacement(imgW, imgH, docRef.current, sizeRef.current, viewRef.current)
        pushHistory()
        withFloors((f) => ({
          ...f,
          underlay: { src, imgW, imgH, x: place.x, y: place.y, w: place.w, h: place.h, angle: 0, opacity: 0.55, visible: true },
        }))
        clearSelection()
        underlaySelectedRef.current = true
        setUnderlaySelected(true)
        if (bytes > 3 * 1024 * 1024) {
          toast.warning('Подложка добавлена, но файл большой — автосохранение может замедлиться')
        } else {
          toast.success('Подложка добавлена — задайте ей точную ширину в панели справа')
        }
      } catch {
        toast.error('Не удалось прочитать изображение')
      }
    },
    [clearSelection, pushHistory, withFloors],
  )

  const updateUnderlay = useCallback(
    (patch: Partial<Underlay>) => {
      const u = currentFloor(docRef.current).underlay
      if (!u) return
      withFloors((f) => ({ ...f, underlay: { ...(f.underlay as Underlay), ...patch } }))
    },
    [withFloors],
  )

  const removeUnderlay = useCallback(() => {
    if (!currentFloor(docRef.current).underlay) return
    pushHistory()
    withFloors((f) => ({ ...f, underlay: null }))
    underlaySelectedRef.current = false
    setUnderlaySelected(false)
    toast('Подложка удалена', { icon: '🗑️' })
  }, [withFloors, pushHistory])

  const fitUnderlay = useCallback(() => {
    const u = currentFloor(docRef.current).underlay
    if (!u) return
    const place = computeUnderlayPlacement(u.imgW, u.imgH, docRef.current, sizeRef.current, viewRef.current)
    pushHistory()
    withFloors((f) => ({ ...f, underlay: { ...(f.underlay as Underlay), ...place } }))
  }, [withFloors, pushHistory])

  const selectUnderlay = useCallback(() => {
    clearSelection()
    underlaySelectedRef.current = true
    setUnderlaySelected(true)
    draw()
  }, [clearSelection, draw])

  const handleNew = useCallback(() => {
    pushHistory()
    const d = docRef.current
    applyDoc({ ...makeDoc(), gridStep: d.gridStep, layers: { ...d.layers } })
    clearSelection()
    drawingPtsRef.current = null
    rulerRef.current = null
    ghostRef.current = null
    userViewRef.current = false
    fitView()
    draw()
    toast('Создан новый проект')
  }, [applyDoc, clearSelection, pushHistory, fitView, draw])

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const text = await file.text()
        const parsed = validateSaveFile(JSON.parse(text))
        if (!parsed) throw new Error('bad file')
        pushHistory()
        applyDoc(parsed)
        clearSelection()
        drawingPtsRef.current = null
        rulerRef.current = null
        userViewRef.current = false
        fitView()
        draw()
        toast.success('Проект загружен из файла')
      } catch {
        toast.error('Не удалось прочитать файл проекта')
      }
    },
    [applyDoc, clearSelection, pushHistory, fitView, draw],
  )

  const handlePickPreset = useCallback(
    (p: Preset) => {
      placePresetRef.current = p
      setPlacePreset(p)
      drawingPtsRef.current = null
      rulerRef.current = null
      clearSelection()
      toolRef.current = 'select'
      setTool('select')
      draw()
    },
    [clearSelection, draw],
  )

  // ---------- слушатели мыши и клавиатуры ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const getPos = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const updateCoords = (plan: Pt | null) => {
      if (!coordsRef.current) return
      coordsRef.current.textContent = plan
        ? `X: ${Math.round(plan.x)} · Y: ${Math.round(plan.y)} см`
        : '—'
    }

    const updateCursorStyle = (plan: Pt | null) => {
      if (spaceRef.current || toolRef.current === 'pan' || interRef.current.type === 'pan') {
        canvas.style.cursor = interRef.current.type === 'pan' ? CURSOR_GRABBING : CURSOR_GRAB
        return
      }
      if (placePresetRef.current) {
        canvas.style.cursor = CURSOR_PLACE
        return
      }
      if (toolRef.current === 'wall') {
        canvas.style.cursor = CURSOR_WALL
        return
      }
      if (toolRef.current === 'partition') {
        canvas.style.cursor = CURSOR_PARTITION
        return
      }
      if (toolRef.current === 'erase') {
        canvas.style.cursor = CURSOR_ERASE
        return
      }
      if (toolRef.current === 'ruler') {
        canvas.style.cursor = CURSOR_RULER
        return
      }
      if (toolRef.current === 'dimension') {
        canvas.style.cursor = CURSOR_DIM
        return
      }
      if (plan) {
        const fl = currentFloor(docRef.current)
        const vis = docRef.current.layers
        const sel = fl.objects.find((o) => o.id === selectedIdRef.current)
        if (sel) {
          const hp = rotateHandlePos(sel, 26 / viewRef.current.scale)
          if (Math.hypot((hp.x - plan.x) * viewRef.current.scale, (hp.y - plan.y) * viewRef.current.scale) < 10) {
            canvas.style.cursor = CURSOR_ROTATE
            return
          }
        }
        if (fl.room) {
          for (const p of fl.room) {
            if (Math.hypot((p.x - plan.x) * viewRef.current.scale, (p.y - plan.y) * viewRef.current.scale) < 9) {
              canvas.style.cursor = CURSOR_VERTEX
              return
            }
          }
        }
        const selPart = fl.partitions.find((p) => p.id === selectedPartitionIdRef.current)
        if (selPart) {
          for (const p of selPart.pts) {
            if (Math.hypot((p.x - plan.x) * viewRef.current.scale, (p.y - plan.y) * viewRef.current.scale) < 9) {
              canvas.style.cursor = CURSOR_VERTEX
              return
            }
          }
        }
        for (let i = fl.objects.length - 1; i >= 0; i--) {
          const o = fl.objects[i]
          if (!vis[o.layer ?? 'furniture']) continue
          if (pointInObject(o, plan)) {
            canvas.style.cursor = CURSOR_MOVE
            return
          }
        }
        for (const part of fl.partitions) {
          for (let j = 0; j < part.pts.length - 1; j++) {
            if (distToSegment(plan, part.pts[j], part.pts[j + 1]) * viewRef.current.scale < 8) {
              canvas.style.cursor = CURSOR_ARROW
              return
            }
          }
        }
        for (const d of fl.dimensions) {
          if (distToSegment(plan, d.a, d.b) * viewRef.current.scale < 8) {
            canvas.style.cursor = CURSOR_ARROW
            return
          }
        }
        const u = fl.underlay
        if (u && u.visible && pointInRect(u, plan)) {
          canvas.style.cursor = CURSOR_MOVE
          return
        }
      }
      canvas.style.cursor = CURSOR_ARROW
    }

    const onPointerDown = (e: PointerEvent) => {
      const pos = getPos(e)
      const plan = screenToPlan(pos.x, pos.y, viewRef.current)

      // панорамирование: средняя кнопка, пробел или инструмент «Рука»
      if (e.button === 1 || spaceRef.current || (toolRef.current === 'pan' && e.button === 0)) {
        e.preventDefault()
        interRef.current = {
          type: 'pan',
          panStart: { ox: viewRef.current.ox, oy: viewRef.current.oy, px: pos.x, py: pos.y },
        }
        canvas.style.cursor = CURSOR_GRABBING
        return
      }

      if (e.button === 2) {
        // ПКМ в режимах стен/перегородок/размеров — убрать последнюю точку
        if (
          (toolRef.current === 'wall' || toolRef.current === 'partition' || toolRef.current === 'dimension') &&
          drawingPtsRef.current &&
          drawingPtsRef.current.length > 0
        ) {
          e.preventDefault()
          const pts = [...drawingPtsRef.current]
          pts.pop()
          drawingPtsRef.current = pts
          draw()
        }
        return
      }
      if (e.button !== 0) return

      // рисование стен
      if (toolRef.current === 'wall') {
        const pts = drawingPtsRef.current ?? []
        if (pts.length >= 3) {
          const f = pts[0]
          if (Math.hypot(plan.x - f.x, plan.y - f.y) * viewRef.current.scale < 12) {
            closeRoom()
            return
          }
        }
        const step = docRef.current.gridStep
        drawingPtsRef.current = [...pts, { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }]
        draw()
        return
      }

      // рисование перегородок
      if (toolRef.current === 'partition') {
        const pts = drawingPtsRef.current ?? []
        // клик по последней точке — завершить (работает и как двойной клик)
        if (pts.length >= 2) {
          const last = pts[pts.length - 1]
          if (Math.hypot(plan.x - last.x, plan.y - last.y) * viewRef.current.scale < 10) {
            finishPartition()
            return
          }
        }
        drawingPtsRef.current = [...pts, snapPoint(plan)]
        draw()
        return
      }

      // рулетка: зажать и протянуть
      if (toolRef.current === 'ruler') {
        const step = docRef.current.gridStep
        const p =
          showGridRef.current && !e.altKey
            ? { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
            : { x: plan.x, y: plan.y }
        rulerRef.current = { a: p, b: p }
        interRef.current = { type: 'ruler' }
        draw()
        return
      }

      // выноска-размер: клик — начало, клик — конец
      if (toolRef.current === 'dimension') {
        const pts = drawingPtsRef.current
        if (!pts) {
          drawingPtsRef.current = [snapPoint(plan)]
        } else {
          const a = pts[0]
          const b = snapPoint(plan)
          drawingPtsRef.current = null
          cursorPlanRef.current = null
          addDimension(a, b)
        }
        draw()
        return
      }

      // ластик
      if (toolRef.current === 'erase') {
        eraseAt(plan)
        return
      }

      // размещение объекта
      if (placePresetRef.current) {
        placeObject(plan, e.shiftKey)
        return
      }

      // инструмент выбора
      if (underlaySelectedRef.current) {
        underlaySelectedRef.current = false
        setUnderlaySelected(false)
      }
      const fl = currentFloor(docRef.current)
      const vis = docRef.current.layers
      const sel = fl.objects.find((o) => o.id === selectedIdRef.current)
      if (sel) {
        const hp = rotateHandlePos(sel, 26 / viewRef.current.scale)
        if (Math.hypot((hp.x - plan.x) * viewRef.current.scale, (hp.y - plan.y) * viewRef.current.scale) < 10) {
          pushHistory()
          interRef.current = { type: 'rotate' }
          canvas.style.cursor = CURSOR_GRABBING
          return
        }
      }
      if (fl.room) {
        const room = fl.room
        for (let i = 0; i < room.length; i++) {
          if (Math.hypot((room[i].x - plan.x) * viewRef.current.scale, (room[i].y - plan.y) * viewRef.current.scale) < 9) {
            pushHistory()
            clearSelection()
            interRef.current = { type: 'vertex', vertexIdx: i }
            dragVertexRef.current = i
            return
          }
        }
      }
      // узлы выбранной перегородки — перетаскивание
      const selPart = fl.partitions.find((p) => p.id === selectedPartitionIdRef.current)
      if (selPart) {
        for (let i = 0; i < selPart.pts.length; i++) {
          if (Math.hypot((selPart.pts[i].x - plan.x) * viewRef.current.scale, (selPart.pts[i].y - plan.y) * viewRef.current.scale) < 9) {
            pushHistory()
            clearSelection()
            interRef.current = { type: 'partitionVertex', partitionId: selPart.id, vertexIdx: i }
            partitionVertexRef.current = i
            return
          }
        }
      }
      for (let i = fl.objects.length - 1; i >= 0; i--) {
        const o = fl.objects[i]
        if (!vis[o.layer ?? 'furniture']) continue
        if (pointInObject(o, plan)) {
          clearSelection()
          selectedIdRef.current = o.id
          setSelectedId(o.id)
          pushHistory()
          interRef.current = { type: 'drag', grabDX: plan.x - o.x, grabDY: plan.y - o.y, moved: false }
          canvas.style.cursor = CURSOR_GRABBING
          return
        }
      }
      // перегородки — выбор кликом по сегменту
      for (let i = fl.partitions.length - 1; i >= 0; i--) {
        const part = fl.partitions[i]
        let hit = false
        for (let j = 0; j < part.pts.length - 1; j++) {
          if (distToSegment(plan, part.pts[j], part.pts[j + 1]) * viewRef.current.scale < 8) {
            hit = true
            break
          }
        }
        if (hit) {
          clearSelection()
          selectedPartitionIdRef.current = part.id
          setSelectedPartitionId(part.id)
          draw()
          return
        }
      }
      // выноски-размеры — выбор кликом
      for (let i = fl.dimensions.length - 1; i >= 0; i--) {
        const d = fl.dimensions[i]
        if (distToSegment(plan, d.a, d.b) * viewRef.current.scale < 8) {
          clearSelection()
          selectedDimensionIdRef.current = d.id
          setSelectedDimensionId(d.id)
          draw()
          return
        }
      }
      // подложка — выделение и перетаскивание
      const u = fl.underlay
      if (u && u.visible && pointInRect(u, plan)) {
        clearSelection()
        underlaySelectedRef.current = true
        setUnderlaySelected(true)
        pushHistory()
        interRef.current = { type: 'underlayDrag', grabDX: plan.x - u.x, grabDY: plan.y - u.y, moved: false }
        canvas.style.cursor = CURSOR_GRABBING
        return
      }
      // пустое место — снять выделение
      clearSelection()
    }

    const onPointerMove = (e: PointerEvent) => {
      const pos = getPos(e)
      pointerScreenRef.current = pos
      const plan = screenToPlan(pos.x, pos.y, viewRef.current)
      cursorPlanRef.current = plan
      updateCoords(plan)
      const it = interRef.current

      if (it.type === 'pan' && it.panStart) {
        viewRef.current = {
          ...viewRef.current,
          ox: it.panStart.ox + (pos.x - it.panStart.px),
          oy: it.panStart.oy + (pos.y - it.panStart.py),
        }
        userViewRef.current = true
        draw()
        return
      }

      if (it.type === 'ruler' && rulerRef.current) {
        const step = docRef.current.gridStep
        rulerRef.current = {
          ...rulerRef.current,
          b:
            showGridRef.current && !e.altKey
              ? { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
              : { x: plan.x, y: plan.y },
        }
        draw()
        return
      }

      if (it.type === 'drag') {
        const o = currentFloor(docRef.current).objects.find((x) => x.id === selectedIdRef.current)
        const gdx = it.grabDX
        const gdy = it.grabDY
        if (!o || gdx === undefined || gdy === undefined) return
        let nx = plan.x - gdx
        let ny = plan.y - gdy
        if (showGridRef.current && !e.altKey) {
          const s = snapObjectPos({ x: nx, y: ny, w: o.w, h: o.h }, docRef.current.gridStep)
          nx = s.x
          ny = s.y
        }
        // двери и окна прилипают к стенам (приоритет над сеткой)
        const snap = doorWindowSnap(o.presetId, { x: nx, y: ny })
        it.moved = true
        if (snap) {
          updateObject(o.id, { x: snap.x, y: snap.y, angle: snap.angle })
        } else {
          updateObject(o.id, { x: nx, y: ny })
        }
        return
      }

      if (it.type === 'underlayDrag') {
        const u = currentFloor(docRef.current).underlay
        const gdx = it.grabDX
        const gdy = it.grabDY
        if (!u || gdx === undefined || gdy === undefined) return
        let nx = plan.x - gdx
        let ny = plan.y - gdy
        if (showGridRef.current && !e.altKey) {
          nx = snapValue(nx - u.w / 2, docRef.current.gridStep) + u.w / 2
          ny = snapValue(ny - u.h / 2, docRef.current.gridStep) + u.h / 2
        }
        it.moved = true
        updateUnderlay({ x: nx, y: ny })
        return
      }

      if (it.type === 'rotate') {
        const o = currentFloor(docRef.current).objects.find((x) => x.id === selectedIdRef.current)
        if (!o) return
        let angle = (Math.atan2(plan.y - o.y, plan.x - o.x) * 180) / Math.PI + 90
        if (!e.altKey) angle = Math.round(angle / 15) * 15
        angle = ((((angle + 180) % 360) + 360) % 360) - 180
        updateObject(o.id, { angle })
        return
      }

      if (it.type === 'vertex' && it.vertexIdx !== undefined) {
        const fl = currentFloor(docRef.current)
        if (!fl.room) return
        const idx = it.vertexIdx
        const step = docRef.current.gridStep
        const np = e.altKey ? { x: plan.x, y: plan.y } : { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
        withFloors((f) => ({ ...f, room: (f.room ?? []).map((p, i) => (i === idx ? np : p)) }))
        return
      }

      if (it.type === 'partitionVertex' && it.partitionId && it.vertexIdx !== undefined) {
        const idx = it.vertexIdx
        const pid = it.partitionId
        const step = docRef.current.gridStep
        const np = e.altKey ? { x: plan.x, y: plan.y } : { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
        withFloors((f) => ({
          ...f,
          partitions: f.partitions.map((p) => (p.id === pid ? { ...p, pts: p.pts.map((q, i) => (i === idx ? np : q)) } : p)),
        }))
        return
      }

      // без зажатой кнопки: призрак и курсор
      if (placePresetRef.current) {
        const p = placePresetRef.current
        let gx = plan.x
        let gy = plan.y
        let ga = 0
        const snap = doorWindowSnap(p.id, plan)
        if (snap) {
          gx = snap.x
          gy = snap.y
          ga = snap.angle
        } else if (showGridRef.current) {
          const s = snapObjectPos({ x: gx, y: gy, w: p.w, h: p.h }, docRef.current.gridStep)
          gx = s.x
          gy = s.y
        }
        const ghost: PlannerObject = { id: 'ghost', presetId: p.id, name: p.name, x: gx, y: gy, w: p.w, h: p.h, angle: ga, color: p.color }
        if (p.layer) ghost.layer = p.layer
        ghostRef.current = ghost
        draw()
      } else if ((toolRef.current === 'wall' || toolRef.current === 'partition' || toolRef.current === 'dimension') && drawingPtsRef.current) {
        if (toolRef.current === 'partition' || toolRef.current === 'dimension') {
          // резиновая нить показывает точку с прилипанием
          const snapped = snapPoint(plan)
          cursorPlanRef.current = snapped
          updateCoords(snapped)
        }
        draw()
      }
      updateCursorStyle(plan)
    }

    const onPointerUp = () => {
      const it = interRef.current
      if ((it.type === 'drag' || it.type === 'underlayDrag') && !it.moved) {
        // клик без перемещения — убрать пустой шаг истории
        historyRef.current.past.pop()
        setHist({ p: historyRef.current.past.length, f: historyRef.current.future.length })
      }
      if (it.type === 'vertex') dragVertexRef.current = null
      if (it.type === 'partitionVertex') partitionVertexRef.current = null
      interRef.current = { type: 'none' }
      updateCursorStyle(cursorPlanRef.current)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const pos = getPos(e)
      const factor = Math.exp(-e.deltaY * 0.0012)
      zoomAt(pos.x, pos.y, factor)
    }

    const onDoubleClick = () => {
      if (toolRef.current === 'wall' && drawingPtsRef.current && drawingPtsRef.current.length >= 3) {
        closeRoom()
      }
    }

    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return

      if (e.code === 'Space') {
        if (!spaceRef.current) spaceRef.current = true
        e.preventDefault()
        updateCursorStyle(cursorPlanRef.current)
        return
      }

      const mod = e.ctrlKey || e.metaKey

      if (mod && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.code === 'KeyD') {
        e.preventDefault()
        if (selectedIdRef.current) duplicateObject(selectedIdRef.current)
        return
      }

      if (e.key === 'Escape') {
        if (drawingPtsRef.current) {
          drawingPtsRef.current = null
          cursorPlanRef.current = null
          draw()
        } else if (rulerRef.current) {
          rulerRef.current = null
          draw()
        } else if (placePresetRef.current) {
          placePresetRef.current = null
          setPlacePreset(null)
          ghostRef.current = null
          draw()
        } else if (selectedIdRef.current) {
          selectedIdRef.current = null
          setSelectedId(null)
        } else if (selectedPartitionIdRef.current) {
          selectedPartitionIdRef.current = null
          setSelectedPartitionId(null)
        } else if (selectedDimensionIdRef.current) {
          selectedDimensionIdRef.current = null
          setSelectedDimensionId(null)
        } else if (underlaySelectedRef.current) {
          underlaySelectedRef.current = false
          setUnderlaySelected(false)
        }
        return
      }

      if (e.key === 'Enter' && drawingPtsRef.current) {
        if (toolRef.current === 'partition') finishPartition()
        else closeRoom()
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIdRef.current) {
          e.preventDefault()
          deleteObject(selectedIdRef.current)
          return
        }
        if (selectedPartitionIdRef.current) {
          e.preventDefault()
          deletePartition(selectedPartitionIdRef.current)
          return
        }
        if (selectedDimensionIdRef.current) {
          e.preventDefault()
          deleteDimension(selectedDimensionIdRef.current)
          return
        }
      }

      if (e.code === 'KeyR' && selectedIdRef.current) {
        const o = currentFloor(docRef.current).objects.find((x) => x.id === selectedIdRef.current)
        if (o) {
          pushHistory()
          const d = e.shiftKey ? -90 : 90
          updateObject(o.id, { angle: ((((o.angle + d + 180) % 360) + 360) % 360) - 180 })
        }
        return
      }

      if (e.code === 'KeyM' && selectedIdRef.current) {
        e.preventDefault()
        toggleMirror(selectedIdRef.current)
        return
      }

      if (e.code === 'KeyV' || (e.code === 'Digit1' && !e.shiftKey)) handleToolChange('select')
      if (e.code === 'KeyW' || (e.code === 'Digit2' && !e.shiftKey)) handleToolChange('wall')
      if (e.code === 'KeyP' || (e.code === 'Digit3' && !e.shiftKey)) handleToolChange('partition')
      if (e.code === 'KeyH' || (e.code === 'Digit4' && !e.shiftKey)) handleToolChange('pan')
      if (e.code === 'KeyE' || (e.code === 'Digit5' && !e.shiftKey)) handleToolChange('erase')
      if (e.code === 'Digit6' && !e.shiftKey) handleToolChange('ruler')
      if (e.code === 'Digit7' && !e.shiftKey) handleToolChange('dimension')

      // Стрелки: панорама вида (работает и во время рисования стены).
      // Shift+стрелки — сдвиг выделенного объекта на шаг сетки
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        if (e.shiftKey && selectedIdRef.current) {
          const o = currentFloor(docRef.current).objects.find((x) => x.id === selectedIdRef.current)
          if (!o) return
          const step = showGridRef.current ? docRef.current.gridStep : 10
          let dx = 0
          let dy = 0
          if (e.key === 'ArrowLeft') dx = -step
          if (e.key === 'ArrowRight') dx = step
          if (e.key === 'ArrowUp') dy = -step
          if (e.key === 'ArrowDown') dy = step
          const now = Date.now()
          if (now - lastNudgeRef.current > 600) pushHistory()
          lastNudgeRef.current = now
          updateObject(o.id, { x: o.x + dx, y: o.y + dy })
          return
        }
        const panPx = 60
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowLeft') dx = -panPx
        if (e.key === 'ArrowRight') dx = panPx
        if (e.key === 'ArrowUp') dy = -panPx
        if (e.key === 'ArrowDown') dy = panPx
        if (!dx && !dy) return
        viewRef.current = { ...viewRef.current, ox: viewRef.current.ox + dx, oy: viewRef.current.oy + dy }
        userViewRef.current = true
        // пересчитать плановую позицию курсора — превью стены/перегородки прилипнет к курсору после панорамы
        if (pointerScreenRef.current) {
          const plan = screenToPlan(pointerScreenRef.current.x, pointerScreenRef.current.y, viewRef.current)
          cursorPlanRef.current = plan
          updateCoords(plan)
        }
        draw()
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        updateCursorStyle(cursorPlanRef.current)
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDoubleClick)
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDoubleClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    addDimension,
    applyDoc,
    clearSelection,
    closeRoom,
    deleteDimension,
    deleteObject,
    deletePartition,
    doorWindowSnap,
    duplicateObject,
    draw,
    eraseAt,
    finishPartition,
    handleToolChange,
    placeObject,
    pushHistory,
    redo,
    snapPoint,
    toggleMirror,
    undo,
    updateObject,
    updateUnderlay,
    withFloors,
  ])

  const fl = currentFloor(doc)
  const selected = fl.objects.find((o) => o.id === selectedId) ?? null
  const selectedPartition = fl.partitions.find((p) => p.id === selectedPartitionId) ?? null
  const selectedDimension = fl.dimensions.find((d) => d.id === selectedDimensionId) ?? null
  const empty = !fl.room && fl.partitions.length === 0 && fl.objects.length === 0 && !fl.underlay

  const hint = tool === 'wall'
    ? 'Кликайте по углам комнаты · Enter или клик по первой точке — замкнуть · ПКМ — убрать точку · Esc — отмена'
    : tool === 'partition'
      ? 'Перегородки: кликайте точки — линия прилипает к стенам · Enter или клик по последней точке — закончить · ПКМ — убрать точку · Esc — выход'
      : tool === 'erase'
        ? 'Ластик: кликните по сегменту перегородки, вершине стены или размеру, чтобы удалить'
        : tool === 'ruler'
          ? 'Рулетка: зажмите и протяните — покажет длину · Esc — убрать замер'
          : tool === 'dimension'
            ? 'Размеры: кликните начало и конец — выноска зафиксирует длину · Esc — выход'
            : placePreset
              ? `Размещение: ${placePreset.name} — кликните на плане · Shift+клик — несколько · Esc — отмена`
              : underlaySelected
                ? 'Подложка выделена — перетащите её на плане или задайте точные значения в панели справа'
                : null

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col bg-[#F6F1E9] text-[#3D3428]">
      <TopBar
        tool={tool}
        setTool={handleToolChange}
        canUndo={hist.p > 0}
        canRedo={hist.f > 0}
        onUndo={undo}
        onRedo={redo}
        onFit={() => {
          userViewRef.current = false
          fitView()
          draw()
        }}
        onZoomIn={() => {
          zoomCenter(1.25)
        }}
        onZoomOut={() => {
          zoomCenter(0.8)
        }}
        savedAt={savedAt}
        onNew={handleNew}
        onImportClick={() => fileInputRef.current?.click()}
        onUnderlayClick={() => underlayInputRef.current?.click()}
        hasUnderlay={!!fl.underlay}
        onExportPNG={() => {
          exportPNG(docRef.current)
          toast.success('PNG-файл скачивается…')
        }}
        onExportPDF={() => {
          toast.success('PDF-файл скачивается…')
          exportPDF(docRef.current).catch(() => toast.error('Не удалось создать PDF'))
        }}
        onExportJSON={() => {
          exportJSON(docRef.current, showGridRef.current)
          toast.success('JSON-файл скачивается…')
        }}
        onOpen3d={() => {
          if (!fl.room && fl.objects.length === 0) {
            toast.warning('Нарисуйте комнату или добавьте объекты — в 3D пока нечего показывать')
            return
          }
          setView3dOpen(true)
        }}
        floors={doc.floors}
        currentFloorId={doc.currentFloorId}
        onSwitchFloor={switchFloorTo}
        onAddFloor={addFloor}
        onCopyFloor={copyFloor}
        onDeleteFloor={deleteCurrentFloor}
        layers={doc.layers}
        onToggleLayer={toggleLayer}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Каталог */}
        <aside className="order-2 max-h-52 w-full shrink-0 overflow-hidden border-t border-[#E7DECF] bg-[#FBF7EF] lg:order-1 lg:max-h-none lg:w-52 lg:border-t-0 lg:border-r xl:w-60">
          <Catalog placePreset={placePreset} onPlace={handlePickPreset} />
        </aside>

        {/* Холст */}
        <main className="relative order-1 min-h-[44vh] flex-1 lg:order-2 lg:min-h-0" aria-label="План помещения">
          <div ref={wrapRef} className="absolute inset-0">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />
          </div>

          {hint && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-10 max-w-[92%] -translate-x-1/2 rounded-full bg-[#3D3428]/85 px-4 py-1.5 text-center text-[11px] font-medium text-[#FBF7EF] shadow-lg">
              {hint}
            </div>
          )}

          {empty && !hint && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div className="pointer-events-auto max-w-sm rounded-2xl border border-[#EAE0CE] bg-[#FBF7EF]/95 p-6 text-center shadow-xl">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F4E8D4]">
                  <Ruler className="h-6 w-6 text-[#E8730C]" />
                </div>
                <h2 className="text-lg font-bold text-[#3D3428]">Нарисуйте планировку</h2>
                <ol className="mt-2 space-y-1 text-left text-xs leading-relaxed text-[#6B5D4F]">
                  <li>
                    <b>1.</b> Инструментом «Стены» кликните углы комнаты — контур замкнётся автоматически.
                  </li>
                  <li>
                    <b>2.</b> Выберите мебель в каталоге и кликните на плане, чтобы поставить. Двери и окна прилипают к стенам.
                  </li>
                  <li>
                    <b>3.</b> Добавляйте этажи кнопкой «+ Этаж», перегородки — инструментом «Перегородки».
                  </li>
                </ol>
                <Button className="mt-4 h-9 bg-[#E8730C] text-sm font-semibold text-white shadow-sm hover:bg-[#D4660A]" onClick={startWallDrawing}>
                  <PencilLine className="mr-1.5 h-4 w-4" /> Нарисовать стены
                </Button>
              </div>
            </div>
          )}
        </main>

        {/* Свойства */}
        <aside className="order-3 max-h-60 w-full shrink-0 overflow-hidden border-t border-[#E7DECF] bg-[#FBF7EF] lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l">
          <PropertiesPanel
            doc={doc}
            floor={fl}
            showGrid={showGrid}
            selected={selected}
            selectedPartition={selectedPartition}
            selectedDimension={selectedDimension}
            underlay={fl.underlay}
            underlaySelected={underlaySelected}
            onUpdateObject={updateObject}
            onMirrorObject={toggleMirror}
            onCommit={() => pushHistory()}
            onDeleteObject={deleteObject}
            onDuplicateObject={duplicateObject}
            onDeletePartition={deletePartition}
            onDeleteDimension={deleteDimension}
            onClearRoom={clearRoom}
            onSelectUnderlay={selectUnderlay}
            onUpdateUnderlay={updateUnderlay}
            onRemoveUnderlay={removeUnderlay}
            onFitUnderlay={fitUnderlay}
            onReplaceUnderlay={() => underlayInputRef.current?.click()}
            onGridStepChange={(s) => applyDoc({ ...docRef.current, gridStep: s })}
            onToggleGrid={(v) => setShowGrid(v)}
          />
        </aside>
      </div>

      {/* Статусная строка */}
      <footer className="z-10 flex h-8 shrink-0 items-center justify-between border-t border-[#E7DECF] bg-[#FBF7EF] px-3 text-[11px] font-medium text-[#8B7D6B] sm:px-4">
        <span className="truncate">
          {tool === 'wall'
            ? 'Режим: рисование стен'
            : tool === 'partition'
              ? 'Режим: рисование перегородок (P)'
              : tool === 'erase'
                ? 'Режим: ластик (E)'
                : tool === 'ruler'
                  ? 'Режим: рулетка (6)'
                  : tool === 'dimension'
                    ? 'Режим: выноска-размер (7)'
                    : tool === 'pan'
                      ? 'Режим: перетаскивание холста'
                      : 'Режим: выбор и редактирование'}
          {' · '}
          {fl.name} ({doc.floors.length}) · колесо — масштаб · пробел или стрелки — панорама
        </span>
        <div className="flex shrink-0 items-center gap-3 tabular-nums sm:gap-4">
          <span ref={coordsRef} className="hidden sm:inline">
            —
          </span>
          <span>
            Масштаб: <span ref={zoomRef}>—</span>
          </span>
          <span className="hidden md:inline">
            Объектов: {fl.objects.length}
            {fl.partitions.length > 0 ? ` · перегородок: ${fl.partitions.length}` : ''}
            {fl.dimensions.length > 0 ? ` · размеров: ${fl.dimensions.length}` : ''}
          </span>
        </div>
      </footer>

      <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
      <input
        ref={underlayInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        className="hidden"
        onChange={handleUnderlayFile}
      />

      {view3dOpen && <View3dModal doc={doc} onClose={() => setView3dOpen(false)} />}
    </div>
  )
}
