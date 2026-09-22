#!/usr/bin/env python3
"""Извлечение карточек каталога «Клён» (klenmarket) через agent-browser.
Собирает: номер, название, модель, цену, мощность, Ш×Г×В, описание, SVG вида сверху.
Выход: scripts/klen-items.json
"""
import subprocess, json, re, sys, time

BASE_JS = """(() => {{
  const a = document.querySelectorAll('article')[{idx}];
  if (!a) return null;
  const svg = a.querySelector('svg');
  return JSON.stringify({{ t: a.innerText, svg: svg ? svg.outerHTML : null, label: svg ? svg.getAttribute('aria-label') : null }});
}})()"""


def eval_js(js: str, timeout: int = 60):
    r = subprocess.run(["agent-browser", "eval", js], capture_output=True, text=True, timeout=timeout)
    out = r.stdout.strip()
    # stdout — JSON-строка с результатом; берём от первой кавычки до последней
    m = re.search(r'^[\s\S]*?("(?:[^"\\]|\\.)*")[\s\S]*$', out)
    if not m:
        raise RuntimeError("no eval output: " + out[:200])
    val = json.loads(m.group(1))
    if val == "null" or val is None:
        return None
    return json.loads(val)


def collect(kit: str, count: int) -> list:
    items = []
    for idx in range(count):
        try:
            d = eval_js(BASE_JS.format(idx=idx))
        except RuntimeError as e:
            print(f"  [{idx}] RETRY: {e}")
            time.sleep(1)
            d = eval_js(BASE_JS.format(idx=idx))
        if d is None:
            print(f"  [{idx}] нет карточки, пропуск")
            continue
        d["kit"] = kit
        d["idx"] = idx
        items.append(d)
        name = d["t"].split("\n")[1].strip() if "\n" in d["t"] else "?"
        svg_kb = len(d["svg"]) / 1024
        print(f"  [{idx:2d}] {name[:44]:<44} svg {svg_kb:5.1f} КБ")
    return items


def main():
    all_items = []
    # браузер уже на комплекте «Про» (16 позиций)
    print("== Комплект «Про» ==")
    all_items += collect("pro", 16)
    # переключаемся на «Оптимум»
    subprocess.run(["agent-browser", "eval",
                    "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('«Оптимум»')); b.click(); return 'ok'; })()"],
                   capture_output=True, text=True, timeout=60)
    time.sleep(1.5)
    print("== Комплект «Оптимум» ==")
    all_items += collect("opt", 14)

    with open("/home/z/my-project/scripts/klen-items.json", "w", encoding="utf-8") as f:
        json.dump(all_items, f, ensure_ascii=False)
    print(f"\nИтого карточек: {len(all_items)} -> scripts/klen-items.json")


if __name__ == "__main__":
    main()
