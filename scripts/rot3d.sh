#!/bin/bash
# Поворот 3D-вида перетаскиванием канваса: scripts/rot3d.sh <градусы>
DEG="$1"
PX=$(python3 -c "print($DEG/0.4)")
JS=$(cat <<EOF
(() => {
  const cs = [...document.querySelectorAll('canvas')]
  const c = cs.sort((a,b)=>b.width*b.height-a.width*a.height)[0]
  if (!c._patched) { c._patched = true; c.setPointerCapture = function(){}; c.releasePointerCapture = function(){} }
  const px = ${PX}, x0 = 400, y0 = 300
  const fire = (type, x) => c.dispatchEvent(new PointerEvent(type, {pointerId: 7, clientX: x, clientY: y0, bubbles: true, cancelable: true}))
  fire('pointerdown', x0)
  for (let i = 1; i <= 12; i++) fire('pointermove', x0 + (px * i) / 12)
  fire('pointerup', x0 + px)
  return 'rotated ' + px + 'px'
})()
EOF
)
agent-browser eval "$JS"
