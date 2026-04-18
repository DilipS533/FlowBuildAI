import {
  PALM_INDICES,
  TRACKED_POINTS,
  TRAIL_LIMIT,
} from "../config/analysisConfig";

function getOverlayContext(overlayElement) {
  return overlayElement.getContext("2d");
}

function getCanvasPoint(overlayElement, landmark) {
  return {
    x: landmark.x * overlayElement.width,
    y: landmark.y * overlayElement.height,
  };
}

function getPalmCenter(overlayElement, landmarks) {
  const total = PALM_INDICES.reduce(
    (accumulator, index) => {
      const point = getCanvasPoint(overlayElement, landmarks[index]);
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    { x: 0, y: 0 }
  );

  return {
    x: total.x / PALM_INDICES.length,
    y: total.y / PALM_INDICES.length,
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

  context.save();
  context.shadowBlur = 22;
  context.shadowColor = color;
  context.fillStyle = color;
  context.globalAlpha = 0.18;
  context.beginPath();
  context.arc(point.x, point.y, radius * 1.9 * pulse, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.92;
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 247, 239, 0.95)";
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = color;
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

function traceRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawHandBadge(context, label, anchor, color) {
  const badgeWidth = Math.max(92, label.length * 8 + 28);
  const badgeHeight = 28;
  const badgeX = anchor.x - badgeWidth / 2;
  const badgeY = Math.max(16, anchor.y - 52);

  context.save();
  context.fillStyle = "rgba(21, 33, 29, 0.68)";
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  traceRoundedRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 14);
  context.fill();
  context.stroke();
  context.restore();

  drawMirroredText(context, label, anchor.x, badgeY + badgeHeight / 2, "#fff7ef");
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

function drawTrackingGuide(context, overlayElement) {
  const width = overlayElement.width;
  const height = overlayElement.height;
  const guideWidth = width * 0.42;
  const guideHeight = height * 0.34;
  const guideX = (width - guideWidth) / 2;
  const guideY = (height - guideHeight) / 2;

  context.save();
  context.strokeStyle = "rgba(255, 247, 239, 0.18)";
  context.lineWidth = 1.5;
  context.setLineDash([10, 10]);
  context.strokeRect(guideX, guideY, guideWidth, guideHeight);
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
  drawTrackingGuide(context, overlayElement);

  if (!landmarks.length) {
    handTrails.length = 0;
    return;
  }

  handTrails.length = landmarks.length;

  landmarks.forEach((handLandmarks, handIndex) => {
    const label = handedness[handIndex]?.label ?? `Hand ${handIndex + 1}`;
    const palmCenter = getPalmCenter(overlayElement, handLandmarks);
    const thumbPoint = getCanvasPoint(overlayElement, handLandmarks[4]);
    const indexPoint = getCanvasPoint(overlayElement, handLandmarks[8]);

    updateHandTrail(handTrails, handIndex, indexPoint);
    drawTrail(context, handTrails[handIndex] ?? [], "255, 209, 102");

    if (window.drawConnectors && window.HAND_CONNECTIONS) {
      window.drawConnectors(context, handLandmarks, window.HAND_CONNECTIONS, {
        color: "rgba(234, 106, 42, 0.72)",
        lineWidth: 3,
      });
    }

    if (window.drawLandmarks) {
      window.drawLandmarks(context, handLandmarks, {
        color: "rgba(255, 247, 239, 0.7)",
        fillColor: "rgba(34, 121, 93, 0.55)",
        radius: 3,
        lineWidth: 1,
      });
    }

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
    drawTrackingPoint(context, palmCenter, "#ea6a2a", 12);
    drawHandBadge(context, `${label} tracked`, palmCenter, "#ea6a2a");
  });
}
