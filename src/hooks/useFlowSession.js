import { useEffect, useRef, useState } from "react";

import { getAnalysisConfig } from "../config/analysisConfig";
import { renderHandOverlay, clearOverlay } from "../lib/handOverlay";
import { parseInstructions } from "../lib/instructionParser";
import {
  calculateMotionScore,
  sampleFrame,
} from "../lib/motionAnalysis";
import { extractTextFromPdf } from "../lib/pdfLoader";
import { snapshotPieces, verifyStep } from "../lib/stepVerifier";
import { formatElapsed } from "../lib/time";
import { useSpeechGuide } from "./useSpeechGuide";

function createInitialUiState() {
  return {
    instructionText: "",
    demoMode: false,
    steps: [],
    currentStepIndex: 0,
    completedSteps: [],
    correctionCount: 0,
    inputFeedback: {
      message:
        "FlowStep AI accepts numbered lists, bullets, or plain sentences.",
      error: false,
    },
    motionValue: "0.0%",
    handCount: 0,
    elapsedValue: "00:00",
    status: {
      tone: "idle",
      label: "Waiting for setup",
      detail: "Load instructions and start the camera to begin the live flow.",
    },
    engineState: "Idle",
    sessionState: "Not started",
    handState: "Searching",
    guidanceState: "Ready",
    eventLog: [],
    completionSummary: "",
    showCompletion: false,
    cameraActive: false,
  };
}

