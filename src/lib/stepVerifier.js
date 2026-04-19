// Client-side LEGO-oriented verification: color-blob regions on a downsampled
// camera frame (not true part-ID). Used to compare before/after each motion.

const COLOR_LEXICON = [
  ["red", /\b(red|crimson|burgundy)\b/i],
  ["blue", /\b(blue|azure|navy)\b/i],
  ["yellow", /\b(yellow|gold)\b/i],
  ["green", /\b(green|lime|olive)\b/i],
  ["white", /\b(white|light\s*gray|light\s*grey)\b/i],
  ["black", /\b(black|dark\s*gray|dark\s*grey)\b/i],
  ["orange", /\b(orange|peach)\b/i],
  ["brown", /\b(brown|tan|earth)\b/i],
];

/** Colors explicitly mentioned in instruction text (subset of palette names). */
export function extractMentionedLegoColors(instructionText) {
  if (!instructionText || typeof instructionText !== "string") {
    return [];
  }
  const found = new Set();
  for (const [name, re] of COLOR_LEXICON) {
    if (re.test(instructionText)) {
      found.add(name);
    }
  }
  return [...found];
}

function countByColor(pieces) {
  const m = {};
  for (const p of pieces || []) {
    m[p.color] = (m[p.color] || 0) + 1;
  }
  return m;
}

function maxBboxArea(pieces) {
  if (!pieces?.length) {
    return 0;
  }
  return pieces.reduce((max, p) => {
    const a = (p.bbox?.w || 0) * (p.bbox?.h || 0);
    return Math.max(max, a);
  }, 0);
}

/** True if two differently colored pre pieces overlap more visibly after action (attach). */
function attachOverlapImproved(prePieces, postPieces) {
  if (!prePieces?.length || !postPieces?.length) {
    return false;
  }

  for (let i = 0; i < prePieces.length; i += 1) {
    for (let j = i + 1; j < prePieces.length; j += 1) {
      const a = prePieces[i];
      const b = prePieces[j];
      if (a.color === b.color) {
        continue;
      }
      const preO = bboxOverlapArea(a.bbox, b.bbox);
      for (const q of postPieces) {
        const oa = bboxOverlapArea(q.bbox, a.bbox);
        const ob = bboxOverlapArea(q.bbox, b.bbox);
        if (oa > 0 && ob > 0 && oa + ob > preO * 1.2) {
          return true;
        }
      }
    }
  }
  return false;
}

function largestRegionGrew(prePieces, postPieces, ratio = 1.18) {
  const preMax = maxBboxArea(prePieces);
  const postMax = maxBboxArea(postPieces);
  return postMax > preMax * ratio && postMax > 400;
}

export function snapshotPieces(canvas, ctx, config) {
  if (!canvas || !ctx) {
    return { pieces: [], total: 0 };
  }

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
    { name: "red", rgb: [200, 45, 55] },
    { name: "blue", rgb: [45, 90, 200] },
    { name: "yellow", rgb: [235, 205, 45] },
    { name: "green", rgb: [35, 145, 65] },
    { name: "white", rgb: [242, 242, 242] },
    { name: "black", rgb: [28, 28, 32] },
    { name: "orange", rgb: [220, 105, 35] },
    { name: "brown", rgb: [115, 72, 42] },
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
    return bestDist < 24000 ? best.name : null;
  }

  const grid = Array.from({ length: gh }, () => Array(gw).fill(null));

  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      const sx = gx * cellW;
      const sy = gy * cellH;
      for (let yy = 0; yy < cellH; yy += 1) {
        for (let xx = 0; xx < cellW; xx += 1) {
          const px = Math.min(w - 1, sx + xx);
          const py = Math.min(h - 1, sy + yy);
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
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      if (visited[y][x] || !grid[y][x]) {
        continue;
      }
      const color = grid[y][x];
      const stack = [[x, y]];
      const cells = [];
      visited[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);
        const nbs = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of nbs) {
          if (
            nx >= 0 &&
            ny >= 0 &&
            nx < gw &&
            ny < gh &&
            !visited[ny][nx] &&
            grid[ny][nx] === color
          ) {
            visited[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }

      if (cells.length >= 10) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [cx, cy] of cells) {
          minX = Math.min(minX, cx * cellW);
          minY = Math.min(minY, cy * cellH);
          maxX = Math.max(maxX, (cx + 1) * cellW);
          maxY = Math.max(maxY, (cy + 1) * cellH);
        }
        pieces.push({
          color,
          bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          cells: cells.length,
        });
      }
    }
  }

  return { pieces, total: pieces.length };
}

