#!/usr/bin/env bash
# ╔═══════════════════════════════════════════╗
# ║  Mobile XR — Скрипт публикации релиза    ║
# ╚═══════════════════════════════════════════╝
set -e

# Цвета
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}         Mobile XR — Публикация релиза   ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Текущая версия
CURRENT=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
echo -e "Текущая версия: ${YELLOW}v${CURRENT}${NC}"

# Ввод новой версии
read -rp "Введите новую версию (X.Y.Z, Enter=patch bump): " INPUT_VER

if [[ -z "$INPUT_VER" ]]; then
  # Автоинкремент patch
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  PATCH=$((PATCH+1))
  INPUT_VER="${MAJOR}.${MINOR}.${PATCH}"
fi

# Валидация
if [[ ! "$INPUT_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}❌ Неверный формат. Используй X.Y.Z${NC}"
  exit 1
fi

VERSION="v${INPUT_VER}"
echo ""
read -rp "Создать релиз ${VERSION}? (y/N): " CONFIRM
[[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && echo "Отменено." && exit 0

# Обновить package.json
npm version "$INPUT_VER" --no-git-tag-version --allow-same-version
echo -e "${GREEN}✓ package.json обновлён до ${INPUT_VER}${NC}"

# Запрос описания (опционально)
read -rp "Краткое описание изменений (Enter — пропустить): " NOTES

# Коммит
git add package.json package-lock.json 2>/dev/null || git add package.json
git commit -m "release: ${VERSION}${NOTES:+" — $NOTES"}"
echo -e "${GREEN}✓ Коммит создан${NC}"

# Тег
git tag "$VERSION" -m "${NOTES:-"Release $VERSION"}"
echo -e "${GREEN}✓ Тег ${VERSION} создан${NC}"

# Push
echo ""
echo -e "${YELLOW}Отправка на GitHub...${NC}"
git push
git push --tags
echo ""
echo -e "${GREEN}✅ Релиз ${VERSION} опубликован!${NC}"
echo -e "GitHub Actions соберёт и задеплоит приложение автоматически."
echo -e "Ссылка: ${BLUE}https://github.com/MihailKashintsev/mobile-xr/releases/tag/${VERSION}${NC}"
