'use client'

import { useEffect, useRef, useState } from 'react'
import type { PlannerDoc } from '@/lib/planner/types'
import { currentFloor } from '@/lib/planner/types'
import { polygonArea } from '@/lib/planner/geometry'
import { download } from '@/lib/planner/export'
import { preload3dImages } from '@/lib/planner/view3d'
import { CAMSHOT_DEFAULT, renderCamShot, type CamShotState } from '@/lib/planner/camshot'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Camera, ImageDown, RefreshCcw, RotateCcw, RotateCw, X } from 'lucide-react'

interface Props {
  doc: PlannerDoc
  onClose: () => void
}

const HEIGHT_MIN = 100
const HEIGHT_MAX = 230
const PITCH_MIN = -35
const PITCH_MAX = 35
const FOV_MIN = 45
const FOV_MAX = 100

/**
 * Модальное окно 3D-снимка: перспективный вид из точки камеры, отмеченной
 * на плане инструментом «Камера». Перетаскивание — осмотр, слайдеры — кадр,
 * экспорт PNG в высоком разрешении (3200×2000) с подписью.
 */
export function SnapshotModal({ doc, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const docRef = useRef(doc)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  useEffect(() => void (docRef.current = doc), [doc])

  const floor = currentFloor(doc)
  const cam = floor.camera ?? { x: 0, y: 0, angle: 0 }

  const stRef = useRef<CamShotState>({ yaw: cam.angle, ...CAMSHOT_DEFAULT })
  const [height, setHeight] = useState(CAMSHOT_DEFAULT.height)
  const [pitch, setPitch] = useState(CAMSHOT_DEFAULT.pitch)
  const [fov, setFov] = useState(CAMSHOT_DEFAULT.fov)

  const renderFn = () => {
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
    const fl = currentFloor(docRef.current)
    const camPos = fl.camera ?? { x: 0, y: 0, angle: 0 }
    renderCamShot(c, fl, camPos, stRef.current, dpr, docRef.current.layers)
  }
  const renderRef = useRef<() => void>(() => {})
  useEffect(() => void (renderRef.current = renderFn), [renderFn])

  // при монтировании: предзагрузка схем «Клён», блокировка прокрутки
  useEffect(() => {
    renderFn()
    preload3dImages(currentFloor(docRef.current)).then(() => renderRef.current())
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // ресайз контейнера
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => renderRef.current())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Esc — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // колесо — обзор (шире/уже)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = stRef.current
      const f = e.deltaY < 0 ? 0.94 : 1.06
      st.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, st.fov * f))
      setFov(st.fov)
      renderRef.current()
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    const st = stRef.current
    st.yaw += (e.clientX - drag.x) * 0.28
    st.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, st.pitch - (e.clientY - drag.y) * 0.18))
    setPitch(st.pitch)
    drag.x = e.clientX
    drag.y = e.clientY
    renderRef.current()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    e.currentTarget.style.cursor = 'grab'
  }

  const exportPng = () => {
    const w = 1600
    const h = 1000
    const d = 2
    const c = document.createElement('canvas')
    c.width = w * d
    c.height = h * d
    renderCamShot(c, currentFloor(docRef.current), cam, stRef.current, d, docRef.current.layers)
    // подпись снимка
    const ctx = c.getContext('2d')
    if (ctx) {
      const strip = 60 * d
      const fl = currentFloor(docRef.current)
      const area = fl.room && fl.room.length >= 3 ? Math.abs(polygonArea(fl.room)) / 10000 : 0
      ctx.fillStyle = 'rgba(24,20,16,0.92)'
      ctx.fillRect(0, h * d - strip, w * d, strip)
      ctx.strokeStyle = 'rgba(232,115,12,0.9)'
      ctx.lineWidth = 2 * d
      ctx.beginPath()
      ctx.moveTo(0, h * d - strip)
      ctx.lineTo(w * d, h * d - strip)
      ctx.stroke()
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = `600 ${20 * d}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = '#F3EDE2'
      ctx.fillText(`3D-снимок с камеры · ${fl.name}`, 28 * d, h * d - strip / 2 - 11 * d)
      ctx.font = `500 ${14 * d}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = '#A99A82'
      ctx.fillText(
        `${area > 0 ? `${area.toFixed(1).replace('.', ',')} м² · ` : ''}высота ${Math.round(stRef.current.height)} см · обзор ${Math.round(stRef.current.fov)}°`,
        28 * d,
        h * d - strip / 2 + 12 * d,
      )
      ctx.textAlign = 'right'
      ctx.font = `500 ${14 * d}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = '#A99A82'
      ctx.fillText(
        new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }),
        w * d - 28 * d,
        h * d - strip / 2,
      )
    }
    c.toBlob((blob) => {
      if (blob) {
        download(blob, '3d-snimok-kamery.png')
        toast.success('PNG-снимок скачивается…')
      }
    }, 'image/png')
  }

  const upd = (patch: Partial<CamShotState>) => {
    Object.assign(stRef.current, patch)
    renderRef.current()
  }

  const sliderCls =
    'h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-[#57493A] accent-[#E8730C] sm:w-28 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#E8730C] [&::-webkit-slider-thumb]:shadow'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#14110D]">
      {/* Шапка */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#3A332A] px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8730C] shadow-sm">
            <Camera className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-[#F3EDE2]">Снимок с камеры</div>
            <div className="text-[11px] text-[#A99A82]">
              {floor.name} · точка {Math.round(cam.x)}×{Math.round(cam.y)} см
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#D8CBB6] hover:bg-[#2A251E] hover:text-[#F3EDE2]"
              onClick={() => {
                stRef.current.yaw -= 15
                renderRef.current()
              }}
              title="Повернуть камеру влево на 15°"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#D8CBB6] hover:bg-[#2A251E] hover:text-[#F3EDE2]"
              onClick={() => {
                stRef.current.yaw += 15
                renderRef.current()
              }}
              title="Повернуть камеру вправо на 15°"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="hidden items-center gap-2 rounded-lg bg-[#221D17] px-2.5 py-1 md:flex">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8B7D6B]">Высота</span>
            <input
              type="range"
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              step={5}
              value={height}
              onChange={(e) => {
                const v = Number(e.target.value)
                setHeight(v)
                upd({ height: v })
              }}
              className={sliderCls}
            />
            <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-[#D8CBB6]">{height}</span>
          </div>

          <div className="hidden items-center gap-2 rounded-lg bg-[#221D17] px-2.5 py-1 md:flex">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8B7D6B]">Наклон</span>
            <input
              type="range"
              min={PITCH_MIN}
              max={PITCH_MAX}
              step={1}
              value={pitch}
              onChange={(e) => {
                const v = Number(e.target.value)
                setPitch(v)
                upd({ pitch: v })
              }}
              className={sliderCls}
            />
            <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-[#D8CBB6]">{pitch}°</span>
          </div>

          <div className="hidden items-center gap-2 rounded-lg bg-[#221D17] px-2.5 py-1 md:flex">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8B7D6B]">Обзор</span>
            <input
              type="range"
              min={FOV_MIN}
              max={FOV_MAX}
              step={1}
              value={fov}
              onChange={(e) => {
                const v = Number(e.target.value)
                setFov(v)
                upd({ fov: v })
              }}
              className={sliderCls}
            />
            <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-[#D8CBB6]">{fov}°</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#2A251E] hover:text-[#F3EDE2]"
            onClick={() => {
              stRef.current = { yaw: cam.angle, ...CAMSHOT_DEFAULT }
              setHeight(CAMSHOT_DEFAULT.height)
              setPitch(CAMSHOT_DEFAULT.pitch)
              setFov(CAMSHOT_DEFAULT.fov)
              renderRef.current()
            }}
            title="Вернуть кадр к камере на плане"
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#57493A] bg-[#2A251E] text-xs text-[#F3EDE2] hover:bg-[#3A332A]"
            onClick={exportPng}
          >
            <ImageDown className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">PNG</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#2A251E] hover:text-[#F3EDE2]"
            onClick={onClose}
            title="Закрыть (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Кадр */}
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
          Тяните мышью — осмотр · колесо — обзор · слайдеры — высота, наклон и угол кадра
        </div>
      </div>
    </div>
  )
}
