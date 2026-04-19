const MAX_STEPS = 40;

function preprocessInstructionText(rawText) {
  let t = rawText.replace(/\r/g, "").replace(/\u00a0/g, " ");
  t = t.replace(/[\u200b-\u200d\ufeff]/g, "");
  t = t.replace(/-\s*\n\s*/g, "");
  t = t.replace(/[ \t]+\n/g, "\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/** Manual step numbers only (1–3 digits), not LEGO part numbers like 3021. */
function lineStartsManualStepNumber(line) {
  const s = line.trim();
  return (
    /^(\d{1,3})[\.)]\s+\S/.test(s) ||
    /^(\d{1,3})\)\s+\S/.test(s) ||
    /^(\d{1,3})\s[-–—]\s+\S/.test(s) ||
    /^[-*•]\s+\S/.test(s)
  );
}

function stripManualStepPrefix(line) {
  let s = line.trim();
  s = s.replace(/^(\d{1,3})[\.)]\s+/, "");
  s = s.replace(/^(\d{1,3})\)\s+/, "");
  s = s.replace(/^(\d{1,3})\s[-–—]\s+/, "");
  s = s.replace(/^[-*•]\s+/, "");
  return s.trim();
}

function mergeLeadingStepNumbers(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const cur = lines[i];
    const next = lines[i + 1];

    if (next && /^\d{1,3}$/.test(cur)) {
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

function splitToLines(cleaned) {
  return cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (line.length < 2) {
        return false;
      }
      const letters = (line.match(/[a-zA-Z]/g) || []).length;
      if (letters === 0 && line.length < 40) {
        return false;
      }
      return true;
    });
}

function walkNumberedSteps(lines) {
  const steps = [];
  let current = "";

  lines.forEach((line) => {
    if (lineStartsManualStepNumber(line)) {
      if (current) {
        steps.push(current);
      }
      current = stripManualStepPrefix(line);
      return;
    }

    if (!current) {
      current = line;
      return;
    }

    if (/[.!?]$/.test(current)) {
      steps.push(current);
      current = line;
      return;
    }

    current = `${current} ${line}`.trim();
  });

  if (current) {
    steps.push(current);
  }

  return steps;
}

function paragraphSteps(cleaned) {
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 12);
}

function mergeUnnumberedPdfLines(lines) {
  const out = [];
  let buf = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (lineStartsManualStepNumber(trimmed)) {
      if (buf) {
        out.push(buf);
      }
      buf = stripManualStepPrefix(trimmed);
      continue;
    }

    if (!buf) {
      buf = trimmed;
      continue;
    }

    const endsHardStop = /[.!?;:]$/.test(buf);
    const stillShort = buf.length < 160;
    if (!endsHardStop && stillShort) {
      buf = `${buf} ${trimmed}`;
    } else {
      out.push(buf);
      buf = trimmed;
    }
  }

  if (buf) {
    out.push(buf);
  }

  return out;
}

function sentenceFallback(cleaned) {
  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-Za-z(0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isJunkStep(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8) {
    return true;
  }
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  if (letters < 4) {
    return true;
  }
  if (/^(?:\d+[.\s]*)+$/i.test(t)) {
    return true;
  }
  if (/^x\s*\d+$/i.test(t)) {
    return true;
  }
  return false;
}

function finalizeSteps(rawSteps) {
  return rawSteps
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((text) => !isJunkStep(text))
    .slice(0, MAX_STEPS)
    .map((text, index) => ({
      step: index + 1,
      text,
    }));
}

export function parseInstructions(rawText) {
  const cleaned = preprocessInstructionText(rawText);

  if (!cleaned) {
    return [];
  }

  let lines = splitToLines(cleaned);
  lines = mergeLeadingStepNumbers(lines);

  let numbered = walkNumberedSteps(lines);

  let rawSteps =
    numbered.length >= 2
      ? numbered
      : (() => {
          const paras = paragraphSteps(cleaned);
          if (paras.length >= 2) {
            return paras;
          }
          const merged = mergeUnnumberedPdfLines(lines);
          if (merged.length >= 2) {
            return merged;
          }
          const sentences = sentenceFallback(cleaned);
          if (sentences.length >= 2) {
            return sentences;
          }
          return merged.length ? merged : sentences.length ? sentences : [cleaned];
        })();

  const finalized = finalizeSteps(rawSteps);
  if (finalized.length) {
    return finalized;
  }

  const single = cleaned.replace(/\s+/g, " ").trim();
  if (single.length >= 6) {
    return [{ step: 1, text: single }];
  }

  return [];
}
