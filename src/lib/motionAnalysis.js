export function sampleFrame(videoElement, canvasElement, contextRef, config) {
  if (!videoElement || !canvasElement || videoElement.readyState < 2) {
    return null;
  }

  if (!contextRef.current) {
    contextRef.current = canvasElement.getContext("2d", {
      willReadFrequently: true,
    });
  }

  if (
    canvasElement.width !== config.captureWidth ||
    canvasElement.height !== config.captureHeight
  ) {
    canvasElement.width = config.captureWidth;
    canvasElement.height = config.captureHeight;
  }

  contextRef.current.drawImage(
    videoElement,
    0,
    0,
    config.captureWidth,
    config.captureHeight
  );

  const frame = contextRef.current.getImageData(
    0,
    0,
    config.captureWidth,
    config.captureHeight
  );
  const grayscale = new Uint8Array(config.captureWidth * config.captureHeight);

  for (let i = 0, j = 0; i < frame.data.length; i += 4, j += 1) {
    grayscale[j] =
      frame.data[i] * 0.299 +
      frame.data[i + 1] * 0.587 +
      frame.data[i + 2] * 0.114;
  }

  return grayscale;
}

export function calculateMotionScore(currentFrame, previousFrame, config) {
  let changedPixels = 0;
  let sampleSize = 0;

  for (let index = 0; index < currentFrame.length; index += 2) {
    sampleSize += 1;

    if (
      Math.abs(currentFrame[index] - previousFrame[index]) >
      config.pixelDiffThreshold
    ) {
      changedPixels += 1;
    }
  }

  return (changedPixels / sampleSize) * 100;
}
