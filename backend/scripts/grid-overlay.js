// Rend la grille détectée en surimpression sur l'image, pour vérification visuelle.
// Reproduit le modèle géométrique de frontend/src/utils/mapGrid.js (avec cellW/cellH).
// Usage: node scripts/grid-overlay.js <image> <out.png> [left,top,size]
const sharp = require('sharp')
const { detectGridConfig, _internal } = require('../src/gridDetection')

function squareLines(cfg, W, H) {
  const cellW = (cfg.gridCellW || 1 / cfg.gridCols) * W
  const cellH = (cfg.gridCellH || 1 / cfg.gridRows) * H
  const ox = cfg.gridOffsetX * W
  const oy = cfg.gridOffsetY * H
  let d = ''
  for (let c = 0; c <= cfg.gridCols; c++) {
    const x = ox + c * cellW
    d += `M ${x.toFixed(1)} 0 L ${x.toFixed(1)} ${H} `
  }
  for (let r = 0; r <= cfg.gridRows; r++) {
    const y = oy + r * cellH
    d += `M 0 ${y.toFixed(1)} L ${W} ${y.toFixed(1)} `
  }
  return d
}

function hexPaths(cfg, W, H) {
  const { gridCols: cols, gridRows: rows, gridHexOrientation: orient } = cfg
  const hexW = (cfg.gridCellW || (orient === 'pointy' ? 1 / cols : 1 / (cols * 0.75 + 0.25))) * W
  const hexH = (cfg.gridCellH || (orient === 'pointy' ? 1 / (rows * 0.75 + 0.25) : 1 / rows)) * H
  const ox = cfg.gridOffsetX * W
  const oy = cfg.gridOffsetY * H
  let d = ''
  for (let idx = 0; idx < cols * rows; idx++) {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const v = _internal.hexVerticesPx(col, row, hexW, hexH, orient, ox, oy)
    d += 'M ' + v.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ') + ' Z '
  }
  return d
}

async function main() {
  const [file, out, cropArg] = process.argv.slice(2)
  const cfg = await detectGridConfig(file)
  console.log(JSON.stringify(cfg))
  if (cfg.gridType === 'none') { console.log('Pas de grille détectée — pas d\'overlay.'); return }

  const meta = await sharp(file).metadata()
  const W = meta.width, H = meta.height
  const d = cfg.gridType === 'square' ? squareLines(cfg, W, H) : hexPaths(cfg, W, H)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <path d="${d}" stroke="red" stroke-width="2" fill="none" opacity="0.85"/></svg>`
  const composited = await sharp(file).composite([{ input: Buffer.from(svg) }]).png().toBuffer()
  if (cropArg) {
    // crop "left,top,size" à 100 % pour inspecter l'alignement
    const [left, top, size] = cropArg.split(',').map(Number)
    await sharp(composited).extract({ left, top, width: size, height: size }).png().toFile(out)
  } else {
    await sharp(composited)
      .resize({ width: Math.min(W, 1400), withoutEnlargement: true })
      .png()
      .toFile(out)
  }
  console.log('overlay →', out)
}

main().catch(err => { console.error(err); process.exit(1) })
