// CLI de test du détecteur de grille.
// Usage: node scripts/detect-grid.js <image> [image...]
const { detectGridConfig } = require('../src/gridDetection')

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('Usage: node scripts/detect-grid.js <image> [image...]')
    process.exit(1)
  }
  for (const file of files) {
    const t0 = Date.now()
    const result = await detectGridConfig(file)
    console.log(`${file} (${Date.now() - t0}ms)`)
    console.log(' ', JSON.stringify(result))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
