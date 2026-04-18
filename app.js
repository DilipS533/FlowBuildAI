const elements = {
  instructionInput: document.getElementById("instructionInput"),
  parseButton: document.getElementById("parseButton"),
  pdfUpload: document.getElementById("pdfUpload"),
  inputFeedback: document.getElementById("inputFeedback"),
  demoMode: document.getElementById("demoMode"),
  demoBadge: document.getElementById("demoBadge"),
  webcamVideo: document.getElementById("webcamVideo"),
  handOverlay: document.getElementById("handOverlay"),
  captureCanvas: document.getElementById("captureCanvas"),
  videoPlaceholder: document.getElementById("videoPlaceholder"),
  startCameraButton: document.getElementById("startCameraButton"),
  stopSessionButton: document.getElementById("stopSessionButton"),
  stepCounter: document.getElementById("stepCounter"),
  currentStepText: document.getElementById("currentStepText"),
  stepList: document.getElementById("stepList"),
  motionValue: document.getElementById("motionValue"),
  handValue: document.getElementById("handValue"),
  correctionValue: document.getElementById("correctionValue"),
  elapsedValue: document.getElementById("elapsedValue"),
  statusPill: document.getElementById("statusPill"),
  statusDetail: document.getElementById("statusDetail"),
  engineState: document.getElementById("engineState"),
  sessionState: document.getElementById("sessionState"),
  handState: document.getElementById("handState"),
  guidanceState: document.getElementById("guidanceState"),
  eventLog: document.getElementById("eventLog"),
  completionCard: document.getElementById("completionCard"),
  completionSummary: document.getElementById("completionSummary"),
};

const BASE_CONFIG = {
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

const DEMO_CONFIG = {
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

const state = {
  steps: [],
  completedSteps: new Set(),
  currentStepIndex: 0,
  corrections: 0,
  stream: null,
  sessionActive: false,
  sessionStartedAt: null,
  sessionCompletedAt: null,
  analysisIntervalId: null,
  elapsedIntervalId: null,
  handLoopId: null,
  handLoopBusy: false,
  handsTracker: null,
  previousFrame: null,
  motionScore: 0,
  motionActive: false,
  motionEpisode: null,
  lastMotionAt: 0,
  lastPromptAt: 0,
  lastCorrectionAt: 0,
  lastStepAnnouncementIndex: -1,
  handCount: 0,
  handLastSeenAt: 0,
  demoMode: false,
  logEntries: [],
  speechQueue: [],
  speaking: false,
  speechRestartTimer: null,
  lastSpeechText: "",
  lastSpeechAt: 0,
};

let captureContext = null;
let overlayContext = null;

function getConfig() {
  return state.demoMode ? DEMO_CONFIG : BASE_CONFIG;
}

function waitForGlobal(check, label, timeoutMs = 6000) {
  if (check()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      if (check()) {
        window.clearInterval(timerId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timerId);
        reject(new Error(`${label} is still loading.`));
      }
    }, 120);
  });
}

function setFeedback(message, isError = false) {
  elements.inputFeedback.textContent = message;
  elements.inputFeedback.style.color = isError ? "var(--warning)" : "var(--ink-soft)";
}

function setStatus(tone, label, detail) {
  elements.statusPill.textContent = label;
  elements.statusPill.className = `status-pill ${tone}`;
  elements.statusDetail.textContent = detail;
}

function setText(element, value) {
  element.textContent = value;
}

function addLog(message) {
  state.logEntries.unshift({
    message,
    time: new Date(),
  });

  state.logEntries = state.logEntries.slice(0, 8);
  renderLog();
}

function renderLog() {
  elements.eventLog.replaceChildren();

  if (!state.logEntries.length) {
    const empty = document.createElement("li");
    empty.textContent = "No events yet.";
    elements.eventLog.appendChild(empty);
    return;
  }

  state.logEntries.forEach((entry) => {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const message = document.createElement("span");

    time.textContent = entry.time.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    message.textContent = entry.message;

    item.append(time, message);
    elements.eventLog.appendChild(item);
  });
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateElapsed() {
  if (!state.sessionStartedAt) {
    setText(elements.elapsedValue, "00:00");
    return;
  }

  const endTime = state.sessionCompletedAt ?? Date.now();
  setText(elements.elapsedValue, formatElapsed(endTime - state.sessionStartedAt));
}

function showCompletion(summary) {
  setText(elements.completionSummary, summary);
  elements.completionCard.classList.remove("hidden");
}

function hideCompletion() {
  elements.completionCard.classList.add("hidden");
  setText(elements.completionSummary, "");
}

function renderSteps() {
  elements.stepList.replaceChildren();

  state.steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.textContent = step.text;

    if (state.completedSteps.has(step.step)) {
      item.classList.add("complete");
    } else if (index === state.currentStepIndex) {
      item.classList.add("active");
    }

    elements.stepList.appendChild(item);
  });
}

