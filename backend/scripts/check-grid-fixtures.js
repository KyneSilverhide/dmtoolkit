// Non-régression du détecteur de grille sur test/grid-fixtures (le backend n'a pas de lanceur de tests).
// Usage: node scripts/check-grid-fixtures.js
const path = require('path')
const assert = require('assert')
const { detectGridConfig } = require('../src/gridDetection')

const FIXTURES = path.join(__dirname, '..', 'test', 'grid-fixtures')
const CASES = [
  { file: 'hex-badlands.webp', gridType: 'hex', orientation: 'flat', cols: 36, rows: 22, cellW: 0.03757, cellH: 0.0456 },
  { file: 'hex-badlands-margins.webp', gridType: 'hex', orientation: 'flat', cols: 30, rows: 20, cellW: 0.03844, cellH: 0.04494 },
  { file: 'hex-badlands-cropped.webp', gridType: 'hex', orientation: 'flat', cols: 30, rows: 20, cellW: 0.0442, cellH: 0.05213 },
  { file: 'square-garden.webp', gridType: 'square', orientation: 'flat', cols: 30, rows: 30, cellW: 0.03333, cellH: 0.03333 },
  { file: 'square-garden-margins.webp', gridType: 'square', orientation: 'flat', cols: 30, rows: 30, cellW: 0.02806, cellH: 0.02776 },
  { file: 'square-pipes-small.png', gridType: 'square', orientation: 'flat', cols: 7, rows: 7, cellW: 0.12903, cellH: 0.12903 },
]
const SIZE_TOLERANCE = 0.002

async function main() {
  let failed = 0
  for (const c of CASES) {
    const result = await detectGridConfig(path.join(FIXTURES, c.file))
    try {
      assert.strictEqual(result.gridType, c.gridType)
      assert.strictEqual(result.gridHexOrientation, c.orientation)
      assert.strictEqual(result.gridCols, c.cols)
      assert.strictEqual(result.gridRows, c.rows)
      assert.ok(Math.abs(result.gridCellW - c.cellW) <= SIZE_TOLERANCE, `cellW ${result.gridCellW}`)
      assert.ok(Math.abs(result.gridCellH - c.cellH) <= SIZE_TOLERANCE, `cellH ${result.gridCellH}`)
      console.log(`ok   ${c.file}`)
    } catch (err) {
      failed++
      console.log(`FAIL ${c.file}: ${err.message.split('\n')[0]}`)
      console.log(' ', JSON.stringify(result))
    }
  }
  process.exit(failed ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(1) })
