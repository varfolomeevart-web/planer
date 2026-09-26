#!/usr/bin/env python3
"""Помощник для тестов канвы планировщика: снимает dataURL ГЛАВНОГО канваса (самый большой)."""
import base64
import json
import re
import subprocess
import sys

EXPR = """
(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const big = cs.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
  return big.toDataURL().split(',')[1];
})()
"""


def main() -> None:
    out = subprocess.run(
        ['agent-browser', 'eval', EXPR], capture_output=True, text=True, timeout=60
    )
    m = re.search(r'"([A-Za-z0-9+/=]{100,})"', out.stdout)
    if not m:
        print(json.dumps({'error': out.stdout[:200]}))
        sys.exit(1)
    raw = base64.b64decode(m.group(1))
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'wb') as f:
            f.write(raw)
        print(json.dumps({'saved': sys.argv[1], 'bytes': len(raw)}))
    else:
        import hashlib
        print(json.dumps({'sha1': hashlib.sha1(raw).hexdigest(), 'bytes': len(raw)}))


if __name__ == '__main__':
    main()
