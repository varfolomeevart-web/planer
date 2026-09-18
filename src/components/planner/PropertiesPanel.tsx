'use client'

import { useEffect, useState } from 'react'
import type { PlannerDoc, PlannerObject, Underlay } from '@/lib/planner/types'
import { GRID_STEPS, OBJECT_COLORS } from '@/lib/planner/types'
import { polygonArea, polygonPerimeter } from '@/lib/planner/geometry'
import { fmtLen } from '@/lib/planner/draw'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Copy, Trash2, RotateCcw, RotateCw, Eraser, ImagePlus, Maximize2, Replace } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  doc: PlannerDoc
  showGrid: boolean
  selected: PlannerObject | null
  underlay: Underlay | null
  underlaySelected: boolean
  onUpdateObject: (id: string, patch: Partial<PlannerObject>) => void
  onCommit: () => void
  onDeleteObject: (id: string) => void
  onDuplicateObject: (id: string) => void
  onClearRoom: () => void
  onSelectUnderlay: () => void
  onUpdateUnderlay: (patch: Partial<Underlay>) => void
  onRemoveUnderlay: () => void
  onFitUnderlay: () => void
  onReplaceUnderlay: () => void
  onGridStepChange: (step: number) => void
  onToggleGrid: (v: boolean) => void
}

