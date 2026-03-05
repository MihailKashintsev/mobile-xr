#!/bin/bash
# release.sh — Mac/Linux (bash/zsh)
# Использование: bash release.sh

PKG="package.json"
CURRENT=$(node -e "console.log(require('./$PKG').version)" 2>/dev/null || grep '"version"' $PKG | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')

echo ""
echo "Mobile XR Release Tool"
echo "Текущая версия: $CURRENT"

# Предлагаем patch bump
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
SUGGESTED="$MAJOR.$MINOR.$((PATCH + 1))"

printf "Новая версия [$SUGGESTED]: "
read VERSION
VERSION=${VERSION:-$SUGGESTED}

printf "Описание изменений: "
read MESSAGE
MESSAGE=${MESSAGE:-"Release $VERSION"}

# Обновляем package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
console.log('package.json обновлён до v$VERSION');
"

echo ""
echo "Публикация v$VERSION..."

git add -A
git commit -m "release: v$VERSION — $MESSAGE"
git push

git tag "v$VERSION"
git push origin "v$VERSION"

echo ""
echo "Готово! v$VERSION опубликована"
echo "GitHub Actions собирает и деплоит..."
