'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Partition, PlannerDoc, PlannerObject, Pt, Underlay, View } from '@/lib/planner/types'
import { DEFAULT_DOC, uid } from '@/lib/planner/types'
import type { Preset } from '@/lib/planner/presets'
import { getPreset } from '@/lib/planner/presets'
import type { Tool } from '@/lib/planner/tools'
import {
  closestOnSegment,
  distToSegment,
  pointInObject,
  pointInRect,
  pointsBBox,
  objectsBBox,
  unionBBox,
  rotateHandlePos,
  screenToPlan,
  snapObjectPos,
  snapValue,
} from '@/lib/planner/geometry'
import { computeUnderlayPlacement, fileToUnderlaySource, packDocForHistory, unpackDocFromHistory } from '@/lib/planner/underlay'
import { drawScene } from '@/lib/planner/draw'
import { exportJSON, exportPNG, makeSaveFile, validateSaveFile } from '@/lib/planner/export'
import { Catalog } from './Catalog'
import { PropertiesPanel } from './PropertiesPanel'
import { TopBar } from './TopBar'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  PencilLine,
  Ruler,
} from 'lucide-react'

const STORAGE_KEY = 'room-planner-v1'
const MIN_SCALE = 0.02
const MAX_SCALE = 2

interface Interaction {
  type: 'none' | 'pan' | 'drag' | 'rotate' | 'vertex' | 'underlayDrag' | 'partitionVertex'
  panStart?: { ox: number; oy: number; px: number; py: number }
  grabDX?: number
  grabDY?: number
  moved?: boolean
  vertexIdx?: number
  partitionId?: string
}

