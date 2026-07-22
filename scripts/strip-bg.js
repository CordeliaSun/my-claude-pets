// Make a white/near-white background transparent so an image works as a pet.
//
// Flood-fills from the image edges, so only background pixels connected to
// the border become transparent — white *inside* your character (eyes, fur,
// teeth) is preserved.
//
// Usage:
//   npm run strip-bg -- <input.png> <output.png> [maxDim]
//
// maxDim (default 512) caps the longest side; larger inputs are downscaled.
const { app, nativeImage } = require('electron')
const fs = require('fs')

app.whenReady().then(() => {
  const [inPath, outPath, maxDimArg] = process.argv.slice(2)
  if (!inPath || !outPath) {
    console.error('usage: npm run strip-bg -- <input.png> <output.png> [maxDim]')
    app.exit(1)
    return
  }
  const maxDim = Number(maxDimArg) || 512
  const src = nativeImage.createFromPath(inPath)
  if (src.isEmpty()) {
    console.error(`cannot read image: ${inPath}`)
    app.exit(1)
    return
  }
  const { width: w, height: h } = src.getSize()
  const buf = Buffer.from(src.toBitmap()) // BGRA, premultiplied

  const NEAR_WHITE = 235
  const isBg = (i) => buf[i] >= NEAR_WHITE && buf[i + 1] >= NEAR_WHITE && buf[i + 2] >= NEAR_WHITE

  // BFS flood fill from all border pixels
  const visited = new Uint8Array(w * h)
  const queue = []
  const push = (x, y) => {
    const p = y * w + x
    if (visited[p]) return
    visited[p] = 1
    if (isBg(p * 4)) queue.push(p)
    else visited[p] = 2 // boundary pixel, keep it
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }

  while (queue.length) {
    const p = queue.pop()
    // zero color too: the buffer is premultiplied — color>alpha is invalid
    // and resize() silently re-opaques such pixels
    buf[p * 4] = 0; buf[p * 4 + 1] = 0; buf[p * 4 + 2] = 0; buf[p * 4 + 3] = 0
    const x = p % w, y = (p / w) | 0
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }

  let out = nativeImage.createFromBitmap(buf, { width: w, height: h })
  if (Math.max(w, h) > maxDim) {
    const s = maxDim / Math.max(w, h)
    out = out.resize({ width: Math.round(w * s), height: Math.round(h * s), quality: 'best' })
  }
  fs.writeFileSync(outPath, out.toPNG())
  console.log(`wrote ${outPath} (${out.getSize().width}x${out.getSize().height})`)
  app.quit()
})
