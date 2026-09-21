#!/usr/bin/env python3
"""Извлечение перехваченного PDF-blob из agent-browser и сохранение в файл."""
import subprocess, re, sys, base64

# читаем data URL из eval (длинный вывод обрезается в терминале, поэтому stdout -> файл)
r = subprocess.run(
    ["agent-browser", "eval",
     "(async () => { const b = window.__cap[window.__cap.length - 1]; "
     "const fr = new FileReader(); "
     "return await new Promise((res) => { fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); })()"],
    capture_output=True, text=True, timeout=120,
)
m = re.search(r'"data:application/pdf;base64,([A-Za-z0-9+/=]{1000,})"', r.stdout)
if not m:
    print("FAIL: base64 не найден"); print(r.stdout[:500]); sys.exit(1)
data = base64.b64decode(m.group(1))
out = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/scripts/t14-export.pdf"
with open(out, "wb") as f:
    f.write(data)
print(f"OK: {out} — {len(data)} байт")