export function Planner() {
  // ---------- состояние ----------
  const [doc, setDoc] = useState<PlannerDoc>(DEFAULT_DOC)
  const [showGrid, setShowGrid] = useState(true)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [placePreset, setPlacePreset] = useState<Preset | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hist, setHist] = useState({ p: 0, f: 0 })
  const [underlaySelected, setUnderlaySelected] = useState(false)
  const [selectedPartitionId, setSelectedPartitionId] = useState<string | null>(null)

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
  const ghostRef = useRef<PlannerObject | null>(null)
  const dragVertexRef = useRef<number | null>(null)
  const spaceRef = useRef(false)
  const userViewRef = useRef(false)
  const loadedRef = useRef(false)
  const lastNudgeRef = useRef(0)
  const underlaySelectedRef = useRef(false)
  const selectedPartitionIdRef = useRef<string | null>(null)
  const partitionVertexRef = useRef<number | null>(null)
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

  const fitView = useCallback(() => {
    const d = docRef.current
    let bbox = unionBBox(d.room && d.room.length >= 3 ? pointsBBox(d.room) : null, objectsBBox(d.objects))
    bbox = unionBBox(bbox, d.partitions.length > 0 ? pointsBBox(d.partitions.flatMap((p) => p.pts)) : null)
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
      drawingMode: toolRef.current === 'partition' ? 'partition' : 'room',
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
          if (typeof parsedJson.showGrid === 'boolean') {
            showGridRef.current = parsedJson.showGrid
            setShowGrid(parsedJson.showGrid)
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
  }, [doc, showGrid, tool, selectedId, placePreset, underlaySelected, selectedPartitionId, draw])

  // ---------- очистка выделения ----------
  useEffect(() => {
    if (selectedId && !doc.objects.some((o) => o.id === selectedId)) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
  }, [doc, selectedId])

  useEffect(() => {
    if (selectedPartitionId && !doc.partitions.some((p) => p.id === selectedPartitionId)) {
      selectedPartitionIdRef.current = null
      setSelectedPartitionId(null)
    }
  }, [doc, selectedPartitionId])

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
      if (toolRef.current !== t) drawingPtsRef.current = null
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
    applyDoc({ ...docRef.current, room: pts })
    drawingPtsRef.current = null
    cursorPlanRef.current = null
    toolRef.current = 'select'
    setTool('select')
    userViewRef.current = false
    fitView()
    draw()
    toast.success('Комната создана — добавьте объекты из каталога')
  }, [applyDoc, pushHistory, fitView, draw])

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
      const part: Partition = { id: uid(), pts: cleaned }
      applyDoc({ ...docRef.current, partitions: [...docRef.current.partitions, part] })
      toast.success('Перегородка добавлена — можно рисовать следующую, Esc — выйти из режима')
    }
    draw()
  }, [applyDoc, pushHistory, draw])

  const deletePartition = useCallback(
    (id: string) => {
      pushHistory()
      applyDoc({ ...docRef.current, partitions: docRef.current.partitions.filter((p) => p.id !== id) })
      toast('Перегородка удалена', { icon: '🗑️' })
    },
    [applyDoc, pushHistory],
  )

  const placeObject = useCallback(
    (plan: Pt, keep: boolean) => {
      const preset = placePresetRef.current
      if (!preset) return
      const step = docRef.current.gridStep
      let x = plan.x
      let y = plan.y
      if (showGridRef.current) {
        const s = snapObjectPos({ x, y, w: preset.w, h: preset.h }, step)
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
        angle: 0,
        color: preset.color,
      }
      pushHistory()
      applyDoc({ ...docRef.current, objects: [...docRef.current.objects, obj] })
      selectedIdRef.current = obj.id
      setSelectedId(obj.id)
      if (!keep) {
        placePresetRef.current = null
        setPlacePreset(null)
        ghostRef.current = null
      }
    },
    [applyDoc, pushHistory],
  )

  const deleteObject = useCallback(
    (id: string) => {
      pushHistory()
      applyDoc({ ...docRef.current, objects: docRef.current.objects.filter((o) => o.id !== id) })
      toast('Объект удалён', { icon: '🗑️' })
    },
    [applyDoc, pushHistory],
  )

  const duplicateObject = useCallback(
    (id: string) => {
      const o = docRef.current.objects.find((x) => x.id === id)
      if (!o) return
      pushHistory()
      const copy: PlannerObject = { ...o, id: uid(), x: o.x + 20, y: o.y + 20 }
      applyDoc({ ...docRef.current, objects: [...docRef.current.objects, copy] })
      selectedIdRef.current = copy.id
      setSelectedId(copy.id)
    },
    [applyDoc, pushHistory],
  )

  const updateObject = useCallback(
    (id: string, patch: Partial<PlannerObject>) => {
      applyDoc({ ...docRef.current, objects: docRef.current.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
    },
    [applyDoc],
  )

  const clearRoom = useCallback(() => {
    if (!docRef.current.room) return
    pushHistory()
    applyDoc({ ...docRef.current, room: null })
    toast('Стены удалены — нарисуйте новый контур')
  }, [applyDoc, pushHistory])

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
        applyDoc({
          ...docRef.current,
          underlay: { src, imgW, imgH, x: place.x, y: place.y, w: place.w, h: place.h, angle: 0, opacity: 0.55, visible: true },
        })
        selectedIdRef.current = null
        setSelectedId(null)
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
    [applyDoc, pushHistory],
  )

  const updateUnderlay = useCallback(
    (patch: Partial<Underlay>) => {
      const u = docRef.current.underlay
      if (!u) return
      applyDoc({ ...docRef.current, underlay: { ...u, ...patch } })
    },
    [applyDoc],
  )

  const removeUnderlay = useCallback(() => {
    if (!docRef.current.underlay) return
    pushHistory()
    applyDoc({ ...docRef.current, underlay: null })
    underlaySelectedRef.current = false
    setUnderlaySelected(false)
    toast('Подложка удалена', { icon: '🗑️' })
  }, [applyDoc, pushHistory])

  const fitUnderlay = useCallback(() => {
    const u = docRef.current.underlay
    if (!u) return
    const place = computeUnderlayPlacement(u.imgW, u.imgH, docRef.current, sizeRef.current, viewRef.current)
    pushHistory()
    applyDoc({ ...docRef.current, underlay: { ...u, ...place } })
  }, [applyDoc, pushHistory])

  const selectUnderlay = useCallback(() => {
    selectedIdRef.current = null
    setSelectedId(null)
    underlaySelectedRef.current = true
    setUnderlaySelected(true)
    draw()
  }, [draw])

  const handleNew = useCallback(() => {
    pushHistory()
    applyDoc({ ...DEFAULT_DOC, gridStep: docRef.current.gridStep })
    selectedIdRef.current = null
    setSelectedId(null)
    selectedPartitionIdRef.current = null
    setSelectedPartitionId(null)
    underlaySelectedRef.current = false
    setUnderlaySelected(false)
    drawingPtsRef.current = null
    ghostRef.current = null
    userViewRef.current = false
    fitView()
    draw()
    toast('Создан новый проект')
  }, [applyDoc, pushHistory, fitView, draw])

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
        selectedIdRef.current = null
        setSelectedId(null)
        selectedPartitionIdRef.current = null
        setSelectedPartitionId(null)
        underlaySelectedRef.current = false
        setUnderlaySelected(false)
        userViewRef.current = false
        fitView()
        draw()
        toast.success('Проект загружен из файла')
      } catch {
        toast.error('Не удалось прочитать файл проекта')
      }
    },
    [applyDoc, pushHistory, fitView, draw],
  )

  const handlePickPreset = useCallback(
    (p: Preset) => {
      placePresetRef.current = p
      setPlacePreset(p)
      drawingPtsRef.current = null
      selectedPartitionIdRef.current = null
      setSelectedPartitionId(null)
      toolRef.current = 'select'
      setTool('select')
      draw()
    },
    [draw],
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

    /** Прилипание точки перегородки: вершины → проекция на линии стен → сетка */
    const snapPartitionPoint = (plan: Pt): Pt => {
      const s = viewRef.current.scale
      const radV = 10 / s
      let bestVert: Pt | null = null
      let bestVertD = radV
      const verts = [...(docRef.current.room ?? []), ...docRef.current.partitions.flatMap((p) => p.pts)]
      for (const v of verts) {
        const d = Math.hypot(v.x - plan.x, v.y - plan.y)
        if (d < bestVertD) {
          bestVertD = d
          bestVert = v
        }
      }
      if (bestVert) return bestVert
      const radS = 12 / s
      const segs: [Pt, Pt][] = []
      const room = docRef.current.room
      if (room && room.length >= 3) {
        for (let i = 0; i < room.length; i++) segs.push([room[i], room[(i + 1) % room.length]])
      }
      for (const part of docRef.current.partitions) {
        for (let i = 0; i < part.pts.length - 1; i++) segs.push([part.pts[i], part.pts[i + 1]])
      }
      let bestSeg: Pt | null = null
      let bestSegD = radS
      for (const [a, b] of segs) {
        const c = closestOnSegment(plan, a, b)
        const d = Math.hypot(c.x - plan.x, c.y - plan.y)
        if (d < bestSegD) {
          bestSegD = d
          bestSeg = c
        }
      }
      if (bestSeg) return bestSeg
      const step = docRef.current.gridStep
      return { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
    }

    const updateCursorStyle = (plan: Pt | null) => {
      if (spaceRef.current || toolRef.current === 'pan' || interRef.current.type === 'pan') {
        canvas.style.cursor = interRef.current.type === 'pan' ? 'grabbing' : 'grab'
        return
      }
      if (toolRef.current === 'wall' || toolRef.current === 'partition' || placePresetRef.current) {
        canvas.style.cursor = 'crosshair'
        return
      }
      if (plan) {
        const sel = docRef.current.objects.find((o) => o.id === selectedIdRef.current)
        if (sel) {
          const hp = rotateHandlePos(sel, 26 / viewRef.current.scale)
          if (Math.hypot((hp.x - plan.x) * viewRef.current.scale, (hp.y - plan.y) * viewRef.current.scale) < 10) {
            canvas.style.cursor = 'pointer'
            return
          }
        }
        if (docRef.current.room) {
          for (const p of docRef.current.room) {
            if (Math.hypot((p.x - plan.x) * viewRef.current.scale, (p.y - plan.y) * viewRef.current.scale) < 9) {
              canvas.style.cursor = 'pointer'
              return
            }
          }
        }
        const selPart = docRef.current.partitions.find((p) => p.id === selectedPartitionIdRef.current)
        if (selPart) {
          for (const p of selPart.pts) {
            if (Math.hypot((p.x - plan.x) * viewRef.current.scale, (p.y - plan.y) * viewRef.current.scale) < 9) {
              canvas.style.cursor = 'pointer'
              return
            }
          }
        }
        for (let i = docRef.current.objects.length - 1; i >= 0; i--) {
          if (pointInObject(docRef.current.objects[i], plan)) {
            canvas.style.cursor = 'move'
            return
          }
        }
        for (const part of docRef.current.partitions) {
          for (let j = 0; j < part.pts.length - 1; j++) {
            if (distToSegment(plan, part.pts[j], part.pts[j + 1]) * viewRef.current.scale < 8) {
              canvas.style.cursor = 'pointer'
              return
            }
          }
        }
        const u = docRef.current.underlay
        if (u && u.visible && pointInRect(u, plan)) {
          canvas.style.cursor = 'move'
          return
        }
      }
      canvas.style.cursor = 'default'
    }

    const zoomAt = (px: number, py: number, factor: number) => {
      const v = viewRef.current
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const plan = screenToPlan(px, py, v)
      viewRef.current = { scale: ns, ox: px - plan.x * ns, oy: py - plan.y * ns }
      userViewRef.current = true
      draw()
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
        canvas.style.cursor = 'grabbing'
        return
      }

      if (e.button === 2) {
        // ПКМ в режимах стен/перегородок — убрать последнюю точку
        if (
          (toolRef.current === 'wall' || toolRef.current === 'partition') &&
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
        drawingPtsRef.current = [...pts, snapPartitionPoint(plan)]
        draw()
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
      const sel = docRef.current.objects.find((o) => o.id === selectedIdRef.current)
      if (sel) {
        const hp = rotateHandlePos(sel, 26 / viewRef.current.scale)
        if (Math.hypot((hp.x - plan.x) * viewRef.current.scale, (hp.y - plan.y) * viewRef.current.scale) < 10) {
          pushHistory()
          interRef.current = { type: 'rotate' }
          canvas.style.cursor = 'grabbing'
          return
        }
      }
      if (docRef.current.room) {
        const room = docRef.current.room
        for (let i = 0; i < room.length; i++) {
          if (Math.hypot((room[i].x - plan.x) * viewRef.current.scale, (room[i].y - plan.y) * viewRef.current.scale) < 9) {
            pushHistory()
            selectedPartitionIdRef.current = null
            setSelectedPartitionId(null)
            interRef.current = { type: 'vertex', vertexIdx: i }
            dragVertexRef.current = i
            return
          }
        }
      }
      // узлы выбранной перегородки — перетаскивание
      const selPart = docRef.current.partitions.find((p) => p.id === selectedPartitionIdRef.current)
      if (selPart) {
        for (let i = 0; i < selPart.pts.length; i++) {
          if (Math.hypot((selPart.pts[i].x - plan.x) * viewRef.current.scale, (selPart.pts[i].y - plan.y) * viewRef.current.scale) < 9) {
            pushHistory()
            selectedIdRef.current = null
            setSelectedId(null)
            interRef.current = { type: 'partitionVertex', partitionId: selPart.id, vertexIdx: i }
            partitionVertexRef.current = i
            return
          }
        }
      }
      for (let i = docRef.current.objects.length - 1; i >= 0; i--) {
        const o = docRef.current.objects[i]
        if (pointInObject(o, plan)) {
          selectedIdRef.current = o.id
          setSelectedId(o.id)
          selectedPartitionIdRef.current = null
          setSelectedPartitionId(null)
          pushHistory()
          interRef.current = { type: 'drag', grabDX: plan.x - o.x, grabDY: plan.y - o.y, moved: false }
          canvas.style.cursor = 'grabbing'
          return
        }
      }
      // перегородки — выбор кликом по сегменту
      for (let i = docRef.current.partitions.length - 1; i >= 0; i--) {
        const part = docRef.current.partitions[i]
        let hit = false
        for (let j = 0; j < part.pts.length - 1; j++) {
          if (distToSegment(plan, part.pts[j], part.pts[j + 1]) * viewRef.current.scale < 8) {
            hit = true
            break
          }
        }
        if (hit) {
          selectedIdRef.current = null
          setSelectedId(null)
          selectedPartitionIdRef.current = part.id
          setSelectedPartitionId(part.id)
          draw()
          return
        }
      }
      // подложка — выделение и перетаскивание
      const u = docRef.current.underlay
      if (u && u.visible && pointInRect(u, plan)) {
        selectedIdRef.current = null
        setSelectedId(null)
        underlaySelectedRef.current = true
        setUnderlaySelected(true)
        pushHistory()
        interRef.current = { type: 'underlayDrag', grabDX: plan.x - u.x, grabDY: plan.y - u.y, moved: false }
        canvas.style.cursor = 'grabbing'
        return
      }
      // пустое место — снять выделение
      selectedIdRef.current = null
      setSelectedId(null)
      selectedPartitionIdRef.current = null
      setSelectedPartitionId(null)
    }

    const onPointerMove = (e: PointerEvent) => {
      const pos = getPos(e)
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

      if (it.type === 'drag') {
        const o = docRef.current.objects.find((x) => x.id === selectedIdRef.current)
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
        it.moved = true
        applyDoc({ ...docRef.current, objects: docRef.current.objects.map((x) => (x.id === o.id ? { ...x, x: nx, y: ny } : x)) })
        return
      }

      if (it.type === 'underlayDrag') {
        const u = docRef.current.underlay
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
        applyDoc({ ...docRef.current, underlay: { ...u, x: nx, y: ny } })
        return
      }

      if (it.type === 'rotate') {
        const o = docRef.current.objects.find((x) => x.id === selectedIdRef.current)
        if (!o) return
        let angle = (Math.atan2(plan.y - o.y, plan.x - o.x) * 180) / Math.PI + 90
        if (!e.altKey) angle = Math.round(angle / 15) * 15
        angle = ((((angle + 180) % 360) + 360) % 360) - 180
        applyDoc({ ...docRef.current, objects: docRef.current.objects.map((x) => (x.id === o.id ? { ...x, angle } : x)) })
        return
      }

      if (it.type === 'vertex' && it.vertexIdx !== undefined && docRef.current.room) {
        const idx = it.vertexIdx
        const step = docRef.current.gridStep
        const np = e.altKey ? { x: plan.x, y: plan.y } : { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
        const room = docRef.current.room.map((p, i) => (i === idx ? np : p))
        applyDoc({ ...docRef.current, room })
        return
      }

      if (it.type === 'partitionVertex' && it.partitionId && it.vertexIdx !== undefined) {
        const idx = it.vertexIdx
        const pid = it.partitionId
        const step = docRef.current.gridStep
        const np = e.altKey ? { x: plan.x, y: plan.y } : { x: snapValue(plan.x, step), y: snapValue(plan.y, step) }
        applyDoc({
          ...docRef.current,
          partitions: docRef.current.partitions.map((p) => (p.id === pid ? { ...p, pts: p.pts.map((q, i) => (i === idx ? np : q)) } : p)),
        })
        return
      }

      // без зажатой кнопки: призрак и курсор
      if (placePresetRef.current) {
        const p = placePresetRef.current
        let gx = plan.x
        let gy = plan.y
        if (showGridRef.current) {
          const s = snapObjectPos({ x: gx, y: gy, w: p.w, h: p.h }, docRef.current.gridStep)
          gx = s.x
          gy = s.y
        }
        ghostRef.current = { id: 'ghost', presetId: p.id, name: p.name, x: gx, y: gy, w: p.w, h: p.h, angle: 0, color: p.color }
        draw()
      } else if ((toolRef.current === 'wall' || toolRef.current === 'partition') && drawingPtsRef.current) {
        if (toolRef.current === 'partition') {
          // резиновая нить показывает точку с прилипанием
          const snapped = snapPartitionPoint(plan)
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
      }

      if (e.code === 'KeyR' && selectedIdRef.current) {
        const o = docRef.current.objects.find((x) => x.id === selectedIdRef.current)
        if (o) {
          pushHistory()
          const d = e.shiftKey ? -90 : 90
          updateObject(o.id, { angle: ((((o.angle + d + 180) % 360) + 360) % 360) - 180 })
        }
        return
      }

      if (e.code === 'KeyV' || e.code === 'Digit1') handleToolChange('select')
      if (e.code === 'KeyW' || e.code === 'Digit2') handleToolChange('wall')
      if (e.code === 'KeyP' || e.code === 'Digit3') handleToolChange('partition')
      if (e.code === 'KeyH' || e.code === 'Digit4') handleToolChange('pan')

      // стрелки — точное перемещение
      if (selectedIdRef.current && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const o = docRef.current.objects.find((x) => x.id === selectedIdRef.current)
        if (!o) return
        const base = showGridRef.current ? docRef.current.gridStep : 10
        const step = e.shiftKey ? 1 : base
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowLeft') dx = -step
        if (e.key === 'ArrowRight') dx = step
        if (e.key === 'ArrowUp') dy = -step
        if (e.key === 'ArrowDown') dy = step
        const now = Date.now()
        if (now - lastNudgeRef.current > 600) pushHistory()
        lastNudgeRef.current = now
        applyDoc({ ...docRef.current, objects: docRef.current.objects.map((x) => (x.id === o.id ? { ...x, x: o.x + dx, y: o.y + dy } : x)) })
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
    applyDoc,
    closeRoom,
    deleteObject,
    deletePartition,
    duplicateObject,
    draw,
    finishPartition,
    fitView,
    handleToolChange,
    placeObject,
    pushHistory,
    redo,
    undo,
    updateObject,
  ])

  const selected = doc.objects.find((o) => o.id === selectedId) ?? null
  const selectedPartition = doc.partitions.find((p) => p.id === selectedPartitionId) ?? null
  const empty = !doc.room && doc.partitions.length === 0 && doc.objects.length === 0 && !doc.underlay

  const hint = tool === 'wall'
    ? 'Кликайте по углам комнаты · Enter или клик по первой точке — замкнуть · ПКМ — убрать точку · Esc — отмена'
    : tool === 'partition'
      ? 'Перегородки: кликайте точки — линия прилипает к стенам · Enter или клик по последней точке — закончить · ПКМ — убрать точку · Esc — выход'
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
        hasUnderlay={!!doc.underlay}
        onExportPNG={() => {
          exportPNG(docRef.current)
          toast.success('PNG-файл скачивается…')
        }}
        onExportJSON={() => {
          exportJSON(docRef.current, showGridRef.current)
          toast.success('JSON-файл скачивается…')
        }}
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
                    <b>1.</b> Инструментом «Стены» кликните углы комнаты в метрах от угла — контур замкнётся автоматически.
                  </li>
                  <li>
                    <b>2.</b> Выберите мебель в каталоге и кликните на плане, чтобы поставить.
                  </li>
                  <li>
                    <b>3.</b> Перетаскивайте объекты мышью, вращайте за оранжевую ручку, задавайте точные размеры справа.
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
            showGrid={showGrid}
            selected={selected}
            selectedPartition={selectedPartition}
            underlay={doc.underlay}
            underlaySelected={underlaySelected}
            onUpdateObject={updateObject}
            onCommit={() => pushHistory()}
            onDeleteObject={deleteObject}
            onDuplicateObject={duplicateObject}
            onDeletePartition={deletePartition}
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
              : tool === 'pan'
                ? 'Режим: перетаскивание холста'
                : 'Режим: выбор и редактирование'} · колесо — масштаб, пробел — панорама
        </span>
        <div className="flex shrink-0 items-center gap-3 tabular-nums sm:gap-4">
          <span ref={coordsRef} className="hidden sm:inline">
            —
          </span>
          <span>
            Масштаб: <span ref={zoomRef}>—</span>
          </span>
          <span className="hidden md:inline">
            Объектов: {doc.objects.length}
            {doc.partitions.length > 0 ? ` · перегородок: ${doc.partitions.length}` : ''}
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
    </div>
  )
}