function updateCurrentStepUI() {
  const total = state.steps.length;

  if (!total) {
    setText(elements.stepCounter, "Step 0 / 0");
    setText(
      elements.currentStepText,
      "Upload instructions to generate the live step flow."
    );
    renderSteps();
    return;
  }

  const current = state.steps[state.currentStepIndex];

  if (!current) {
    setText(elements.stepCounter, `Step ${total} / ${total}`);
    setText(
      elements.currentStepText,
      "All parsed steps are complete. Load a new instruction set to restart."
    );
    renderSteps();
    return;
  }

  setText(elements.stepCounter, `Step ${current.step} / ${total}`);
  setText(elements.currentStepText, current.text);
  renderSteps();
}

function resetStepRuntime() {
  state.completedSteps = new Set();
  state.currentStepIndex = 0;
  state.corrections = 0;
  state.sessionStartedAt = null;
  state.sessionCompletedAt = null;
  state.sessionActive = false;
  state.previousFrame = null;
  state.motionScore = 0;
  state.motionActive = false;
  state.motionEpisode = null;
  state.lastMotionAt = 0;
  state.lastPromptAt = 0;
  state.lastCorrectionAt = 0;
  state.lastStepAnnouncementIndex = -1;
  state.speechQueue = [];
  state.speaking = false;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  setText(elements.correctionValue, "0");
  updateElapsed();
  hideCompletion();
  updateCurrentStepUI();
}

function parseInstructions(rawText) {
  const cleaned = rawText.replace(/\r/g, "").trim();

  if (!cleaned) {
    return [];
  }

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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
    } else if (/[.!?]$/.test(current)) {
      numberedOrBulleted.push(current);
      current = line;
    } else {
      current = `${current} ${line}`.trim();
    }
  });

  if (current) {
    numberedOrBulleted.push(current);
  }

  const fallback = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const rawSteps =
    numberedOrBulleted.length >= 2 ? numberedOrBulleted : fallback.length ? fallback : [cleaned];

  return rawSteps
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 25)
    .map((text, index) => ({
      step: index + 1,
      text,
    }));
}

async function extractTextFromPdf(file) {
  await waitForGlobal(() => window.pdfjsLib, "PDF parsing");

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const documentProxy = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageIndex = 1; pageIndex <= documentProxy.numPages; pageIndex += 1) {
    const page = await documentProxy.getPage(pageIndex);
    const content = await page.getTextContent();
    let pageText = "";
    let lastY = null;

    content.items.forEach((item) => {
      const nextY = item.transform[5];

      if (lastY !== null && Math.abs(nextY - lastY) > 3) {
        pageText += "\n";
      }

      pageText += `${item.str} `;
      lastY = nextY;
    });

    pages.push(pageText.trim());
  }

  return pages.join("\n");
}

function applyInstructions(rawText) {
  const steps = parseInstructions(rawText);
  state.steps = steps;
  resetStepRuntime();
  setText(elements.motionValue, "0.0%");
  setText(elements.handValue, "0");

  if (!steps.length) {
    setFeedback("No usable steps found. Paste text or upload a clearer PDF.", true);
    setStatus("warning", "Instruction issue", "No steps were parsed from the provided input.");
    setText(elements.sessionState, "Blocked");
    addLog("Instruction parsing failed.");
    return;
  }

  setFeedback(`Parsed ${steps.length} step${steps.length === 1 ? "" : "s"}.`);
  setStatus("idle", "Instructions loaded", "Start the camera or begin the next action.");
  setText(elements.sessionState, "Ready");
  addLog(`Loaded ${steps.length} instruction step${steps.length === 1 ? "" : "s"}.`);
  updateCurrentStepUI();
  maybeStartSession();
}