/** Short caption for the UI — coarse LEGO-like hues, not official part IDs. */
export function describeSnapshotForUi(snapshot) {
  if (!snapshot?.total) {
    return "Mat: no separated color blobs yet — center the build and add light.";
  }
  const counts = {};
  for (const p of snapshot.pieces) {
    counts[p.color] = (counts[p.color] || 0) + 1;
  }
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c, n]) => `${n}× ${c}`);
  return `Mat (hue blobs, not part numbers): ${parts.join(" · ")}`;
}

function colorSummary(pieceList) {
  const counts = {};
  for (const p of pieceList || []) {
    counts[p.color] = (counts[p.color] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([c, n]) => `${n} ${c}`);
  return parts.length ? parts.join(", ") : "no separate color regions";
}

function stepSnippet(text, max = 90) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) {
    return "this step";
  }
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

function mentionedColorOkPlace(pre, post, mentioned) {
  if (!mentioned.length) {
    return null;
  }
  const preC = countByColor(pre.pieces);
  const postC = countByColor(post.pieces);
  for (const c of mentioned) {
    if ((postC[c] || 0) > (preC[c] || 0)) {
      return true;
    }
  }
  return false;
}

/** New regions appeared only in colors not called out in the step — likely wrong brick. */
function wrongColorAddedForPlace(pre, post, mentioned) {
  if (!mentioned.length) {
    return false;
  }
  const preC = countByColor(pre.pieces);
  const postC = countByColor(post.pieces);
  let mentionedGrew = false;
  let unmentionedGrew = false;
  for (const c of new Set([...Object.keys(preC), ...Object.keys(postC)])) {
    const delta = (postC[c] || 0) - (preC[c] || 0);
    if (delta <= 0) {
      continue;
    }
    if (mentioned.includes(c)) {
      mentionedGrew = true;
    } else {
      unmentionedGrew = true;
    }
  }
  return unmentionedGrew && !mentionedGrew;
}

function mentionedColorOkPick(pre, post, mentioned) {
  if (!mentioned.length) {
    return null;
  }
  const preC = countByColor(pre.pieces);
  const postC = countByColor(post.pieces);
  for (const c of mentioned) {
    if ((postC[c] || 0) < (preC[c] || 0)) {
      return true;
    }
  }
  return false;
}

function wrongColorRemovedForPick(pre, post, mentioned) {
  if (!mentioned.length) {
    return false;
  }
  const preC = countByColor(pre.pieces);
  const postC = countByColor(post.pieces);
  let mentionedDropped = false;
  let unmentionedDropped = false;
  for (const c of new Set([...Object.keys(preC), ...Object.keys(postC)])) {
    const delta = (postC[c] || 0) - (preC[c] || 0);
    if (delta >= 0) {
      continue;
    }
    if (mentioned.includes(c)) {
      mentionedDropped = true;
    } else {
      unmentionedDropped = true;
    }
  }
  return unmentionedDropped && !mentionedDropped;
}

/**
 * Optional scan service (e.g. self-hosted detector). Brickit does not ship a public HTTP API.
 * @param {{ result: string, reason: string }} local
 * @param {{ preRemote: object | null, postRemote: object | null }} remote
 */
export function applyRemoteLegoVerdict(local, remote, stepType) {
  if (!local) {
    return local;
  }

  const preR = remote?.preRemote;
  const postR = remote?.postRemote;

  if (!preR && !postR) {
    return local;
  }

  if (postR?.verdict === "mismatch" || preR?.verdict === "mismatch") {
    const hint =
      postR?.hint ||
      preR?.hint ||
      "The external LEGO scan flagged a mismatch for this step.";
    return { result: "needs-adjustment", reason: hint };
  }

  if (
    local.result !== "ok" &&
    postR?.verdict === "ok" &&
    preR?.verdict !== "mismatch"
  ) {
    return {
      result: "ok",
      reason: `${local.reason} External scan marked this step as OK.`,
    };
  }

  const preN = preR?.brickCount;
  const postN = postR?.brickCount;
  if (
    typeof preN === "number" &&
    typeof postN === "number" &&
    local.result === "ok"
  ) {
    if (stepType === "place" && postN < preN) {
      return {
        result: "needs-adjustment",
        reason:
          postR?.hint ||
          "The detector counted fewer visible bricks after placement — try centering the new piece on the mat.",
      };
    }
    if (stepType === "pick" && postN > preN) {
      return {
        result: "needs-adjustment",
        reason:
          postR?.hint ||
          "The detector still sees more brick regions than before the pick — lift the mentioned piece clear of the pile.",
      };
    }
  }

  return local;
}

