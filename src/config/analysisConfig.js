export const BASE_CONFIG = {
  intervalMs: 700,
  captureWidth: 192,
  captureHeight: 144,
  pixelDiffThreshold: 26,
  motionStartThreshold: 4.2,
  motionSustainThreshold: 2.4,
  stabilizationMs: 1500,
  minMotionMs: 1100,
  idlePromptMs: 12000,
  correctionCooldownMs: 6500,
  promptCooldownMs: 9000,
  handMemoryMs: 2200,
  handRequiredWindowMs: 2600,
  erraticMotionThreshold: 18,
  handsMinDetectionConfidence: 0.62,
  handsMinTrackingConfidence: 0.55,
};

export const DEMO_CONFIG = {
  intervalMs: 550,
  captureWidth: 192,
  captureHeight: 144,
  pixelDiffThreshold: 18,
  motionStartThreshold: 1.8,
  motionSustainThreshold: 1.1,
  stabilizationMs: 900,
  minMotionMs: 650,
  idlePromptMs: 8500,
  correctionCooldownMs: 5200,
  promptCooldownMs: 7000,
  handMemoryMs: 3200,
  handRequiredWindowMs: 4200,
  erraticMotionThreshold: 14,
  handsMinDetectionConfidence: 0.48,
  handsMinTrackingConfidence: 0.4,
};

export const PALM_INDICES = [0, 5, 9, 13, 17];
export const TRACKED_POINTS = [
  { index: 0, label: "Wrist", color: "#7dd3fc", radius: 8 },
  { index: 4, label: "Thumb", color: "#ff9f67", radius: 7 },
  { index: 8, label: "Index", color: "#ffd166", radius: 10 },
  { index: 12, label: "Middle", color: "#8ce99a", radius: 8 },
  { index: 16, label: "Ring", color: "#c792ea", radius: 7 },
  { index: 20, label: "Pinky", color: "#5eead4", radius: 7 },
];
export const TRAIL_LIMIT = 14;

export function getAnalysisConfig(demoMode) {
  return demoMode ? DEMO_CONFIG : BASE_CONFIG;
}
