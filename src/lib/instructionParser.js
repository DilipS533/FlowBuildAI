function preprocessInstructionText(rawText) {
  let t = rawText.replace(/\r/g, "").replace(/\u00a0/g, " ");
  t = t.replace(/[\u200b-\u200d\ufeff]/g, "");
  t = t.replace(/[ \t]+\n/g, "\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function parseInstructions(rawText) {
  const cleaned = preprocessInstructionText(rawText);

  if (!cleaned) {
    return [];
  }

  const lines = cleaned
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

  const numberedOrBulleted = [];
  let current = "";

  lines.forEach((line) => {
    const startsNewStep = /^(\d+[\).\s-]|[-*•]\s+)/.test(line);
    const normalized = line.replace(/^(\d+[\).\s-]|[-*•]\s+)/, "").trim();

    if (startsNewStep) {
      if (current) {
        numberedOrBulleted.push(current);
      }

      current = normalized;
      return;
    }

    if (!current) {
      current = line;
      return;
    }

    if (/[.!?]$/.test(current)) {
      numberedOrBulleted.push(current);
      current = line;
      return;
    }

    current = `${current} ${line}`.trim();
  });

  if (current) {
    numberedOrBulleted.push(current);
  }

  const fallback = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const rawSteps =
    numberedOrBulleted.length >= 2
      ? numberedOrBulleted
      : fallback.length
        ? fallback
        : [cleaned];

  return rawSteps
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 25)
    .map((text, index) => ({
      step: index + 1,
      text,
    }));
}
