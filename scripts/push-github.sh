#!/usr/bin/env bash
# ============================================================
# Выгрузка проекта на GitHub. Токен берётся из .env (GITHUB_TOKEN).
# Использование:  bash scripts/push-github.sh
# Токен нигде не сохраняется: подставляется только на время push.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ОШИБКА: файл .env не найден в корне проекта"; exit 1
fi
set -a; source .env; set +a

: "${GITHUB_TOKEN:?ОШИБКА: GITHUB_TOKEN не заполнен в .env (вставьте токен после знака =)}"
: "${GITHUB_USER:?ОШИБКА: GITHUB_USER не заполнен в .env}"
: "${GITHUB_REPO:?ОШИБКА: GITHUB_REPO не заполнен в .env}"

CLEAN_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
AUTH_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

# remote всегда хранит чистый URL без токена
git remote set-url origin "$CLEAN_URL"

echo "-> Push main + теги в ${GITHUB_USER}/${GITHUB_REPO} ..."
if OUT=$(git push "$AUTH_URL" main --tags 2>&1); then
  git remote set-url origin "$CLEAN_URL"
  echo "$OUT" | sed "s#${GITHUB_TOKEN}#***#g"
  echo "OK: main + теги выгружены. Репозиторий: https://github.com/${GITHUB_USER}/${GITHUB_REPO}"
  git log --oneline -3
else
  git remote set-url origin "$CLEAN_URL"
  echo "$OUT" | sed "s#${GITHUB_TOKEN}#***#g"
  echo "ОШИБКА: push не удался. Проверьте: токен действует и имеет право Contents: Read and write (или classic scope repo)"
  exit 1
fi
