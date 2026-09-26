#!/usr/bin/env python3
"""Генерация src/lib/planner/klen-presets.ts из scripts/klen-items.json.

- дедупликация: сначала позиции «Оптимум», затем новые из «Про»
- SVG: кроп viewBox по габаритам предмета (удаляются белое поле и размерные линии),
  удаление фонового rect, перекраска в зелёную палитру, width/height
- имя пресета: «Название · Модель · Цена ₽» (полностью из каталога)
- размеры: Ш×Г из каталога, мм → см
"""
import json, re

ITEMS_PATH = "/home/z/my-project/scripts/klen-items.json"
OUT_PATH = "/home/z/my-project/src/lib/planner/klen-presets.ts"

# зелёная палитра: предметы раздела «Клён»
COLOR_MAP = {
    "#ffffff": "#F4FAEF",  # белые заливки → очень светлый зелёный
    "#f4f4f5": "#E6F1DC",  # светло-серые → светло-зелёный
    "#a1a1aa": "#8FB47E",  # серые средние → зелёный средний
    "#52525b": "#5D8A4E",  # тёмно-серые → зелёный
    "#3f3f46": "#3C6B35",  # тёмный контур → тёмно-зелёный
    "#d97706": "#55803F",  # янтарный акцент → зелёный акцент
}
FILL = "#DCEBD3"   # подложка пресета
STROKE = "#5D8A4E"  # рамка

def norm(s: str) -> str:
    return s.replace("\u00a0", " ").replace("\u202f", " ").strip()

def parse_card(t: str):
    lines = [norm(x) for x in t.split("\n") if norm(x)]
    num = lines[0]
    name = lines[1]
    model = lines[2]
    price = next(x for x in lines if "₽" in x)
    power = next((x for x in lines if "кВт" in x), "")
    dims = next(x for x in lines if "мм" in x and "×" in x)
    nums = re.findall(r"[\d\s]+", dims.replace("мм", ""))
    w_mm, d_mm, h_mm = [int(re.sub(r"\D", "", n)) for n in nums[:3]]
    try:
        i = lines.index("SVG")
        desc = "; ".join(lines[i + 1:])
    except ValueError:
        desc = ""
    return {"num": num, "name": name, "model": model, "price": price,
            "power": power, "w_mm": w_mm, "d_mm": d_mm, "h_mm": h_mm,
            "dims": dims, "desc": desc}

def label_dims(label: str):
    m = re.search(r"([\d\s]+)\s*на\s*([\d\s]+)\s*мм", norm(label))
    if not m:
        return None, None
    return int(re.sub(r"\D", "", m.group(1))), int(re.sub(r"\D", "", m.group(2)))

def process_svg(svg: str, w_mm: int, h_mm: int, item: str) -> str:
    s = svg
    # 1. фоновый rect (единственный с отрицательным x)
    s = re.sub(r'<rect[^>]*\bx="-[^"]*"[^>]*>\s*(?:</rect>)?', "", s)
    s = re.sub(r'<rect[^>]*\bx="-[^"]*"[^>]*/>', "", s)
    # 2. viewBox → габариты предмета (кроп размерных линий и полей)
    s = re.sub(r'viewBox="[^"]*"', f'viewBox="0 0 {w_mm} {h_mm}"', s, count=1)
    # 3. явные width/height (надёжный drawImage в старых браузерах) + xmlns
    #    (outerHTML сериализует <svg> без namespace — standalone-парсер его требует)
    s = re.sub(r'(<svg[^>]*?)(\s*)>', rf'\1 width="{w_mm}" height="{h_mm}" xmlns="http://www.w3.org/2000/svg">', s, count=1)
    # 4. служебный class не нужен
    s = re.sub(r'\s*class="[^"]*"', "", s, count=1)
    # 5. перекраска в зелёную палитру
    for src, dst in COLOR_MAP.items():
        s = re.sub(src, dst, s, flags=re.IGNORECASE)
    # контроль: есть содержимое внутри кропа (rect/circle/path)
    if not re.search(r'<(rect|circle|ellipse|path|line|polyline|polygon)\b', s):
        print(f"  ! пустой SVG: {item}")
    return s

def main():
    items = json.load(open(ITEMS_PATH, encoding="utf-8"))
    order = {"opt": 0, "pro": 1}
    items.sort(key=lambda x: (order[x["kit"]], x["idx"]))

    seen, unique = set(), []
    for it in items:
        card = parse_card(it["t"])
        key = card["name"] + "|" + card["model"]
        if key in seen:
            continue
        seen.add(key)
        w_mm, h_mm = label_dims(it["label"] or "")
        if w_mm is None:
            w_mm, h_mm = card["w_mm"], card["d_mm"]
        # сверка SVG-габаритов с подписью
        if (w_mm, h_mm) != (card["w_mm"], card["d_mm"]):
            print(f"  ! расхождение {card['name']}: label {w_mm}×{h_mm} vs текст {card['w_mm']}×{card['d_mm']} — беру label")
        svg = process_svg(it["svg"], w_mm, h_mm, card["name"])
        data_url = "data:image/svg+xml;charset=utf-8," + re.sub(r"%[0-9A-Fa-f]{2}", lambda m: m.group(0), __import__("urllib.parse", fromlist=["quote"]).quote(svg, safe=""))
        unique.append({
            "id": f"klen_{len(unique) + 1}",
            "name": f"{card['name']} · {card['model']} · {card['price']}",
            "w": round(w_mm / 10), "h": round(h_mm / 10),
            "kit": it["kit"], "num": card["num"],
            "price": card["price"], "power": card["power"],
            "desc": card["desc"], "img": data_url,
        })

    print(f"Уникальных позиций: {len(unique)}")
    total_kb = sum(len(u["img"]) for u in unique) / 1024
    print(f"Суммарный объём data URL: {total_kb:.0f} КБ")

    def ts_str(s: str) -> str:
        return s.replace("\\", "\\\\").replace("'", "\\'")

    lines = []
    lines.append("import type { Preset } from './presets'")
    lines.append("")
    lines.append("/**")
    lines.append(" * Раздел «Клён» (klenmarket.ru): оборудование для кафе из каталога.")
    lines.append(" * У каждой позиции: полное название с моделью и ценой, габариты Ш×Г (вид сверху)")
    lines.append(" * и схема из каталога, перекрашенная в зелёную палитру (#DCEBD3 / #5D8A4E).")
    lines.append(" */")
    lines.append("export const KLEN_PRESETS: (Preset & { img: string })[] = [")
    for u in unique:
        kit = "«Оптимум»" if u["kit"] == "opt" else "«Про»"
        lines.append(f"  // {kit}, позиция {u['num']}{' — ' + u['desc'] if u['desc'] else ''}")
        lines.append(f"  {{ id: '{u['id']}', name: '{ts_str(u['name'])}', category: 'klen', w: {u['w']}, h: {u['h']}, color: '{FILL}', img: '{u['img']}' }},")
    lines.append("]")
    lines.append("")
    lines.append(f"/** Зелёный контур раздела «Клён» */")
    lines.append(f"export const KLEN_STROKE = '{STROKE}'")
    lines.append("")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"OK: {OUT_PATH}")

if __name__ == "__main__":
    main()
