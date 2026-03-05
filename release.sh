#!/bin/bash
# release.sh — macOS / Linux
# Использование: bash release.sh

CURRENT=$(node -p "require('./package.json').version")
echo "Текущая версия: $CURRENT"

IFS='.' read -ra PARTS <<< "$CURRENT"
SUGGESTED="${PARTS[0]}.${PARTS[1]}.$((PARTS[2]+1))"

read -rp "Новая версия [$SUGGESTED]: " INPUT_VER
INPUT_VER=${INPUT_VER:-$SUGGESTED}

read -rp "Описание изменений: " INPUT_DESC
INPUT_DESC=${INPUT_DESC:-"Release $INPUT_VER"}

# Обновляем package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.version = '$INPUT_VER';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

git add -A
git commit -m "release: v$INPUT_VER — $INPUT_DESC"
git push
git tag "v$INPUT_VER"
git push origin "v$INPUT_VER"

echo "Готово! Версия v$INPUT_VER опубликована."