function speakSequence(messages, { interrupt = false } = {}) {
  if (!("speechSynthesis" in window)) {
    setText(elements.guidanceState, "Unavailable");
    return;
  }

  const items = messages.map((message) => message.trim()).filter(Boolean);
  if (!items.length) {
    return;
  }

  if (interrupt) {
    state.speechQueue = items;
    state.speaking = false;
    window.speechSynthesis.cancel();

    if (state.speechRestartTimer) {
      window.clearTimeout(state.speechRestartTimer);
    }

    state.speechRestartTimer = window.setTimeout(pumpSpeechQueue, 120);
    return;
  }

  state.speechQueue.push(...items);
  pumpSpeechQueue();
}

function pumpSpeechQueue() {
  if (!("speechSynthesis" in window) || state.speaking || !state.speechQueue.length) {
    return;
  }

  const nextMessage = state.speechQueue.shift();
  const now = Date.now();

  if (
    nextMessage === state.lastSpeechText &&
    now - state.lastSpeechAt < 3000
  ) {
    pumpSpeechQueue();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(nextMessage);
  utterance.lang = "en-US";
  utterance.rate = 1.02;
  utterance.pitch = 0.96;

  utterance.onstart = () => {
    state.speaking = true;
    state.lastSpeechText = nextMessage;
    state.lastSpeechAt = Date.now();
    setText(elements.guidanceState, "Speaking");
  };

  utterance.onend = () => {
    state.speaking = false;
    setText(elements.guidanceState, "Listening");
    pumpSpeechQueue();
  };

  utterance.onerror = () => {
    state.speaking = false;
    setText(elements.guidanceState, "Ready");
    pumpSpeechQueue();
  };

  window.speechSynthesis.speak(utterance);
}

function announceCurrentStep(force = false) {
  const currentStep = state.steps[state.currentStepIndex];

  if (!currentStep) {
    return;
  }

  if (!force && state.lastStepAnnouncementIndex === state.currentStepIndex) {
    return;
  }

  state.lastStepAnnouncementIndex = state.currentStepIndex;
  speakSequence([`Next step: ${currentStep.text}`], { interrupt: true });
  setStatus(
    "idle",
    "Waiting for action",
    `Watching for movement and hand activity on step ${currentStep.step}.`
  );
  setText(elements.sessionState, "Watching");
  addLog(`Tracking step ${currentStep.step}: ${currentStep.text}`);
}

function completeSession() {
  state.sessionActive = false;
  state.sessionCompletedAt = Date.now();
  updateElapsed();

  const duration = formatElapsed(state.sessionCompletedAt - state.sessionStartedAt);
  const summary = `Total time ${duration}. Corrections issued ${state.corrections}.`;

  showCompletion(summary);
  speakSequence(
    ["That step looks correct.", "All steps completed successfully."],
    { interrupt: true }
  );
  setStatus("success", "Step complete", "All instructions were completed.");
  setText(elements.sessionState, "Completed");
  setText(elements.guidanceState, "Completed");
  addLog("Session complete.");
}

function confirmStepCompletion(durationMs) {
  const completed = state.steps[state.currentStepIndex];

  if (!completed) {
    return;
  }

  state.completedSteps.add(completed.step);
  addLog(`Step ${completed.step} verified after ${formatElapsed(durationMs)} of motion.`);
  state.currentStepIndex += 1;
  updateCurrentStepUI();

  if (state.currentStepIndex >= state.steps.length) {
    completeSession();
    return;
  }

  speakSequence(
    ["That step looks correct.", `Next step: ${state.steps[state.currentStepIndex].text}`],
    { interrupt: true }
  );
  setStatus("success", "Step complete", "Advancing to the next instruction.");
  setText(elements.sessionState, "Advancing");
  state.lastStepAnnouncementIndex = state.currentStepIndex;
  addLog(`Advancing to step ${state.steps[state.currentStepIndex].step}.`);
}

function registerCorrection(detail) {
  const now = Date.now();
  const config = getConfig();

  if (now - state.lastCorrectionAt < config.correctionCooldownMs) {
    return;
  }

  state.lastCorrectionAt = now;
  state.corrections += 1;
  setText(elements.correctionValue, String(state.corrections));
  setStatus("warning", "Possible issue detected", detail);
  setText(elements.sessionState, "Needs adjustment");
  setText(elements.guidanceState, "Correcting");
  speakSequence(["That doesn't seem right, try adjusting it."], { interrupt: true });
  addLog(`Correction issued: ${detail}`);
}

function finalizeMotionEpisode(episode, handPresent) {
  const config = getConfig();
  const duration = episode.lastMotionAt - episode.startAt;
  const handConfirmed =
    state.demoMode ||
    episode.handSeen ||
    handPresent ||
    Date.now() - state.handLastSeenAt <= config.handRequiredWindowMs;
  const erratic = episode.erraticSamples >= 2 && episode.peakScore >= config.erraticMotionThreshold;

  if (duration < config.minMotionMs) {
    registerCorrection("The action ended too quickly to verify this step.");
    return;
  }

  if (!handConfirmed) {
    registerCorrection("I need to see hand interaction near the workspace before advancing.");
    return;
  }

  if (erratic) {
    registerCorrection("That motion looked too erratic. Try a steadier action.");
    return;
  }

  confirmStepCompletion(duration);
}

function evaluateMotion(score, handPresent) {
  if (!state.sessionActive || state.currentStepIndex >= state.steps.length) {
    return;
  }

  const config = getConfig();
  const now = Date.now();
  const threshold = state.motionActive
    ? config.motionSustainThreshold
    : config.motionStartThreshold;

  if (score >= threshold) {
    state.lastMotionAt = now;

    if (!state.motionActive) {
      state.motionActive = true;
      state.motionEpisode = {
        startAt: now,
        lastMotionAt: now,
        peakScore: score,
        erraticSamples: score >= config.erraticMotionThreshold ? 1 : 0,
        handSeen: handPresent,
      };

      setStatus("active", "Motion detected", "Tracking the current action.");
      setText(elements.sessionState, "Tracking motion");
      addLog("Motion detected on the current step.");
      return;
    }

    state.motionEpisode.lastMotionAt = now;
    state.motionEpisode.peakScore = Math.max(state.motionEpisode.peakScore, score);
    state.motionEpisode.erraticSamples += score >= config.erraticMotionThreshold ? 1 : 0;
    state.motionEpisode.handSeen ||= handPresent;
    return;
  }

  if (state.motionActive && state.motionEpisode) {
    const stableFor = now - state.motionEpisode.lastMotionAt;

    if (stableFor >= config.stabilizationMs) {
      const episode = state.motionEpisode;
      state.motionActive = false;
      state.motionEpisode = null;
      finalizeMotionEpisode(episode, handPresent);
      return;
    }

    setStatus("active", "Motion detected", "Waiting for the workspace to stabilize.");
    setText(elements.sessionState, "Stabilizing");
    return;
  }

  if (now - state.lastMotionAt > config.idlePromptMs && now - state.lastPromptAt > config.promptCooldownMs) {
    state.lastPromptAt = now;
    setStatus("idle", "Waiting for action", "No meaningful motion detected yet.");
    setText(elements.sessionState, "Waiting");
    speakSequence(["I'm waiting for the next action."], { interrupt: true });
    addLog("Idle prompt issued.");
  }
}

function sampleFrame() {
  if (!state.stream || elements.webcamVideo.readyState < 2) {
    return null;
  }

  const config = getConfig();

  if (!captureContext) {
    captureContext = elements.captureCanvas.getContext("2d", {
      willReadFrequently: true,
    });
  }

  if (
    elements.captureCanvas.width !== config.captureWidth ||
    elements.captureCanvas.height !== config.captureHeight
  ) {
    elements.captureCanvas.width = config.captureWidth;
    elements.captureCanvas.height = config.captureHeight;
  }

  captureContext.drawImage(
    elements.webcamVideo,
    0,
    0,
    config.captureWidth,
    config.captureHeight
  );

  const frame = captureContext.getImageData(
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

function calculateMotionScore(currentFrame, previousFrame) {
  const config = getConfig();
  let changedPixels = 0;
  let sampleSize = 0;

  for (let i = 0; i < currentFrame.length; i += 2) {
    sampleSize += 1;

    if (Math.abs(currentFrame[i] - previousFrame[i]) > config.pixelDiffThreshold) {
      changedPixels += 1;
    }
  }

  return (changedPixels / sampleSize) * 100;
}

function runMotionAnalysis() {
  const sampledFrame = sampleFrame();

  if (!sampledFrame) {
    return;
  }

  let score = 0;

  if (state.previousFrame) {
    score = calculateMotionScore(sampledFrame, state.previousFrame);
  }

  state.previousFrame = sampledFrame;
  state.motionScore = score;
  setText(elements.motionValue, `${score.toFixed(1)}%`);

  const handPresent =
    state.handCount > 0 ||
    Date.now() - state.handLastSeenAt <= getConfig().handMemoryMs;

  if (state.handCount > 0) {
    setText(elements.handState, `${state.handCount} detected`);
  } else if (handPresent) {
    setText(elements.handState, "Recently seen");
  } else {
    setText(elements.handState, "Searching");
  }

  evaluateMotion(score, handPresent);
}

function startAnalysisLoop() {
  stopAnalysisLoop();
  runMotionAnalysis();
  state.analysisIntervalId = window.setInterval(runMotionAnalysis, getConfig().intervalMs);
}

function stopAnalysisLoop() {
  if (state.analysisIntervalId) {
    window.clearInterval(state.analysisIntervalId);
    state.analysisIntervalId = null;
  }
}

function startElapsedLoop() {
  if (state.elapsedIntervalId) {
    return;
  }

  state.elapsedIntervalId = window.setInterval(updateElapsed, 1000);
}

function stopElapsedLoop() {
  if (state.elapsedIntervalId) {
    window.clearInterval(state.elapsedIntervalId);
    state.elapsedIntervalId = null;
  }
}

function clearOverlay() {
  if (!overlayContext) {
    overlayContext = elements.handOverlay.getContext("2d");
  }

  overlayContext.clearRect(0, 0, elements.handOverlay.width, elements.handOverlay.height);
}

function resizeVisualCanvases() {
  const width = elements.webcamVideo.videoWidth;
  const height = elements.webcamVideo.videoHeight;

  if (!width || !height) {
    return;
  }

  if (elements.handOverlay.width !== width || elements.handOverlay.height !== height) {
    elements.handOverlay.width = width;
    elements.handOverlay.height = height;
  }
}

function handleHandResults(results) {
  resizeVisualCanvases();
  clearOverlay();

  const landmarks = results.multiHandLandmarks ?? [];
  state.handCount = landmarks.length;
  setText(elements.handValue, String(state.handCount));

  if (landmarks.length) {
    state.handLastSeenAt = Date.now();
  }

  if (!landmarks.length || !window.drawConnectors || !window.drawLandmarks || !window.HAND_CONNECTIONS) {
    return;
  }

  landmarks.forEach((handLandmarks) => {
    window.drawConnectors(overlayContext, handLandmarks, window.HAND_CONNECTIONS, {
      color: "#ea6a2a",
      lineWidth: 3,
    });

    window.drawLandmarks(overlayContext, handLandmarks, {
      color: "#fff7ef",
      fillColor: "#22795d",
      radius: 4,
      lineWidth: 1,
    });
  });
}

async function ensureHandsTracker() {
  if (state.handsTracker) {
    return;
  }

  await waitForGlobal(() => window.Hands, "Hand tracking");

  state.handsTracker = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  state.handsTracker.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: getConfig().handsMinDetectionConfidence,
    minTrackingConfidence: getConfig().handsMinTrackingConfidence,
  });

  state.handsTracker.onResults(handleHandResults);
}

async function runHandLoop() {
  if (!state.stream) {
    return;
  }

  state.handLoopId = window.requestAnimationFrame(runHandLoop);

  if (
    state.handLoopBusy ||
    !state.handsTracker ||
    elements.webcamVideo.readyState < 2
  ) {
    return;
  }

  state.handLoopBusy = true;

  try {
    await state.handsTracker.send({ image: elements.webcamVideo });
  } catch (error) {
    setText(elements.handState, "Unavailable");
  } finally {
    state.handLoopBusy = false;
  }
}

function stopHandLoop() {
  if (state.handLoopId) {
    window.cancelAnimationFrame(state.handLoopId);
    state.handLoopId = null;
  }
}

function maybeStartSession() {
  if (!state.stream || !state.steps.length) {
    return;
  }

  if (!state.sessionStartedAt) {
    state.sessionStartedAt = Date.now();
    startElapsedLoop();
  }

  state.sessionActive = true;
  state.lastMotionAt = Date.now();
  setText(elements.sessionState, "Live");
  setStatus("idle", "Waiting for action", "Watching the workspace for the next verified movement.");
  announceCurrentStep(true);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("warning", "Camera unavailable", "This browser does not support webcam access.");
    setText(elements.engineState, "Unsupported");
    addLog("Webcam API unavailable.");
    return;
  }

  if (state.stream) {
    maybeStartSession();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    state.stream = stream;
    elements.webcamVideo.srcObject = stream;
    await elements.webcamVideo.play();

    elements.webcamVideo.style.display = "block";
    elements.videoPlaceholder.classList.add("hidden");
    setText(elements.engineState, "Watching");
    addLog("Camera stream started.");

    try {
      await ensureHandsTracker();
    } catch (error) {
      setText(elements.handState, "Unavailable");
      addLog(error.message);
    }

    if (state.handsTracker) {
      state.handsTracker.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: getConfig().handsMinDetectionConfidence,
        minTrackingConfidence: getConfig().handsMinTrackingConfidence,
      });
    }

    startAnalysisLoop();
    stopHandLoop();
    state.handLoopBusy = false;
    runHandLoop();
    maybeStartSession();
  } catch (error) {
    setStatus("warning", "Camera blocked", "Allow webcam access to run realtime verification.");
    setText(elements.engineState, "Blocked");
    addLog(`Camera start failed: ${error.message}`);
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }

  state.stream = null;
  state.sessionActive = false;
  state.motionActive = false;
  state.motionEpisode = null;
  state.previousFrame = null;
  state.handCount = 0;
  state.handLastSeenAt = 0;
  state.lastStepAnnouncementIndex = -1;

  stopAnalysisLoop();
  stopHandLoop();
  stopElapsedLoop();
  clearOverlay();
  updateElapsed();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  elements.webcamVideo.srcObject = null;
  elements.webcamVideo.style.display = "none";
  elements.videoPlaceholder.classList.remove("hidden");

  setText(elements.motionValue, "0.0%");
  setText(elements.handValue, "0");
  setText(elements.handState, "Searching");
  setText(elements.engineState, "Idle");
  setText(elements.sessionState, state.steps.length ? "Ready" : "Not started");
  setText(elements.guidanceState, "Ready");
  setStatus("idle", "Waiting for setup", "Start the camera to resume live verification.");
  addLog("Camera stream stopped.");
}