/**
 * Compare color-blob snapshots for step progress.
 * @param {string} [instructionText] — used for LEGO color words + clearer hints.
 */
export function verifyStep(
  preSnapshot,
  postSnapshot,
  stepType,
  instructionText = ""
) {
  const pre = preSnapshot || { pieces: [], total: 0 };
  const post = postSnapshot || { pieces: [], total: 0 };
  const preN = pre.total;
  const postN = post.total;
  const preDesc = colorSummary(pre.pieces);
  const postDesc = colorSummary(post.pieces);
  const snippet = stepSnippet(instructionText);
  const mentioned = extractMentionedLegoColors(instructionText);
  const mentionHint =
    mentioned.length > 0
      ? ` Your instruction mentions ${mentioned.join(", ")}.`
      : "";

  if (stepType === "pick") {
    if (wrongColorRemovedForPick(pre, post, mentioned)) {
      return {
        result: "needs-adjustment",
        reason: `For "${snippet}", a different color region shrank, not the ${mentioned.join(", ")} you need.${mentionHint} Pick the correct piece, then hold still.`,
      };
    }
    if (postN < preN) {
      return { result: "ok", reason: "Fewer separate LEGO-colored regions — pick looks good." };
    }
    const colorOk = mentionedColorOkPick(pre, post, mentioned);
    if (colorOk) {
      return { result: "ok", reason: "Mentioned color regions decreased as expected for a pick." };
    }
    return {
      result: "needs-adjustment",
      reason: `For "${snippet}", I expected a piece to leave the mat (fewer color blobs). Still about ${postN} regions vs ${preN} before.${mentionHint} Try removing the part from the camera view, then hold still.`,
    };
  }

  if (stepType === "place") {
    if (wrongColorAddedForPlace(pre, post, mentioned)) {
      return {
        result: "needs-adjustment",
        reason: `For "${snippet}", I saw a new blob, but not in ${mentioned.join(" or ")}.${mentionHint} Swap for the correct brick and pause on the mat.`,
      };
    }
    if (postN > preN) {
      return { result: "ok", reason: "New color region appeared — place looks good." };
    }
    const colorOk = mentionedColorOkPlace(pre, post, mentioned);
    if (colorOk) {
      return { result: "ok", reason: "A mentioned color gained a new region — place looks good." };
    }
    return {
      result: "needs-adjustment",
      reason: `For "${snippet}", I did not see a new LEGO-colored region. Before: ${preDesc}. After: ${postDesc}.${mentionHint} Add the brick into frame, then pause so the camera can confirm.`,
    };
  }

  if (stepType === "attach") {
    if (postN < preN) {
      return { result: "ok", reason: "Regions merged — attach likely succeeded." };
    }
    if (attachOverlapImproved(pre.pieces, post.pieces)) {
      return { result: "ok", reason: "Pieces overlap more after the motion — attach likely succeeded." };
    }
    if (largestRegionGrew(pre.pieces, post.pieces)) {
      return { result: "ok", reason: "Largest visible region grew — parts may be pressed together." };
    }
    return {
      result: "needs-adjustment",
      reason: `For "${snippet}", I did not see pieces join clearly. Count stayed near ${preN} → ${postN}.${mentionHint} Press parts together firmly, keep hands in frame, then hold still.`,
    };
  }

  if (postN !== preN) {
    return { result: "ok", reason: "Workspace color layout changed." };
  }
  return {
    result: "unclear",
    reason: `For "${snippet}", the workspace looked unchanged to the camera (${preN} color regions).${mentionHint} Make a clear move, then pause on the mat.`,
  };
}

function bboxOverlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) {
    return 0;
  }
  return (x2 - x1) * (y2 - y1);
}
