import { TRACKED_POINTS, TRAIL_LIMIT } from "../config/analysisConfig";

function getOverlayContext(overlayElement) {
  return overlayElement.getContext("2d");
}

function getCanvasPoint(overlayElement, landmark) {
  return {
    x: landmark.x * overlayElement.width,
    y: landmark.y * overlayElement.height,
  };
}

function updateHandTrail(handTrails, handIndex, point) {
  if (!handTrails[handIndex]) {
    handTrails[handIndex] = [];
  }

  const trail = handTrails[handIndex];
  trail.push(point);

  if (trail.length > TRAIL_LIMIT) {
    trail.splice(0, trail.length - TRAIL_LIMIT);
  }
}

function drawTrail(context, points, rgbColor) {
  if (points.length < 2) {
    return;
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const alpha = index / points.length;

    context.beginPath();
    context.strokeStyle = `rgba(${rgbColor}, ${(alpha * 0.72).toFixed(2)})`;
    context.lineWidth = 2 + alpha * 4;
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.restore();
}

function drawTrackingPoint(context, point, color, radius) {
  const pulse = 0.72 + Math.sin(Date.now() / 180) * 0.14;
  const outerR = radius * 1.55 * pulse;

  context.save();
  // Avoid canvas shadowBlur — on many GPUs it paints a large rectangular clip
  // that looks like a box around each joint. Use soft rings instead.
  context.fillStyle = color;
  context.globalAlpha = 0.12;
  context.beginPath();
  context.arc(point.x, point.y, outerR, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.22;
  context.beginPath();
  context.arc(point.x, point.y, radius * 1.12 * pulse, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.92;
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 247, 239, 0.95)";
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = color;
  context.globalAlpha = 0.95;
  context.beginPath();
  context.arc(point.x, point.y, radius * 0.58, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawMirroredText(context, text, x, y, color) {
  context.save();
  context.translate(x, y);
  context.scale(-1, 1);
  context.font = '600 14px "IBM Plex Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, 0, 0);
  context.restore();
}

function drawPinchLink(context, thumbPoint, indexPoint) {
  context.save();
  context.strokeStyle = "rgba(255, 209, 102, 0.78)";
  context.lineWidth = 2.5;
  context.setLineDash([8, 6]);
  context.beginPath();
  context.moveTo(thumbPoint.x, thumbPoint.y);
  context.lineTo(indexPoint.x, indexPoint.y);
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
  handedness,
  handTrails,
}) {
  if (!videoElement || !overlayElement) {
    return;
  }

  resizeOverlayCanvas(videoElement, overlayElement);
  const context = getOverlayContext(overlayElement);
  context.clearRect(0, 0, overlayElement.width, overlayElement.height);

  if (!landmarks.length) {
    handTrails.length = 0;
    return;
  }

  handTrails.length = landmarks.length;

  landmarks.forEach((handLandmarks, handIndex) => {
    const thumbPoint = getCanvasPoint(overlayElement, handLandmarks[4]);
    const indexPoint = getCanvasPoint(overlayElement, handLandmarks[8]);

    updateHandTrail(handTrails, handIndex, indexPoint);
    drawTrail(context, handTrails[handIndex] ?? [], "255, 209, 102");

    TRACKED_POINTS.forEach(({ index, label: pointLabel, color, radius }) => {
      const point = getCanvasPoint(overlayElement, handLandmarks[index]);
      drawTrackingPoint(context, point, color, radius);

      if (index === 0 || index === 8) {
        drawMirroredText(
          context,
          pointLabel,
          point.x,
          Math.max(18, point.y - 18),
          "#fff7ef"
        );
      }
    });

    drawPinchLink(context, thumbPoint, indexPoint);
  });
}
