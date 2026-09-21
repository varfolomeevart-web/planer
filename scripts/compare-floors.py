#!/usr/bin/env python3
"""Сравнение канваса этажа 1 (A) и этажа 2 (B): сетка должна совпадать, различие — только лестница."""
import base64, re, subprocess
from PIL import Image
import numpy as np


def grab(var: str) -> bytes:
    r = subprocess.run(
        ['agent-browser', 'eval', f"{var}.split(',')[1]"],
        capture_output=True, text=True, timeout=60,
    )
    m = re.search(r'"([A-Za-z0-9+/=]{100,})"', r.stdout)
    if not m:
        raise RuntimeError(f'no base64 for {var}: {r.stdout[:120]!r}')
    return base64.b64decode(m.group(1))


for var, fn in [('__A', '/tmp/cmp/A_f1.png'), ('__B', '/tmp/cmp/B_f2.png')]:
    open(fn, 'wb').write(grab(var))

a = Image.open('/tmp/cmp/A_f1.png').convert('RGB')
b = Image.open('/tmp/cmp/B_f2.png').convert('RGB')
da, db = np.asarray(a, int), np.asarray(b, int)
diff = (da != db).any(axis=2)


def grid_cols(arr):
    dark = (arr.sum(axis=2) < 700).sum(axis=0)
    return set(np.nonzero(dark > 400)[0].tolist())


def grid_rows(arr):
    dark = (arr.sum(axis=2) < 700).sum(axis=1)
    return set(np.nonzero(dark > 400)[0].tolist())


ga, gb = grid_cols(da), grid_cols(db)
ra, rb = grid_rows(da), grid_rows(db)
print('grid COLUMNS identical f1 vs f2:', ga == gb, '| counts:', len(ga), len(gb))
print('grid ROWS identical f1 vs f2:', ra == rb, '| counts:', len(ra), len(rb))
ys, xs = np.nonzero(diff)
print('diff pixels total:', len(xs))
outside = ((xs < 260) | (xs > 500)).sum()
print('diff pixels OUTSIDE stairs zone:', int(outside))