function handleDemoModeChange() {
  state.demoMode = elements.demoMode.checked;
  elements.demoBadge.classList.toggle("hidden", !state.demoMode);

  if (state.handsTracker) {
    state.handsTracker.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: getConfig().handsMinDetectionConfidence,
      minTrackingConfidence: getConfig().handsMinTrackingConfidence,
    });
  }

  if (state.stream) {
    startAnalysisLoop();
  }

  addLog(`Demo Mode ${state.demoMode ? "enabled" : "disabled"}.`);
}

async function handlePdfUpload(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  setFeedback(`Reading ${file.name}...`);

  try {
    const text = await extractTextFromPdf(file);
    elements.instructionInput.value = text;
    applyInstructions(text);
  } catch (error) {
    setFeedback(`Unable to read the PDF: ${error.message}`, true);
    addLog(`PDF parse failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function initialize() {
  renderLog();
  updateCurrentStepUI();
  updateElapsed();
  setText(elements.guidanceState, "Ready");
  setText(elements.engineState, "Idle");

  elements.parseButton.addEventListener("click", () => {
    applyInstructions(elements.instructionInput.value);
  });

  elements.pdfUpload.addEventListener("change", handlePdfUpload);
  elements.startCameraButton.addEventListener("click", startCamera);
  elements.stopSessionButton.addEventListener("click", stopCamera);
  elements.demoMode.addEventListener("change", handleDemoModeChange);

  elements.webcamVideo.addEventListener("loadedmetadata", () => {
    resizeVisualCanvases();
  });

  window.addEventListener("resize", resizeVisualCanvases);
  window.addEventListener("beforeunload", stopCamera);

  if (!window.Hands) {
    setText(elements.handState, "Loading");
  }
}

initialize();
