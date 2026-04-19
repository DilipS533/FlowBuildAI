import { TRACKED_POINTS } from "../config/analysisConfig";

function getOverlayContext(overlayElement) {
  return overlayElement.getContext("2d");
}

function getCanvasPoint(overlayElement, landmark) {
  return {
    x: landmark.x * overlayElement.width,
    y: landmark.y * overlayElement.height,
  };
}

/** Small solid nodes only — no trails, pinch line, labels, or shadows (those read as “boxes” on some GPUs). */
function drawTrackingPoint(context, point, color, radius) {
  context.save();
  if (typeof context.imageSmoothingEnabled === "boolean") {
    context.imageSmoothingEnabled = true;
  }
  if (typeof context.imageSmoothingQuality === "string") {
    context.imageSmoothingQuality = "high";
  }

  const r = Math.max(3, radius * 0.72);
  context.fillStyle = color;
  context.globalAlpha = 0.94;
  context.beginPath();
  context.arc(point.x, point.y, r, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(255, 250, 242, 0.88)";
  context.lineWidth = 1.15;
  context.globalAlpha = 1;
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

  if (!landmarks.length) {
    handTrails.length = 0;
    return;
  }

  handTrails.length = landmarks.length;

  landmarks.forEach((handLandmarks) => {
    TRACKED_POINTS.forEach(({ index, color, radius }) => {
      const point = getCanvasPoint(overlayElement, handLandmarks[index]);
      drawTrackingPoint(context, point, color, radius);
    });
  });
}