function NumberField({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
  id,
}: {
  value: number
  onChange: (v: number) => void
  onCommit: () => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  id?: string
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const [syncedValue, setSyncedValue] = useState(value)

  // синхронизация с внешним значением только когда поле не в фокусе (паттерн React «adjusting state on prop change»)
  if (!focused && value !== syncedValue) {
    setSyncedValue(value)
    setText(String(Math.round(value * 10) / 10))
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onFocus={() => {
          setFocused(true)
          onCommit()
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) {
            let clamped = v
            if (min !== undefined) clamped = Math.max(min, clamped)
            if (max !== undefined) clamped = Math.min(max, clamped)
            onChange(clamped)
          }
        }}
        className="h-8 border-[#E4DAC8] bg-white pr-8 text-sm tabular-nums focus-visible:ring-[#E8730C]/40"
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-[#8B7D6B]">{suffix}</span>}
    </div>
  )
}

export function PropertiesPanel({
  doc,
  showGrid,
  selected,
  underlay,
  underlaySelected,
  onUpdateObject,
  onCommit,
  onDeleteObject,
  onDuplicateObject,
  onClearRoom,
  onSelectUnderlay,
  onUpdateUnderlay,
  onRemoveUnderlay,
  onFitUnderlay,
  onReplaceUnderlay,
  onGridStepChange,
  onToggleGrid,
}: Props) {
  const room = doc.room && doc.room.length >= 3 ? doc.room : null
  const area = room ? polygonArea(room) : 0
  const perim = room ? polygonPerimeter(room) : 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto planner-scroll">
      {/* Помещение */}
      <div className="border-b border-[#EAE2D5] p-4">
        <h3 className="mb-2.5 text-xs font-bold tracking-wider text-[#8B7D6B] uppercase">Помещение</h3>
        {room ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#F7F1E6] px-3 py-2">
                <div className="text-[10px] font-semibold tracking-wide text-[#8B7D6B] uppercase">Площадь</div>
                <div className="text-lg font-bold text-[#3D3428] tabular-nums">{(area / 10000).toFixed(1).replace('.', ',')} м²</div>
              </div>
              <div className="rounded-lg bg-[#F7F1E6] px-3 py-2">
                <div className="text-[10px] font-semibold tracking-wide text-[#8B7D6B] uppercase">Периметр</div>
                <div className="text-lg font-bold text-[#3D3428] tabular-nums">{fmtLen(perim)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-[#8B7D6B]">
              <span>
                Стен: {room.length} · объектов: {doc.objects.length}
              </span>
              <button onClick={onClearRoom} className="flex items-center gap-1 font-semibold text-[#B3401E] hover:underline">
                <Eraser className="h-3.5 w-3.5" /> Очистить
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-[#8B7D6B]">
            Стены не нарисованы. Выберите инструмент <span className="font-semibold text-[#3D3428]">«Стены»</span> и кликайте точки
            по углам комнаты. Enter или клик по первой точке — замкнуть контур.
          </p>
        )}
      </div>

      {/* Свойства объекта */}
      <div className="border-b border-[#EAE2D5] p-4">
        <h3 className="mb-2.5 text-xs font-bold tracking-wider text-[#8B7D6B] uppercase">Объект</h3>
        {selected ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="obj-name" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                Название
              </Label>
              <Input
                id="obj-name"
                value={selected.name}
                onFocus={onCommit}
                onChange={(e) => onUpdateObject(selected.id, { name: e.target.value })}
                className="h-8 border-[#E4DAC8] bg-white text-sm focus-visible:ring-[#E8730C]/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="obj-x" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                  X (центр)
                </Label>
                <NumberField id="obj-x" value={selected.x} onCommit={onCommit} onChange={(v) => onUpdateObject(selected.id, { x: v })} suffix="см" />
              </div>
              <div>
                <Label htmlFor="obj-y" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                  Y (центр)
                </Label>
                <NumberField id="obj-y" value={selected.y} onCommit={onCommit} onChange={(v) => onUpdateObject(selected.id, { y: v })} suffix="см" />
              </div>
              <div>
                <Label htmlFor="obj-w" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                  Ширина
                </Label>
                <NumberField id="obj-w" value={selected.w} min={5} max={2000} onCommit={onCommit} onChange={(v) => onUpdateObject(selected.id, { w: v })} suffix="см" />
              </div>
              <div>
                <Label htmlFor="obj-h" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                  Глубина
                </Label>
                <NumberField id="obj-h" value={selected.h} min={5} max={2000} onCommit={onCommit} onChange={(v) => onUpdateObject(selected.id, { h: v })} suffix="см" />
              </div>
            </div>

            <div>
              <Label htmlFor="obj-angle" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                Поворот
              </Label>
              <div className="flex items-center gap-1.5">
                <NumberField id="obj-angle" value={selected.angle} min={-180} max={180} step={5} onCommit={onCommit} onChange={(v) => onUpdateObject(selected.id, { angle: v })} suffix="°" />
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 border-[#E4DAC8]" title="Повернуть на -90°" onClick={() => { onCommit(); onUpdateObject(selected.id, { angle: selected.angle - 90 }) }}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 border-[#E4DAC8]" title="Повернуть на +90°" onClick={() => { onCommit(); onUpdateObject(selected.id, { angle: selected.angle + 90 }) }}>
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold text-[#6B5D4F]">Цвет</Label>
              <div className="flex flex-wrap gap-1.5">
                {OBJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => { onCommit(); onUpdateObject(selected.id, { color: c }) }}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                      selected.color === c ? 'border-[#E8730C] ring-2 ring-[#E8730C]/30' : 'border-[#D8CBB6]',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="h-8 flex-1 border-[#E4DAC8] text-xs" onClick={() => onDuplicateObject(selected.id)}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Дублировать
              </Button>
              <Button variant="destructive" className="h-8 flex-1 text-xs" onClick={() => onDeleteObject(selected.id)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Удалить
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-[#8B7D6B]">
            Кликните по объекту на плане, чтобы изменить его размеры, позицию, угол поворота и цвет. Клавиши: <b>R</b> — поворот,
            <b> Ctrl+D</b> — копия, <b>Del</b> — удалить.
          </p>
        )}
      </div>

      {/* Подложка */}
      <div className="border-b border-[#EAE2D5] p-4">
        <h3 className="mb-2.5 text-xs font-bold tracking-wider text-[#8B7D6B] uppercase">Подложка</h3>
        {!underlay ? (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-[#8B7D6B]">
              Загрузите скан или фото плана — поверх него можно обвести стены и расставить мебель по реальным размерам.
            </p>
            <Button variant="outline" className="h-8 w-full border-[#E4DAC8] bg-white text-xs hover:bg-[#F7F1E6]" onClick={onReplaceUnderlay}>
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Загрузить изображение
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="underlay-visible" className="text-sm text-[#3D3428]">
                Показывать
              </Label>
              <Switch
                id="underlay-visible"
                checked={underlay.visible}
                onCheckedChange={(v) => {
                  onCommit()
                  onUpdateUnderlay({ visible: v })
                }}
                className="data-[state=checked]:bg-[#E8730C]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-[#6B5D4F]">Прозрачность</Label>
                <span className="text-[10px] font-semibold text-[#8B7D6B] tabular-nums">{Math.round(underlay.opacity * 100)}%</span>
              </div>
              <div onPointerDownCapture={onCommit}>
                <Slider
                  value={[Math.round(underlay.opacity * 100)]}
                  min={5}
                  max={100}
                  step={5}
                  onValueChange={([v]) => onUpdateUnderlay({ opacity: v / 100 })}
                  className="cursor-pointer [&_[data-slot=slider-range]]:bg-[#E8730C] [&_[data-slot=slider-thumb]]:border-[#E8730C]"
                />
              </div>
            </div>

            {underlaySelected ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="un-x" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                      X (центр)
                    </Label>
                    <NumberField id="un-x" value={underlay.x} onCommit={onCommit} onChange={(v) => onUpdateUnderlay({ x: v })} suffix="см" />
                  </div>
                  <div>
                    <Label htmlFor="un-y" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                      Y (центр)
                    </Label>
                    <NumberField id="un-y" value={underlay.y} onCommit={onCommit} onChange={(v) => onUpdateUnderlay({ y: v })} suffix="см" />
                  </div>
                  <div>
                    <Label htmlFor="un-w" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                      Ширина
                    </Label>
                    <NumberField
                      id="un-w"
                      value={underlay.w}
                      min={20}
                      max={100000}
                      onCommit={onCommit}
                      onChange={(v) => onUpdateUnderlay({ w: v, h: Math.round((v * underlay.imgH) / Math.max(1, underlay.imgW)) })}
                      suffix="см"
                    />
                  </div>
                  <div>
                    <Label htmlFor="un-h" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                      Высота
                    </Label>
                    <NumberField
                      id="un-h"
                      value={underlay.h}
                      min={20}
                      max={100000}
                      onCommit={onCommit}
                      onChange={(v) => onUpdateUnderlay({ h: v, w: Math.round((v * underlay.imgW) / Math.max(1, underlay.imgH)) })}
                      suffix="см"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="un-angle" className="mb-1 block text-[11px] font-semibold text-[#6B5D4F]">
                    Поворот
                  </Label>
                  <NumberField id="un-angle" value={underlay.angle} min={-180} max={180} step={1} onCommit={onCommit} onChange={(v) => onUpdateUnderlay({ angle: v })} suffix="°" />
                </div>
                <Button variant="outline" className="h-8 w-full border-[#E4DAC8] text-xs" onClick={onFitUnderlay}>
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Вписать в комнату
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-[#8B7D6B]">
                  Кликните по подложке на плане, чтобы передвинуть её и задать точный масштаб, — или нажмите «Настроить».
                </p>
                <Button variant="outline" className="h-8 w-full border-[#E4DAC8] bg-white text-xs hover:bg-[#F7F1E6]" onClick={onSelectUnderlay}>
                  Настроить размер и позицию
                </Button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="h-8 flex-1 border-[#E4DAC8] text-xs" onClick={onReplaceUnderlay}>
                <Replace className="mr-1 h-3.5 w-3.5" /> Заменить
              </Button>
              <Button variant="destructive" className="h-8 flex-1 text-xs" onClick={onRemoveUnderlay}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Удалить
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Настройки сетки */}
      <div className="p-4">
        <h3 className="mb-2.5 text-xs font-bold tracking-wider text-[#8B7D6B] uppercase">Сетка и привязка</h3>
        <div className="flex items-center justify-between">
          <Label htmlFor="grid-switch" className="text-sm text-[#3D3428]">
            Показывать сетку
          </Label>
          <Switch id="grid-switch" checked={showGrid} onCheckedChange={onToggleGrid} className="data-[state=checked]:bg-[#E8730C]" />
        </div>
        <div className="mt-3">
          <Label className="mb-1.5 block text-[11px] font-semibold text-[#6B5D4F]">Шаг сетки</Label>
          <div className="flex gap-1.5">
            {GRID_STEPS.map((s) => (
              <button
                key={s}
                onClick={() => onGridStepChange(s)}
                className={cn(
                  'flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                  doc.gridStep === s ? 'border-[#E8730C] bg-[#FDF3E7] text-[#C55F05]' : 'border-[#E4DAC8] bg-white text-[#6B5D4F] hover:bg-[#F7F1E6]',
                )}
              >
                {s >= 100 ? `${s / 100} м` : `${s} см`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
