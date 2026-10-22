#!/usr/bin/env python3
"""Сборка комплекта миграции проекта «Планировщик помещения» в Cursor.

Генерирует в download/:
  planer-cursor-migration-<ver>.md  — единый файл: контекст + ВСЕ текстовые исходники + инструкция
  planer-cursor-migration-<ver>.zip — полный снапшот репо (без skills/.zscripts/.git) +
                                      .cursorrules, .cursor/rules/planer.mdc,
                                      scripts/surge-deploy.py, .env, RESTORE-INFO.txt

Секреты: GitHub PAT берётся ТОЛЬКО из env GITHUB_PAT (не хранится в скрипте),
попадает только в gitignored RESTORE-INFO.txt внутри zip.

Запуск: GITHUB_PAT='...' python3 scripts/build-cursor-bundle.py
"""
import os
import subprocess
import sys
import zipfile
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "download")
os.makedirs(OUT, exist_ok=True)

LIVE = "https://room-planner-ru.surge.sh"
REPO = "https://github.com/varfolomeevart-web/planer"

# --- исключения (внутренности платформы Z-ai, старые чекпоинты, мусор) ---
EXCLUDE_PREFIX = ("skills/", ".zscripts/")
EXCLUDE_EXACT = {"db/custom.db", "mini-services/.gitkeep"}
EXCLUDE_SUFFIX_ZIP = (".zip",)          # старые чекпоинты внутри download/
EXCLUDE_MD_EXTRA = {"bun.lock"}         # машинный лок-файл: есть в zip
TEXT_EXT = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".md",
    ".mdc", ".txt", ".sh", ".py", ".html", ".svg", ".yml", ".yaml", ".sql", ".prisma",
}
TEXT_NO_EXT = {".gitignore", ".cursorrules", ".env", "Caddyfile", ".gitkeep", "Dockerfile"}
MD_MAX_BYTES = 450_000

LANG = {
    ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx", ".mjs": "js",
    ".cjs": "js", ".json": "json", ".css": "css", ".md": "md", ".txt": "text",
    ".sh": "bash", ".py": "python", ".html": "html", ".svg": "xml",
    ".yml": "yaml", ".yaml": "yaml", ".prisma": "prisma", ".sql": "sql",
    "": "text",
}


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, check=True).stdout


