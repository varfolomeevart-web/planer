#!/usr/bin/env python3
"""Извлечение перехваченных blob (window.__cap) из agent-browser в файлы.
Использование: python3 extract-pdf.py            # все blob из window.__cap
"""
import subprocess, re, json, base64, sys

JS = (
    "(async () => { const fr = new FileReader();"
    " const load = (b) => new Promise((res) => { fr.onload = () => res(fr.result); fr.readAsDataURL(b); });"
    " const out = []; for (const x of window.__cap) out.push({t: x.t, d: await load(x.b)});"
    " return JSON.stringify(out); })()"
)

def main():
    r = subprocess.run(["agent-browser", "eval", JS], capture_output=True, text=True, timeout=180)
    # вывод — JSON-строка (кавыченный токен); декодируем её, затем парсим внутренний JSON
    m = re.search(r'"(?:[^"\\]|\\.)*"', r.stdout, re.S)
    if not m:
        print("FAIL: вывод не найден"); print(r.stdout[:400]); sys.exit(1)
    val = json.loads(m.group(0))
    if isinstance(val, str):
        val = json.loads(val)
    data = val
    n = {}
    for x in data:
        i = n.get(x["t"], 0)
        n[x["t"]] = i + 1
        ext = {"image/png": "png", "application/pdf": "pdf", "application/json": "json"}.get(x["t"], "bin")
        fn = f"/home/z/my-project/scripts/t15-export-{i}{('.' + ext) if ext != 'bin' else ''}"
        raw = base64.b64decode(x["d"].split(",", 1)[1])
        open(fn, "wb").write(raw)
        print(f"OK: {fn} — {len(raw)} байт")

if __name__ == "__main__":
    main()
