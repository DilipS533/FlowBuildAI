import { InstructionsPanel } from "./components/InstructionsPanel";
import { StatusPanel } from "./components/StatusPanel";
import { TopBar } from "./components/TopBar";
import { VideoStage } from "./components/VideoStage";
import { useFlowSession } from "./hooks/useFlowSession";

export default function App() {
  const {
    ui,
    stepCounter,
    currentStepText,
    videoRef,
    overlayRef,
    captureCanvasRef,
    handleInstructionTextChange,
    handleParseInstructions,
    handlePdfUpload,
    handleDemoModeChange,
    startCamera,
    stopCamera,
  } = useFlowSession();

  return (
    <div className="app-shell">
      <TopBar demoMode={ui.demoMode} onDemoModeChange={handleDemoModeChange} />

      <main className="workspace">
        <InstructionsPanel
          demoMode={ui.demoMode}
          inputFeedback={ui.inputFeedback}
          instructionText={ui.instructionText}
          stepCounter={stepCounter}
          currentStepText={currentStepText}
          steps={ui.steps}
          completedSteps={ui.completedSteps}
          currentStepIndex={ui.currentStepIndex}
          onInstructionTextChange={handleInstructionTextChange}
          onParseInstructions={handleParseInstructions}
          onPdfUpload={handlePdfUpload}
        />

        <VideoStage
          cameraActive={ui.cameraActive}
          motionValue={ui.motionValue}
          handCount={ui.handCount}
          correctionCount={ui.correctionCount}
          elapsedValue={ui.elapsedValue}
          showCompletion={ui.showCompletion}
          completionSummary={ui.completionSummary}
          videoRef={videoRef}
          overlayRef={overlayRef}
          captureCanvasRef={captureCanvasRef}
          onStartCamera={startCamera}
          onStopCamera={stopCamera}
        />

        <StatusPanel
          status={ui.status}
          engineState={ui.engineState}
          sessionState={ui.sessionState}
          handState={ui.handState}
          guidanceState={ui.guidanceState}
          eventLog={ui.eventLog}
        />
      </main>
    </div>
  );
}
