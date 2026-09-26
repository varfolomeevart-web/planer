#!/usr/bin/env python3
"""Центроид пикселей оранжевой стрелки лестницы (#C55F05) на скриншоте (только зона канваса)."""
import sys
from PIL import Image

path = sys.argv[1]
x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6]) if len(sys.argv) >= 6 else (0, 0, 10**9, 10**9)
img = Image.open(path).convert('RGB')
w, h = img.size
px = img.load()

target = (0xC5, 0x5F, 0x05)
tol = 25
sx = sy = n = 0
minx, miny, maxx, maxy = w, h, -1, -1
for y in range(max(0, y0), min(h, y1), 1):
    for x in range(max(0, x0), min(w, x1), 1):
        r, g, b = px[x, y]
        if abs(r - target[0]) <= tol and abs(g - target[1]) <= tol and abs(b - target[2]) <= tol:
            sx += x
            sy += y
            n += 1
            minx, miny = min(minx, x), min(miny, y)
            maxx, maxy = max(maxx, x), max(maxy, y)

if n == 0:
    print(f"{path}: NO MATCH")
else:
    print(f"{path}: centroid=({sx / n:.0f},{sy / n:.0f}) bbox=({minx},{miny})-({maxx},{maxy}) px={n}")
