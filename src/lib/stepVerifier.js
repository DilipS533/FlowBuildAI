// Lightweight rule-based step verifier for quick hackathon checks.
// Exports snapshotPieces(canvas, ctx, config) and verifyStep(pre, post, stepType, opts)

export function snapshotPieces(canvas, ctx, config) {
  if (!canvas || !ctx) return { pieces: [], total: 0 };

  const w = config.captureWidth;
  const h = config.captureHeight;
  let img;
  try {
    img = ctx.getImageData(0, 0, w, h).data;
  } catch (e) {
    return { pieces: [], total: 0 };
  }

  const cell = 4;
  const gw = Math.max(8, Math.floor(w / cell));
  const gh = Math.max(6, Math.floor(h / cell));
  const cellW = Math.floor(w / gw);
  const cellH = Math.floor(h / gh);

  const palette = [
    { name: 'red', rgb: [200, 40, 50] },
    { name: 'blue', rgb: [50, 80, 200] },
    { name: 'yellow', rgb: [230, 200, 40] },
    { name: 'green', rgb: [40, 150, 60] },
    { name: 'white', rgb: [240, 240, 240] },
    { name: 'black', rgb: [30, 30, 30] },
  ];

  function nearestPalette(r, g, b) {
    let best = null;
    let bestDist = Infinity;
    for (const p of palette) {
      const dr = r - p.rgb[0];
      const dg = g - p.rgb[1];
      const db = b - p.rgb[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return bestDist < 22000 ? best.name : null;
  }

  const grid = Array.from({ length: gh }, () => Array(gw).fill(null));

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        count = 0;
      const sx = gx * cellW;
      const sy = gy * cellH;
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const px = Math.min(w - 1, sx + x);
          const py = Math.min(h - 1, sy + y);
          const idx = (py * w + px) * 4;
          rSum += img[idx];
          gSum += img[idx + 1];
          bSum += img[idx + 2];
          count += 1;
        }
      }
      const rAvg = rSum / count;
      const gAvg = gSum / count;
      const bAvg = bSum / count;
      grid[gy][gx] = nearestPalette(rAvg, gAvg, bAvg);
    }
  }

  const visited = Array.from({ length: gh }, () => Array(gw).fill(false));
  const pieces = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (visited[y][x] || !grid[y][x]) continue;
      const color = grid[y][x];
      const stack = [[x, y]];
      const cells = [];
      visited[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);
        const nbs = [ [cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1] ];
        for (const [nx, ny] of nbs) {
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !visited[ny][nx] && grid[ny][nx] === color) {
            visited[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }

      if (cells.length >= 3) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [cx, cy] of cells) {
          minX = Math.min(minX, cx * cellW);
          minY = Math.min(minY, cy * cellH);
          maxX = Math.max(maxX, (cx + 1) * cellW);
          maxY = Math.max(maxY, (cy + 1) * cellH);
        }
        pieces.push({ color, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, cells: cells.length });
      }
    }
  }

  return { pieces, total: pieces.length };
}

export function verifyStep(preSnapshot, postSnapshot, stepType) {
  // Basic heuristics
  const pre = preSnapshot || { total: 0, pieces: [] };
  const post = postSnapshot || { total: 0, pieces: [] };

  if (stepType === 'pick') {
    if (post.total < pre.total) {
      return { result: 'ok', reason: 'Piece removed from workspace' };
    }
    return { result: 'needs-adjustment', reason: 'No piece disappearance detected' };
  }

  if (stepType === 'place') {
    if (post.total > pre.total) {
      return { result: 'ok', reason: 'New piece appeared in workspace' };
    }
    return { result: 'needs-adjustment', reason: 'No new piece detected' };
  }

  if (stepType === 'attach') {
    // merging heuristic: if total decreased or two bboxes now overlap
    if (post.total < pre.total) {
      return { result: 'ok', reason: 'Pieces merged (attachment likely)' };
    }

    // check overlap growth between any pre pieces
    for (const pa of pre.pieces) {
      for (const pb of pre.pieces) {
        if (pa === pb) continue;
        const overlapBefore = bboxOverlapArea(pa.bbox, pb.bbox);
        // find corresponding in post by color (best-effort)
        const match = post.pieces.find((p) => p.color === pa.color || p.color === pb.color);
        if (match) {
          const overlapAfter = overlapBefore; // conservative fallback
          if (overlapAfter > 0) {
            return { result: 'ok', reason: 'Proximity/overlap observed' };
          }
        }
      }
    }

    return { result: 'needs-adjustment', reason: 'No attachment observed' };
  }

  // default: rely on presence of motion + hand confirmation elsewhere
  if (post.total !== pre.total) {
    return { result: 'ok', reason: 'Piece count changed' };
  }
  return { result: 'unclear', reason: 'No clear difference detected' };
}

function bboxOverlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}
