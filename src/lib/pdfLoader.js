let pdfModulePromise = null;

async function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import("pdfjs-dist");
  }

  const pdfModule = await pdfModulePromise;
  pdfModule.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  return pdfModule;
}

/**
 * Group PDF text items into reading-order lines (top → bottom, left → right).
 * LEGO / IKEA manuals often use two columns; split by median x when spread is wide.
 */
function clusterItemsToLines(items, yTolerance = 6) {
  const points = items
    .map((item) => ({
      str: (item.str || "").replace(/\s+/g, " ").trim(),
      x: item.transform[4],
      y: item.transform[5],
    }))
    .filter((p) => p.str.length > 0);

  if (!points.length) {
    return [];
  }

  points.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  let bucket = [];
  let refY = null;

  const flushBucket = () => {
    if (!bucket.length) {
      return;
    }
    bucket.sort((a, b) => a.x - b.x);
    const line = bucket
      .map((p) => p.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) {
      lines.push(line);
    }
    bucket = [];
    refY = null;
  };

  for (const p of points) {
    if (refY === null || Math.abs(p.y - refY) <= yTolerance) {
      bucket.push(p);
      refY =
        refY === null
          ? p.y
          : (refY * (bucket.length - 1) + p.y) / bucket.length;
    } else {
      flushBucket();
      bucket.push(p);
      refY = p.y;
    }
  }
  flushBucket();

  return lines;
}

function extractColumnAsText(items) {
  return clusterItemsToLines(items).join("\n");
}

function isNoiseLine(line) {
  const t = line.trim();
  if (t.length < 2) {
    return true;
  }

  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;

  if (letters === 0 && digits >= 3 && t.length <= 48) {
    return true;
  }

  if (letters < 2 && /^[\d\s.\-–—,:;•·°/]+$/.test(t)) {
    return true;
  }

  if (letters < 3 && t.length <= 6 && digits >= t.length - 1) {
    return true;
  }

  return false;
}

function mergeStepNumberLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const cur = lines[i];
    const next = lines[i + 1];

    if (next && /^\d{1,3}$/.test(cur) && !/^\d{1,3}$/.test(next)) {
      out.push(`${cur}. ${next}`);
      i += 1;
      continue;
    }

    if (next && /^\d{1,3}[.)]$/.test(cur)) {
      out.push(`${cur} ${next}`);
      i += 1;
      continue;
    }

    out.push(cur);
  }
  return out;
}

function cleanManualLines(rawLines) {
  const merged = mergeStepNumberLines(rawLines.map((l) => l.trim()).filter(Boolean));
  return merged.filter((line) => !isNoiseLine(line));
}

async function extractPageAsText(page) {
  const content = await page.getTextContent();
  const items = content.items.filter((item) => item.str && String(item.str).trim());

  if (!items.length) {
    return "";
  }

  const xs = items.map((item) => item.transform[4]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spread = maxX - minX;

  let lines;

  if (spread > 220) {
    const mid = (minX + maxX) / 2;
    const left = items.filter((item) => item.transform[4] < mid);
    const right = items.filter((item) => item.transform[4] >= mid);
    const leftText = extractColumnAsText(left);
    const rightText = extractColumnAsText(right);
    lines = cleanManualLines(
      [...leftText.split("\n"), ...rightText.split("\n")].filter(Boolean)
    );
  } else {
    lines = cleanManualLines(clusterItemsToLines(items));
  }

  return lines.join("\n");
}

export async function extractTextFromPdf(file) {
  const { getDocument } = await loadPdfModule();
  const arrayBuffer = await file.arrayBuffer();
  const documentProxy = await getDocument({ data: arrayBuffer }).promise;
  const pageChunks = [];

  for (let pageIndex = 1; pageIndex <= documentProxy.numPages; pageIndex += 1) {
    const page = await documentProxy.getPage(pageIndex);
    const pageText = await extractPageAsText(page);
    if (pageText.trim()) {
      pageChunks.push(pageText.trim());
    }
  }

  return pageChunks.join("\n\n");
}
