/**
 * Запусти: node scripts/compile-marker.js
 * Создаёт public/targets/marker.mind из public/targets/marker.png
 *
 * Или используй онлайн: https://hiukim.github.io/mind-ar-js-doc/tools/compile
 * Загрузи любое изображение → скачай .mind файл → положи в public/targets/marker.mind
 */
const { Compiler } = require('@hiukim/mind-ar-js/src/image-target/compiler')
const fs = require('fs')
const path = require('path')

async function main() {
  const imgPath = path.join(__dirname, '../public/targets/marker.png')
  if (!fs.existsSync(imgPath)) {
    console.error('Положи изображение маркера в public/targets/marker.png')
    process.exit(1)
  }

  const compiler = new Compiler()
  const img = fs.readFileSync(imgPath)
  await compiler.compileImageTargets([img], (progress) => {
    console.log(`Компиляция: ${Math.round(progress * 100)}%`)
  })

  const buffer = await compiler.exportData()
  fs.mkdirSync(path.join(__dirname, '../public/targets'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, '../public/targets/marker.mind'), Buffer.from(buffer))
  console.log('✅ Готово: public/targets/marker.mind')
}
main().catch(console.error)