def main():
    commit = sh("git", "rev-parse", "--short", "HEAD").decode().strip()
    commit_long = sh("git", "rev-parse", "HEAD").decode().strip()
    ver = "v1.8"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    pat = os.environ.get("GITHUB_PAT", "").strip()

    # ---- список трекед-файлов (сырые байты, -z) ----
    raw = sh("git", "ls-files", "-z")
    tracked = [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\0") if p]

    zip_files, md_files, md_skipped = [], [], []
    for p in sorted(tracked):
        if p.startswith(EXCLUDE_PREFIX) or p in EXCLUDE_EXACT:
            continue
        if p.endswith(EXCLUDE_SUFFIX_ZIP):
            continue
        disk = os.path.join(ROOT, p)
        if not os.path.isfile(disk):
            md_skipped.append((p, "нет на диске (переименован/удалён)"))
            continue
        zip_files.append(p)
        # кандидат в MD
        if p == "worklog.md":
            md_skipped.append((p, "вынесен в раздел-приложение 6"))
            continue
        if p in EXCLUDE_MD_EXTRA:
            md_skipped.append((p, "лок-файл (есть в zip)"))
            continue
        ext = os.path.splitext(p)[1].lower()
        if ext not in TEXT_EXT and os.path.basename(p) not in TEXT_NO_EXT:
            md_skipped.append((p, "бинарный (в zip)"))
            continue
        size = os.path.getsize(disk)
        if size > MD_MAX_BYTES:
            md_skipped.append((p, f"> {MD_MAX_BYTES // 1000} КБ (в zip)"))
            continue
        data = open(disk, "rb").read()
        if b"\0" in data[:8192]:
            md_skipped.append((p, "бинарный (в zip)"))
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            md_skipped.append((p, "не UTF-8 (в zip)"))
            continue
        md_files.append((p, text))

    # disk-only бонусы: переименованная инструкция (нестекаемый трек с другим именем)
    instr = "download/ИНСТРУКЦИЯ-где-вставить-токен.txt"
    if os.path.isfile(os.path.join(ROOT, instr)) and instr not in zip_files:
        zip_files.append(instr)
        md_files.append((instr, open(os.path.join(ROOT, instr), encoding="utf-8").read()))

    extras = ["scripts/surge-deploy.py", ".env", ".cursorrules", ".cursor/rules/planer.mdc"]
    for p in extras:
        if os.path.isfile(os.path.join(ROOT, p)) and p not in zip_files:
            zip_files.append(p)
    # RESTORE-INFO.txt генерится ниже и добавляется в zip напрямую

    # ---- сортировка MD: логичными группами ----
    def order_key(item):
        p, _ = item
        groups = [
            ("package.json", 0), ("next.config.ts", 1), ("tsconfig.json", 2),
            ("tailwind.config.ts", 3), ("postcss.config.mjs", 4),
            ("eslint.config.mjs", 5), ("components.json", 6), (".gitignore", 7),
        ]
        for name, idx in groups:
            if p == name:
                return (idx, p)
        if p.startswith("src/lib/"):
            return (10, p)
        if p.startswith("src/components/"):
            return (11, p)
        if p.startswith("src/"):
            return (12, p)
        if p.startswith("scripts/"):
            return (20, p)
        if p.startswith("tests/"):
            return (30, p)
        if p.startswith("prisma/") or p.startswith("db"):
            return (31, p)
        if p.startswith(".github/") or p.startswith("public/") or p.startswith("examples/"):
            return (32, p)
        if p == "Caddyfile":
            return (33, p)
        if p == "worklog.md":
            return (90, p)
        return (50, p)

    md_files.sort(key=order_key)

    # ===================== RESTORE-INFO.txt =====================
    pat_block = pat if pat else "<вставьте ваш GitHub PAT>"
    restore = f"""ПЛАНИРОВЩИК ПОМЕЩЕНИЯ — комплект миграции в Cursor
Создан: {stamp}
Версия: {ver} | commit: {commit} | live: {LIVE}
Репозиторий: {REPO}

=== 1. GitHub ===
Fine-grained PAT (обновлён 2026-10-19, права на repo planer):
{pat_block}

Клонировать с полной историей (рекомендуется):
  git clone https://x-access-token:{pat_block}@github.com/varfolomeevart-web/planer.git planer
  cd planer && git checkout {commit}

Теги всех версий: v1.0 … v1.8 (v1.8 — текущая: 3D-модель GLB + рендер из неё).

=== 2. Запуск в Cursor ===
1) Распакуйте zip (папка planer/) или используйте клон из п.1
2) Откройте папку в Cursor — правила .cursorrules и .cursor/rules/planer.mdc подхватятся автоматически
3) Установите зависимости: bun install  (или npm install)
4) Запуск: bun run dev → http://localhost:3000

=== 3. Сборка и деплой на surge ===
  BUNDLER=webpack ./scripts/build-static-export.sh     # соберёт out/
  python3 scripts/surge-deploy.py                      # деплой на {LIVE}
  # скрипт восстановлен в безопасной редакции: токен НЕ вшит, а читается из .env
  # заполните в .env: SURGE_TOKEN=<npx surge token> и SURGE_EMAIL=<email аккаунта>
  # (один раз: npx surge login → npx surge token)

=== 4. Push в GitHub из локальной копии ===
Вариант А (проще): добавить в .env три строки и выполнить скрипт:
  GITHUB_TOKEN=<PAT из п.1>
  GITHUB_USER=varfolomeevart-web
  GITHUB_REPO=planer
  bash scripts/push-github.sh          # токен подставляется только на время push
Вариант Б (если делали git clone): remote уже настроен — обычный git push.

=== 5. Проверки перед коммитом ===
  bun scripts/check-brief.ts     # ТЗ-бриф: 28 PASS
  bun scripts/check-gltf.ts      # GLB-модель: 22 PASS
  npx tsc --noEmit && npx eslint src

=== 6. Состав комплекта ===
- Полное состояние репозитория на commit {commit} (без .git — история через git clone)
- .cursorrules + .cursor/rules/planer.mdc — правила для Cursor AI
- .env — локальные переменные (сейчас только DATABASE_URL; сюда же вписывается GITHUB_TOKEN)
- RESTORE-INFO.txt — этот файл
- Исключены: skills/ и .zscripts/ (внутренности платформы Z-ai, 1.1k файлов),
  download/*.zip (старые чекпоинты), db/custom.db (sqlite, не используется)

=== 7. Безопасность ===
Этот файл содержит GitHub PAT. Не коммитить, не пересылать третьим лицам.
"""
    restore_path = os.path.join(ROOT, "RESTORE-INFO.txt")
    with open(restore_path, "w", encoding="utf-8") as f:
        f.write(restore)

    # ===================== ZIP =====================
    zip_name = os.path.join(OUT, f"planer-cursor-migration-{ver}.zip")
    with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in zip_files:
            z.write(os.path.join(ROOT, p), arcname=os.path.join("planer", p))
        z.write(restore_path, arcname="planer/RESTORE-INFO.txt")
    zip_size = os.path.getsize(zip_name)

    # ===================== MD =====================
    md_name = os.path.join(OUT, f"planer-cursor-migration-{ver}.md")
    src_count = sum(1 for p, _ in md_files)
    total_lines = sum(t.count("\n") + 1 for _, t in md_files)
    parts = []
    parts.append(f"""# Планировщик помещения — единый бандл миграции в Cursor

> **Снимок проекта:** {ver} · commit `{commit}` (`{commit_long[:12]}…`) · {stamp}
> **Live:** {LIVE} · **GitHub:** {REPO}
> **Состав:** {src_count} текстовых файлов, ~{total_lines:,} строк. Бинарные файлы (скриншоты-доказательства, иконки, лок-файл) — в ZIP-комплекте `planer-cursor-migration-{ver}.zip`.

---

## 1. Как мигрировать в Cursor

1. **Получить код** — любой из вариантов:
   - **git clone (рекомендуется, с полной историей):** `git clone https://x-access-token:<PAT>@github.com/varfolomeevart-web/planer.git planer` — PAT в `RESTORE-INFO.txt` внутри ZIP.
   - **ZIP-комплект:** распаковать `planer-cursor-migration-{ver}.zip` — внутри папка `planer/` с полным состоянием кода, правилами `.cursorrules`, `.env` и `RESTORE-INFO.txt` (GitHub PAT).
2. **Открыть в Cursor:** File → Open Folder → `planer`. Файлы `.cursorrules` и `.cursor/rules/planer.mdc` подхватятся автоматически — Cursor AI будет соблюдать инварианты проекта (см. раздел 3).
3. **Зависимости и запуск:** `bun install` (или `npm install`) → `bun run dev` → http://localhost:3000
4. **Проверить себя:** `bun scripts/check-brief.ts` (28 PASS) и `bun scripts/check-gltf.ts` (22 PASS) должны проходить сразу после распаковки.
5. **Деплой после правок:** `BUNDLER=webpack ./scripts/build-static-export.sh` → `python3 scripts/surge-deploy.py` (токен в `.env`: `SURGE_TOKEN`/`SURGE_EMAIL`; получить: `npx surge login` → `npx surge token`). Push в GitHub: `bash scripts/push-github.sh` (токен в `.env`).

## 2. Контекст проекта

**Что это:** русскоязычный веб-планировщик помещений (вид сверху, координаты в см) с автогенерацией ТЗ для 3D-визуализатора, объёмным 3D-видом и экспортом координатной GLB-модели + PNG-рендера. Заказчик переносит ТЗ + JSON + GLB в Blender/3ds Max — сайт служит источником «строгого соответствия» план ↔ ТЗ ↔ модель ↔ рендер.

**Стек:** Next.js 16 App Router (static export, только клиент), TypeScript strict, Tailwind 4, shadcn/ui, Canvas 2D, bun. Без БД и сервера — всё состояние в localStorage (`room-planner-v1`), SaveFile v3 с автогенерируемым полем `brief`.

**Модель данных (v3, аддитивная):** `PlannerDoc → floors[] → {{ contour (замкнутый многоугольник наружных стен), objects[] (мебель/двери/окна/лестницы с OpeningSpec/StairsSpec/MaterialSpec, heightCm, model, material, hexColor), partitions[] ({{id, pts, thicknessCm, material}}), ceilingHeightCm, floorMaterial/wallMaterial/ceilingMaterial (+HEX), lightingNotes[], views[] }}`. Миграция старых версий — `migrate.ts`, обратная совместимость обязательна.

**ТЗ (brief):** `buildRenderBrief(doc)` — текст для 3D-визуализатора: легенда координат (см, (0;0) слева сверху, Y вниз), стены контуром с вершинами, перегородки с толщинами/конструкциями, потолок, проёмы с типом открывания/подоконниками, лестницы со ступенями, вся мебель W×D×H, МАТЕРИАЛЫ И ТЕКСТУРЫ с HEX, ОСВЕЩЕНИЕ по зонам, РАКУРСЫ. Кнопка «ТЗ» копирует его в буфер.

**3D:** аксонометрия на Canvas (`view3d.ts`) — перегородки объёмными призмами с реальной толщиной/материалом (стекло полупрозрачно), высота = потолок этажа. `gltf.ts` пишет GLB вручную (glTF 2.0 binary, ear-clip триангуляция): метры, X=x/100, Z=y/100, Y=высота/100 (маппинг в asset.extras), наружные стены 20 см наружу от контура, именованные материалы «Перегородка N — …», BLEND для стекла. PNG — рендер ×2 (2560×1052) из той же сцены.

**Деплой:** `BUNDLER=webpack ./scripts/build-static-export.sh` → `python3 scripts/surge-deploy.py` (pty, токен вшит, gitignored) → {LIVE}. Версии: тег vX.Y + GitHub Release (v1.8 — текущая).

**История разработки:** полная летопись решений — в `worklog.md` (раздел-приложение ниже): 11 задач от MVP до координатной 3D-модели.

## 3. Правила для Cursor AI (.cursorrules)

```text
{open('.cursorrules', encoding='utf-8').read()}
```

## 4. Карта файлов

```text
""")

    # дерево
    tree_dirs = {}
    for p, _ in md_files:
        d = os.path.dirname(p)
        tree_dirs.setdefault(d if d else ".", []).append(os.path.basename(p))
    for d in sorted(tree_dirs):
        parts.append(f"{d}/  ({len(tree_dirs[d])} файлов)\n")
        for b in sorted(tree_dirs[d]):
            parts.append(f"  {b}\n")
    skipped_zip_only = [s for s in md_skipped if s[1] != "нет на диске (переименован/удалён)"]
    parts.append(f"""
```

**Не вошло в MD (есть в ZIP):** {len(skipped_zip_only)} файлов — бинарные скриншоты-доказательства (test-results/, test-screens/, scripts/*.png|pdf), `bun.lock`, иконки. Также в ZIP: `scripts/surge-deploy.py`, `.env`, `.cursorrules`, `.cursor/rules/planer.mdc`, `RESTORE-INFO.txt` (с GitHub PAT).
**Исключено полностью:** `skills/` и `.zscripts/` (внутренности платформы Z-ai, к приложению не относятся), старые `download/*.zip` чекпоинты, `db/custom.db`.

---

## 5. Исходники ({src_count} файлов)

""")

    cur_group = None
    for p, text in md_files:
        grp = p.split("/")[0] if "/" in p else "(корень)"
        if grp != cur_group:
            cur_group = grp
            parts.append(f"\n### ── {grp} ──\n")
        ext = os.path.splitext(p)[1].lower()
        lang = LANG.get(ext, "text")
        parts.append(f"\n#### `{p}`\n\n````{lang}\n{text}\n````\n")

    parts.append(f"""
---

## 6. Приложение: worklog.md — история разработки

````md
{open('worklog.md', encoding='utf-8').read()}
````

*(Конец бандла. Файл собран scripts/build-cursor-bundle.py на commit {commit}.)*
""")

    with open(md_name, "w", encoding="utf-8") as f:
        f.write("".join(parts))
    md_size = os.path.getsize(md_name)

    print(f"commit: {commit}")
    print(f"ZIP: {zip_name}  ({zip_size / 1e6:.1f} MB, {len(zip_files) + 1} файлов)")
    print(f"MD:  {md_name}  ({md_size / 1e6:.2f} MB, {src_count} текстовых файлов, ~{total_lines:,} строк)")
    print("\nПропущены в MD:")
    for p, why in md_skipped:
        print(f"  - {p}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
