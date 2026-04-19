function getOverlayContext(overlayElement) {
  return overlayElement.getContext("2d");
}

function getCanvasPoint(overlayElement, landmark) {
  return {
    x: landmark.x * overlayElement.width,
    y: landmark.y * overlayElement.height,
  };
}

/** Ignore tiny false-positive “hands” (background clutter). */
export function handConfidenceMetrics(landmarks) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const lm of landmarks) {
    minX = Math.min(minX, lm.x);
    minY = Math.min(minY, lm.y);
    maxX = Math.max(maxX, lm.x);
    maxY = Math.max(maxY, lm.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const area = width * height;
  return { width, height, area };
}

export function filterRealHands(landmarkSets) {
  const minArea = 0.022;
  const minSpan = 0.09;
  return landmarkSets.filter((lm) => {
    const { width, height, area } = handConfidenceMetrics(lm);
    return (
      area >= minArea &&
      width >= minSpan * 0.55 &&
      height >= minSpan * 0.55
    );
  });
}

function pickPrimaryHand(landmarkSets) {
  if (!landmarkSets.length) {
    return null;
  }
  let best = landmarkSets[0];
  let bestArea = handConfidenceMetrics(best).area;
  for (let i = 1; i < landmarkSets.length; i += 1) {
    const a = handConfidenceMetrics(landmarkSets[i]).area;
    if (a > bestArea) {
      bestArea = a;
      best = landmarkSets[i];
    }
  }
  return best;
}

/** Single soft fingertip cue — avoids rainbow clusters that read as noisy shapes on the feed. */
function drawPrimaryHandCue(context, overlayElement, handLandmarks) {
  const indexTip = getCanvasPoint(overlayElement, handLandmarks[8]);
  const wrist = getCanvasPoint(overlayElement, handLandmarks[0]);

  context.save();
  if (typeof context.imageSmoothingEnabled === "boolean") {
    context.imageSmoothingEnabled = true;
  }
  if (typeof context.imageSmoothingQuality === "string") {
    context.imageSmoothingQuality = "high";
  }

  const r = Math.max(5, overlayElement.width * 0.008);
  const grad = context.createRadialGradient(
    indexTip.x,
    indexTip.y,
    0,
    indexTip.x,
    indexTip.y,
    r * 2.4
  );
  grad.addColorStop(0, "rgba(255, 252, 248, 0.55)");
  grad.addColorStop(0.45, "rgba(186, 230, 253, 0.28)");
  grad.addColorStop(1, "rgba(186, 230, 253, 0)");

  context.fillStyle = grad;
  context.beginPath();
  context.arc(indexTip.x, indexTip.y, r * 2.4, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.42)";
  context.lineWidth = 1.25;
  context.globalAlpha = 1;
  context.beginPath();
  context.arc(indexTip.x, indexTip.y, r, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(wrist.x, wrist.y);
  context.lineTo(indexTip.x, indexTip.y);
  context.stroke();

  context.restore();
}

export function clearOverlay(overlayElement) {
  if (!overlayElement) {
    return;
  }

  const context = getOverlayContext(overlayElement);
  context.clearRect(0, 0, overlayElement.width, overlayElement.height);
}

export function resizeOverlayCanvas(videoElement, overlayElement) {
  if (!videoElement || !overlayElement) {
    return;
  }

  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (!width || !height) {
    return;
  }

  if (overlayElement.width !== width || overlayElement.height !== height) {
    overlayElement.width = width;
    overlayElement.height = height;
  }
}

export function renderHandOverlay({
  videoElement,
  overlayElement,
  landmarks,
  handedness: _handedness,
  handTrails,
}) {
  if (!videoElement || !overlayElement) {
    return;
  }

  resizeOverlayCanvas(videoElement, overlayElement);
  const context = getOverlayContext(overlayElement);
  if (typeof context.imageSmoothingEnabled === "boolean") {
    context.imageSmoothingEnabled = true;
  }
  if (typeof context.imageSmoothingQuality === "string") {
    context.imageSmoothingQuality = "high";
  }

  context.clearRect(0, 0, overlayElement.width, overlayElement.height);

  const credible = filterRealHands(landmarks);
  if (!credible.length) {
    handTrails.length = 0;
    return;
  }

  handTrails.length = credible.length;

  const primary = pickPrimaryHand(credible);
  if (primary) {
    drawPrimaryHandCue(context, overlayElement, primary);
  }
}