function createRuntimeState() {
  return {
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
    motionActive: false,
    motionEpisode: null,
    lastMotionAt: 0,
    lastPromptAt: 0,
    lastCorrectionAt: 0,
    lastStepAnnouncementIndex: -1,
    handCount: 0,
    handLastSeenAt: 0,
    handTrails: [],
    steps: [],
    completedSteps: new Set(),
    currentStepIndex: 0,
    corrections: 0,
  };
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

export function useFlowSession() {
  const [ui, setUi] = useState(createInitialUiState);

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const captureContextRef = useRef(null);
  const runtimeRef = useRef(createRuntimeState());

  function patchUi(nextPatch) {
    setUi((current) => ({ ...current, ...nextPatch }));
  }

  function addLog(message) {
    setUi((current) => ({
      ...current,
      eventLog: [{ message, time: new Date() }, ...current.eventLog].slice(0, 8),
    }));
  }

  function setStatus(tone, label, detail) {
    patchUi({
      status: {
        tone,
        label,
        detail,
      },
    });
  }

  function setGuidanceState(value) {
    patchUi({
      guidanceState: value,
    });
  }

  const { cancelSpeech, speakSequence } = useSpeechGuide(setGuidanceState);

  function updateElapsedValue() {
    const runtime = runtimeRef.current;

    if (!runtime.sessionStartedAt) {
      patchUi({ elapsedValue: "00:00" });
      return;
    }

    const endTime = runtime.sessionCompletedAt ?? Date.now();
    patchUi({
      elapsedValue: formatElapsed(endTime - runtime.sessionStartedAt),
    });
  }

  function syncProgressUi() {
    const runtime = runtimeRef.current;

    patchUi({
      steps: [...runtime.steps],
      currentStepIndex: runtime.currentStepIndex,
      completedSteps: Array.from(runtime.completedSteps),
      correctionCount: runtime.corrections,
    });
  }

  function resetStepRuntime() {
    const runtime = runtimeRef.current;

    runtime.completedSteps = new Set();
    runtime.currentStepIndex = 0;
    runtime.corrections = 0;
    runtime.sessionActive = false;
    runtime.sessionStartedAt = null;
    runtime.sessionCompletedAt = null;
    runtime.previousFrame = null;
    runtime.motionActive = false;
    runtime.motionEpisode = null;
    runtime.lastMotionAt = 0;
    runtime.lastPromptAt = 0;
    runtime.lastCorrectionAt = 0;
    runtime.lastStepAnnouncementIndex = -1;
    runtime.handTrails = [];
    runtime.handCount = 0;
    runtime.handLastSeenAt = 0;

    cancelSpeech();
    clearOverlay(overlayRef.current);

    patchUi({
      motionValue: "0.0%",
      handCount: 0,
      correctionCount: 0,
      elapsedValue: "00:00",
      handState: "Searching",
      guidanceState: "Ready",
      completionSummary: "",
      showCompletion: false,
    });

    syncProgressUi();
  }

  function announceCurrentStep(force = false) {
    const runtime = runtimeRef.current;
    const currentStep = runtime.steps[runtime.currentStepIndex];

    if (!currentStep) {
      return;
    }

    if (
      !force &&
      runtime.lastStepAnnouncementIndex === runtime.currentStepIndex
    ) {
      return;
    }

    runtime.lastStepAnnouncementIndex = runtime.currentStepIndex;
    speakSequence([`Next step: ${currentStep.text}`], { interrupt: true });
    setStatus(
      "idle",
      "Waiting for action",
      `Watching for movement and hand activity on step ${currentStep.step}.`
    );
    patchUi({
      sessionState: "Watching",
    });
    addLog(`Tracking step ${currentStep.step}: ${currentStep.text}`);
  }

  function completeSession() {
    const runtime = runtimeRef.current;
    runtime.sessionActive = false;
    runtime.sessionCompletedAt = Date.now();
    updateElapsedValue();

    const summary = `Total time ${formatElapsed(
      runtime.sessionCompletedAt - runtime.sessionStartedAt
    )}. Corrections issued ${runtime.corrections}.`;

    patchUi({
      sessionState: "Completed",
      guidanceState: "Completed",
      completionSummary: summary,
      showCompletion: true,
    });

    setStatus(
      "success",
      "Step complete",
      "All instructions were completed."
    );
    speakSequence(
      ["That step looks correct.", "All steps completed successfully."],
      { interrupt: true }
    );
    addLog("Session complete.");
  }

  function confirmStepCompletion(durationMs) {
    const runtime = runtimeRef.current;
    const completedStep = runtime.steps[runtime.currentStepIndex];

    if (!completedStep) {
      return;
    }

    runtime.completedSteps.add(completedStep.step);
    runtime.currentStepIndex += 1;
    syncProgressUi();

    addLog(
      `Step ${completedStep.step} verified after ${formatElapsed(durationMs)} of motion.`
    );

    if (runtime.currentStepIndex >= runtime.steps.length) {
      completeSession();
      return;
    }

    setStatus(
      "success",
      "Step complete",
      "Advancing to the next instruction."
    );
    patchUi({
      sessionState: "Advancing",
    });
    runtime.lastStepAnnouncementIndex = runtime.currentStepIndex;
    addLog(`Advancing to step ${runtime.steps[runtime.currentStepIndex].step}.`);
    speakSequence(
      [
        "That step looks correct.",
        `Next step: ${runtime.steps[runtime.currentStepIndex].text}`,
      ],
      { interrupt: true }
    );
  }

  function registerCorrection(detail) {
    const runtime = runtimeRef.current;
    const config = getAnalysisConfig(ui.demoMode);
    const now = Date.now();

    if (now - runtime.lastCorrectionAt < config.correctionCooldownMs) {
      return;
    }

    runtime.lastCorrectionAt = now;
    runtime.corrections += 1;
    syncProgressUi();

    setStatus("warning", "Possible issue detected", detail);
    patchUi({
      sessionState: "Needs adjustment",
      guidanceState: "Correcting",
    });
    speakSequence(
      [
        "That does not look right for this step.",
        detail.length > 220 ? `${detail.slice(0, 217).trim()}…` : detail,
      ],
      { interrupt: true }
    );
    addLog(`Correction issued: ${detail}`);
  }

  function finalizeMotionEpisode(episode, handPresent) {
    const runtime = runtimeRef.current;
    const config = getAnalysisConfig(ui.demoMode);
    const duration = episode.lastMotionAt - episode.startAt;
    const handConfirmed =
      ui.demoMode ||
      episode.handSeen ||
      handPresent ||
      Date.now() - runtime.handLastSeenAt <= config.handRequiredWindowMs;
    const erratic =
      episode.erraticSamples >= 2 &&
      episode.peakScore >= config.erraticMotionThreshold;

    if (duration < config.minMotionMs) {
      registerCorrection("The action ended too quickly to verify this step.");
      return;
    }

    if (!handConfirmed) {
      registerCorrection(
        "I need to see hand interaction near the workspace before advancing."
      );
      return;
    }

    if (erratic) {
      registerCorrection("That motion looked too erratic. Try a steadier action.");
      return;
    }

    confirmStepCompletion(duration);
  }

  function evaluateMotion(score, handPresent) {
    const runtime = runtimeRef.current;

    if (
      !runtime.sessionActive ||
      runtime.currentStepIndex >= runtime.steps.length
    ) {
      return;
    }

    const config = getAnalysisConfig(ui.demoMode);
    const now = Date.now();
    const threshold = runtime.motionActive
      ? config.motionSustainThreshold
      : config.motionStartThreshold;

    if (score >= threshold) {
      runtime.lastMotionAt = now;

      if (!runtime.motionActive) {
        runtime.motionActive = true;
        // capture a pre-action snapshot of pieces for later verification
        const preSnapshot = snapshotPieces(captureCanvasRef.current, captureContextRef.current, config);
        runtime.motionEpisode = {
          startAt: now,
          lastMotionAt: now,
          peakScore: score,
          erraticSamples: score >= config.erraticMotionThreshold ? 1 : 0,
          handSeen: handPresent,
          prePieces: preSnapshot,
        };

        setStatus("active", "Motion detected", "Tracking the current action.");
        patchUi({
          sessionState: "Tracking motion",
        });
        addLog("Motion detected on the current step.");
        return;
      }

      runtime.motionEpisode.lastMotionAt = now;
      runtime.motionEpisode.peakScore = Math.max(
        runtime.motionEpisode.peakScore,
        score
      );
      runtime.motionEpisode.erraticSamples +=
        score >= config.erraticMotionThreshold ? 1 : 0;
      runtime.motionEpisode.handSeen ||= handPresent;
      return;
    }

    if (runtime.motionActive && runtime.motionEpisode) {
      const stableFor = now - runtime.motionEpisode.lastMotionAt;

      if (stableFor >= config.stabilizationMs) {
        const episode = runtime.motionEpisode;
        runtime.motionActive = false;
        runtime.motionEpisode = null;
        // take a post-action snapshot and verify the step
        try {
          const postSnapshot = snapshotPieces(captureCanvasRef.current, captureContextRef.current, config);
          // best-effort infer step type from current instruction text
          const stepText = runtime.steps?.[runtime.currentStepIndex]?.text ?? '';
          const lc = stepText.toLowerCase();
          let inferred = "place";
          if (
            lc.includes("pick") ||
            lc.includes("take") ||
            lc.includes("remove") ||
            lc.includes("lift off") ||
            lc.includes("take off")
          ) {
            inferred = "pick";
          } else if (
            lc.includes("attach") ||
            lc.includes("connect") ||
            lc.includes("snap") ||
            lc.includes("clip") ||
            lc.includes("join") ||
            lc.includes("combine")
          ) {
            inferred = "attach";
          } else if (
            lc.includes("place") ||
            lc.includes("put") ||
            lc.includes("insert") ||
            lc.includes("add") ||
            lc.includes("build") ||
            lc.includes("repeat") ||
            lc.includes("stack") ||
            lc.includes("fit") ||
            lc.includes("press") ||
            lc.includes("align")
          ) {
            inferred = "place";
          }

          const verdict = verifyStep(
            episode.prePieces,
            postSnapshot,
            inferred,
            stepText
          );
          if (verdict.result === "ok") {
            finalizeMotionEpisode(episode, handPresent);
          } else if (verdict.result === "needs-adjustment") {
            registerCorrection(verdict.reason);
          } else {
            const sawPieces =
              (episode.prePieces?.total || 0) + (postSnapshot?.total || 0) > 0;
            if (sawPieces) {
              registerCorrection(verdict.reason);
            } else {
              finalizeMotionEpisode(episode, handPresent);
            }
          }
        } catch (e) {
          // if verification fails unexpectedly, proceed with previous logic
          finalizeMotionEpisode(episode, handPresent);
        }
        return;
      }

      setStatus(
        "active",
        "Motion detected",
        "Waiting for the workspace to stabilize."
      );
      patchUi({
        sessionState: "Stabilizing",
      });
      return;
    }

    if (
      now - runtime.lastMotionAt > config.idlePromptMs &&
      now - runtime.lastPromptAt > config.promptCooldownMs
    ) {
      runtime.lastPromptAt = now;
      setStatus(
        "idle",
        "Waiting for action",
        "No meaningful motion detected yet."
      );
      patchUi({
        sessionState: "Waiting",
      });
      speakSequence(["I'm waiting for the next action."], { interrupt: true });
      addLog("Idle prompt issued.");
    }
  }

  function runMotionAnalysis() {
    const runtime = runtimeRef.current;
    const videoElement = videoRef.current;
    const canvasElement = captureCanvasRef.current;
    const config = getAnalysisConfig(ui.demoMode);
    const sampledFrame = sampleFrame(
      videoElement,
      canvasElement,
      captureContextRef,
      config
    );

    if (!sampledFrame) {
      return;
    }

    let score = 0;

    if (runtime.previousFrame) {
      score = calculateMotionScore(sampledFrame, runtime.previousFrame, config);
    }

    runtime.previousFrame = sampledFrame;
    patchUi({
      motionValue: `${score.toFixed(1)}%`,
    });

    const handPresent =
      runtime.handCount > 0 ||
      Date.now() - runtime.handLastSeenAt <= config.handMemoryMs;

    if (runtime.handCount > 0) {
      patchUi({
        handState: `${runtime.handCount} detected`,
      });
    } else if (handPresent) {
      patchUi({
        handState: "Recently seen",
      });
    } else {
      patchUi({
        handState: "Searching",
      });
    }

    evaluateMotion(score, handPresent);
  }

  function stopAnalysisLoop() {
    const runtime = runtimeRef.current;

    if (runtime.analysisIntervalId) {
      window.clearInterval(runtime.analysisIntervalId);
      runtime.analysisIntervalId = null;
    }
  }

  function startAnalysisLoop() {
    const runtime = runtimeRef.current;

    stopAnalysisLoop();
    runMotionAnalysis();
    runtime.analysisIntervalId = window.setInterval(
      runMotionAnalysis,
      getAnalysisConfig(ui.demoMode).intervalMs
    );
  }

  function stopElapsedLoop() {
    const runtime = runtimeRef.current;

    if (runtime.elapsedIntervalId) {
      window.clearInterval(runtime.elapsedIntervalId);
      runtime.elapsedIntervalId = null;
    }
  }

  function startElapsedLoop() {
    const runtime = runtimeRef.current;

    if (runtime.elapsedIntervalId) {
      return;
    }

    runtime.elapsedIntervalId = window.setInterval(updateElapsedValue, 1000);
  }

  async function ensureHandsTracker() {
    const runtime = runtimeRef.current;

    if (runtime.handsTracker) {
      return runtime.handsTracker;
    }

    await waitForGlobal(() => window.Hands, "Hand tracking");
    // Optional: drawing_utils adds connector/landmark helpers used by handOverlay.
    await waitForGlobal(
      () => typeof window.drawConnectors === "function",
      "MediaPipe drawing",
      5000
    ).catch(() => {});

    const handsTracker = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    handsTracker.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: getAnalysisConfig(ui.demoMode).handsMinDetectionConfidence,
      minTrackingConfidence: getAnalysisConfig(ui.demoMode).handsMinTrackingConfidence,
    });

    handsTracker.onResults((results) => {
      const landmarks = results.multiHandLandmarks ?? [];
      const handedness = results.multiHandedness ?? [];

      runtime.handCount = landmarks.length;

      if (landmarks.length) {
        runtime.handLastSeenAt = Date.now();
      }

      renderHandOverlay({
        videoElement: videoRef.current,
        overlayElement: overlayRef.current,
        landmarks,
        handedness,
        handTrails: runtime.handTrails,
      });

      // After drawing the hands, run a quick piece-detection pass on the
      // captured (downsampled) frame and draw bounding boxes for detected
      // LEGO piece candidates. This is a lightweight heuristic that groups
      // similarly-colored regions on the small capture canvas.
      patchUi({
        handCount: landmarks.length,
      });
    });

    runtime.handsTracker = handsTracker;
    return handsTracker;
  }

  async function runHandLoop() {
    const runtime = runtimeRef.current;

    if (!runtime.stream) {
      return;
    }

    runtime.handLoopId = window.requestAnimationFrame(runHandLoop);

    if (
      runtime.handLoopBusy ||
      !runtime.handsTracker ||
      !videoRef.current ||
      videoRef.current.readyState < 2
    ) {
      return;
    }

    runtime.handLoopBusy = true;

    try {
      await runtime.handsTracker.send({ image: videoRef.current });
    } catch (error) {
      patchUi({
        handState: "Unavailable",
      });
    } finally {
      runtime.handLoopBusy = false;
    }
  }

  function stopHandLoop() {
    const runtime = runtimeRef.current;

    if (runtime.handLoopId) {
      window.cancelAnimationFrame(runtime.handLoopId);
      runtime.handLoopId = null;
    }
  }

  function maybeStartSession() {
    const runtime = runtimeRef.current;

    if (!runtime.stream || !runtime.steps.length) {
      return;
    }

    if (!runtime.sessionStartedAt) {
      runtime.sessionStartedAt = Date.now();
      startElapsedLoop();
    }

    runtime.sessionActive = true;
    runtime.lastMotionAt = Date.now();

    setStatus(
      "idle",
      "Waiting for action",
      "Watching the workspace for the next verified movement."
    );
    patchUi({
      sessionState: "Live",
    });
    announceCurrentStep(true);
  }

  function applyInstructions(rawText) {
    const runtime = runtimeRef.current;
    const steps = parseInstructions(rawText);

    runtime.steps = steps;
    resetStepRuntime();

    if (!steps.length) {
      patchUi({
        inputFeedback: {
          message: "No usable steps found. Paste text or upload a clearer PDF.",
          error: true,
        },
        sessionState: "Blocked",
      });
      setStatus(
        "warning",
        "Instruction issue",
        "No steps were parsed from the provided input."
      );
      addLog("Instruction parsing failed.");
      return;
    }

    patchUi({
      inputFeedback: {
        message: `Parsed ${steps.length} step${steps.length === 1 ? "" : "s"}.`,
        error: false,
      },
      sessionState: "Ready",
    });
    setStatus(
      "idle",
      "Instructions loaded",
      "Start the camera or begin the next action."
    );
    syncProgressUi();
    addLog(`Loaded ${steps.length} instruction step${steps.length === 1 ? "" : "s"}.`);
    maybeStartSession();
    // After maybeStartSession so guide speech replaces the single "next step" cue when the camera is already live.
    announceLoadedGuide(steps);
  }

  /** Read parsed steps aloud so the user hears the same flow as on screen. */
  function announceLoadedGuide(steps) {
    const maxSpoken = 8;
    const lines = [
      `Loaded ${steps.length} assembly step${steps.length === 1 ? "" : "s"} from your instructions.`,
    ];

    for (let i = 0; i < Math.min(maxSpoken, steps.length); i += 1) {
      const raw = steps[i].text || "";
      const shortened =
        raw.length > 140 ? `${raw.slice(0, 137).trim()}…` : raw;
      lines.push(`Step ${steps[i].step}: ${shortened}`);
    }

    if (steps.length > maxSpoken) {
      lines.push(
        `Steps ${maxSpoken + 1} through ${steps.length} are listed in the left panel.`
      );
    }

    speakSequence(lines, { interrupt: true });
  }

  async function handlePdfUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    patchUi({
      inputFeedback: {
        message: `Reading ${file.name}...`,
        error: false,
      },
    });

    try {
      const text = await extractTextFromPdf(file);

      patchUi({
        instructionText: text,
      });
      applyInstructions(text);
    } catch (error) {
      patchUi({
        inputFeedback: {
          message: `Unable to read the PDF: ${error.message}`,
          error: true,
        },
      });
      addLog(`PDF parse failed: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  async function startCamera() {
    const runtime = runtimeRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(
        "warning",
        "Camera unavailable",
        "This browser does not support webcam access."
      );
      patchUi({
        engineState: "Unsupported",
      });
      addLog("Webcam API unavailable.");
      return;
    }

    if (runtime.stream) {
      maybeStartSession();
      return;
    }

    try {
      runtime.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = runtime.stream;
        await videoRef.current.play();
      }

      patchUi({
        cameraActive: true,
        engineState: "Watching",
      });
      addLog("Camera stream started.");

      try {
        const handsTracker = await ensureHandsTracker();
        handsTracker.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: getAnalysisConfig(ui.demoMode).handsMinDetectionConfidence,
          minTrackingConfidence: getAnalysisConfig(ui.demoMode).handsMinTrackingConfidence,
        });
      } catch (error) {
        patchUi({
          handState: "Unavailable",
        });
        addLog(error.message);
      }

      startAnalysisLoop();
      stopHandLoop();
      runtime.handLoopBusy = false;
      runHandLoop();
      maybeStartSession();
    } catch (error) {
      setStatus(
        "warning",
        "Camera blocked",
        "Allow webcam access to run realtime verification."
      );
      patchUi({
        engineState: "Blocked",
      });
      addLog(`Camera start failed: ${error.message}`);
    }
  }

  function stopCamera() {
    const runtime = runtimeRef.current;

    if (runtime.stream) {
      runtime.stream.getTracks().forEach((track) => track.stop());
    }

    runtime.stream = null;
    runtime.sessionActive = false;
    runtime.motionActive = false;
    runtime.motionEpisode = null;
    runtime.previousFrame = null;
    runtime.handCount = 0;
    runtime.handLastSeenAt = 0;
    runtime.handTrails = [];
    runtime.lastStepAnnouncementIndex = -1;

    stopAnalysisLoop();
    stopHandLoop();
    stopElapsedLoop();
    clearOverlay(overlayRef.current);
    updateElapsedValue();
    cancelSpeech();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    patchUi({
      cameraActive: false,
      motionValue: "0.0%",
      handCount: 0,
      handState: "Searching",
      engineState: "Idle",
      sessionState: runtime.steps.length ? "Ready" : "Not started",
      guidanceState: "Ready",
    });

    setStatus(
      "idle",
      "Waiting for setup",
      "Start the camera to resume live verification."
    );
    addLog("Camera stream stopped.");
  }

  function handleInstructionTextChange(event) {
    patchUi({
      instructionText: event.target.value,
    });
  }

  /** LEGO/IKEA search fills the textarea; optional manual metadata is ignored here. */
  function handleManualSearchResult(instructionText) {
    patchUi({
      instructionText,
    });
    addLog("Manual search results copied into the instruction field.");
  }

  function handleParseInstructions() {
    applyInstructions(ui.instructionText);
  }

  function handleDemoModeChange(event) {
    const nextDemoMode = event.target.checked;
    runtimeRef.current.lastStepAnnouncementIndex = -1;

    patchUi({
      demoMode: nextDemoMode,
    });

    if (runtimeRef.current.handsTracker) {
      runtimeRef.current.handsTracker.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: getAnalysisConfig(nextDemoMode).handsMinDetectionConfidence,
        minTrackingConfidence: getAnalysisConfig(nextDemoMode).handsMinTrackingConfidence,
      });
    }

    if (runtimeRef.current.stream) {
      startAnalysisLoop();
    }

    addLog(`Demo Mode ${nextDemoMode ? "enabled" : "disabled"}.`);
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const currentStep = ui.steps[ui.currentStepIndex];
  const stepCounter = ui.steps.length
    ? currentStep
      ? `Step ${currentStep.step} / ${ui.steps.length}`
      : `Step ${ui.steps.length} / ${ui.steps.length}`
    : "Step 0 / 0";
  const currentStepText = ui.steps.length
    ? currentStep
      ? currentStep.text
      : "All parsed steps are complete. Load a new instruction set to restart."
    : "Upload instructions to generate the live step flow.";

  return {
    ui,
    stepCounter,
    currentStepText,
    videoRef,
    overlayRef,
    captureCanvasRef,
    handleInstructionTextChange,
    handleManualSearchResult,
    handleParseInstructions,
    handlePdfUpload,
    handleDemoModeChange,
    startCamera,
    stopCamera,
  };
}
