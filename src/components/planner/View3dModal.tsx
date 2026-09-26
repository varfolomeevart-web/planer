'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlannerDoc } from '@/lib/planner/types'
import { currentFloor } from '@/lib/planner/types'
import { polygonArea } from '@/lib/planner/geometry'
import { download } from '@/lib/planner/export'
import { preload3dImages, render3d, VIEW3D_DEFAULT, type View3dState } from '@/lib/planner/view3d'
import { exportGltfModel } from '@/lib/planner/gltf'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Box, Download, ImageDown, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'

interface Props {
  doc: PlannerDoc
  onClose: () => void
}

const WALL_MODES: { id: View3dState['walls']; label: string }[] = [
  { id: 'hide', label: 'Стены: скрыть передние' },
  { id: 'ghost', label: 'Стены: полупрозрачные' },
  { id: 'all', label: 'Стены: все' },
]

/**
 * Модальное окно 3D-визуализации: аксонометрический рендер этажа,
 * вращение перетаскиванием, зум колесом, экспорт PNG.
 * Монтируется только на время показа — состояние камеры всегда стартовое.
 */
export function View3dModal({ doc, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stRef = useRef<View3dState>({ ...VIEW3D_DEFAULT })
  const [walls, setWalls] = useState<View3dState['walls']>(VIEW3D_DEFAULT.walls)
  const docRef = useRef(doc)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  useEffect(() => void (docRef.current = doc), [doc])

  const render = useCallback(() => {
    const c = canvasRef.current
    const wrap = wrapRef.current
    if (!c || !wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (w < 10 || h < 10) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (c.width !== pw || c.height !== ph) {
      c.width = pw
      c.height = ph
    }
    render3d(c, currentFloor(docRef.current), stRef.current, dpr)
  }, [])

  // при монтировании: предзагрузка схем, блокировка прокрутки страницы
  useEffect(() => {
    render()
    const floor = currentFloor(docRef.current)
    preload3dImages(floor).then(render)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [render])

  // перерисовка при смене документа (этаж/объекты изменились без закрытия)
  useEffect(() => {
    render()
  }, [doc, render])

  // ресайз контейнера
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => render())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [render])

  // Esc — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // колесо — зум (native listener, чтобы отменить прокрутку страницы)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = stRef.current
      const f = e.deltaY < 0 ? 1.12 : 0.89
      st.zoom = Math.min(5, Math.max(0.4, st.zoom * f))
      render()
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [render])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    const st = stRef.current
    st.azimuth += (e.clientX - drag.x) * 0.4
    st.elevation = Math.min(80, Math.max(12, st.elevation - (e.clientY - drag.y) * 0.3))
    drag.x = e.clientX
    drag.y = e.clientY
    render()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    e.currentTarget.style.cursor = 'grab'
  }

  const exportPng = () => {
    const c = canvasRef.current
    if (!c) return
    // рендер из координатной модели в повышенном разрешении: ×2 к текущему кадру
    const k = 2
    const off = document.createElement('canvas')
    off.width = c.width * k
    off.height = c.height * k
    render3d(off, currentFloor(docRef.current), stRef.current, Math.min(2, window.devicePixelRatio || 1) * k)
    off.toBlob((blob) => {
      if (blob) {
        download(blob, 'plan-3d-render.png')
        toast.success(`Рендер ${off.width}×${off.height} px скачивается…`)
      }
    }, 'image/png')
  }

  const exportGlb = () => {
    try {
      exportGltfModel(docRef.current)
      toast.success('Координатная 3D-модель (GLB) скачивается…')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось построить 3D-модель')
    }
  }

  const floor = currentFloor(doc)
  const area = floor.room && floor.room.length >= 3 ? Math.abs(polygonArea(floor.room)) / 10000 : 0
  const info = area > 0 ? `${area.toFixed(1).replace('.', ',')} м² · объектов: ${floor.objects.length}` : `Объектов: ${floor.objects.length}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#2E2924]">
      {/* Шапка */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#4A4136] px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8730C] shadow-sm">
            <Box className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-[#F3EDE2]">3D-визуализация</div>
            <div className="text-[11px] text-[#A99A82]">
              {floor.name} · {info}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={walls}
            onChange={(e) => {
              const v = e.target.value as View3dState['walls']
              setWalls(v)
              stRef.current.walls = v
              render()
            }}
            className="h-8 rounded-lg border border-[#57493A] bg-[#3A342C] px-2 text-xs font-medium text-[#F3EDE2] outline-none"
          >
            {WALL_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#3A342C] hover:text-[#F3EDE2]"
            onClick={() => {
              stRef.current.zoom = Math.min(5, stRef.current.zoom * 1.2)
              render()
            }}
            title="Крупнее"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#3A342C] hover:text-[#F3EDE2]"
            onClick={() => {
              stRef.current.zoom = Math.max(0.4, stRef.current.zoom / 1.2)
              render()
            }}
            title="Мельче"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#3A342C] hover:text-[#F3EDE2]"
            onClick={() => {
              stRef.current = { ...VIEW3D_DEFAULT }
              setWalls(VIEW3D_DEFAULT.walls)
              render()
            }}
            title="Сбросить камеру"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#57493A] bg-[#3A342C] text-xs text-[#F3EDE2] hover:bg-[#463E33]"
            onClick={exportGlb}
            title="Координатная 3D-модель этажа (glTF, метры) — для Blender и 3D-редакторов"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">GLB</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#57493A] bg-[#3A342C] text-xs text-[#F3EDE2] hover:bg-[#463E33]"
            onClick={exportPng}
          >
            <ImageDown className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">PNG</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#3A342C] hover:text-[#F3EDE2]"
            onClick={onClose}
            title="Закрыть (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Сцена */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          style={{ cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#211D19]/85 px-4 py-1.5 text-center text-[11px] font-medium text-[#D8CBB6] shadow-lg">
          Тяните мышью — поворот · колесо — масштаб · GLB — координатная модель для 3D-редакторов · PNG — рендер из неё
        </div>
      </div>
    </div>
  )
}
