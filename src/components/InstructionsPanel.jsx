export function InstructionsPanel({
  demoMode,
  inputFeedback,
  instructionText,
  stepCounter,
  currentStepText,
  steps,
  completedSteps,
  currentStepIndex,
  onInstructionTextChange,
  onParseInstructions,
  onPdfUpload,
}) {
  return (
    <section className="panel left-panel">
      <article className="card input-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Instruction Input</p>
            <h2>Load a guide</h2>
          </div>
        </div>

        <label className="upload-field" htmlFor="pdfUpload">
          <span>Upload PDF</span>
          <input id="pdfUpload" type="file" accept="application/pdf" onChange={onPdfUpload} />
        </label>

        <div className="or-divider">
          <span>or paste text</span>
        </div>

        <label className="text-input-group" htmlFor="instructionInput">
          <span>Instructions</span>
          <textarea
            id="instructionInput"
            value={instructionText}
            onChange={onInstructionTextChange}
            placeholder={
              "1. Place the first piece in the center\n2. Add the next piece on top\n3. Press the final part into place"
            }
          />
        </label>

        <button className="primary-button" type="button" onClick={onParseInstructions}>
          Build Steps
        </button>
        <p className={`support-text${inputFeedback.error ? " warning-text" : ""}`}>
          {inputFeedback.message}
        </p>
      </article>

      <article className="card step-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Current Step</p>
            <h2>{stepCounter}</h2>
          </div>
          <span className={`mode-badge${demoMode ? "" : " hidden"}`}>Demo mode</span>
        </div>

        <p className="current-step-copy">{currentStepText}</p>

        <ol className="step-list">
          {steps.map((step, index) => {
            const className = completedSteps.includes(step.step)
              ? "complete"
              : index === currentStepIndex
                ? "active"
                : "";

            return (
              <li key={step.step} className={className}>
                {step.text}
              </li>
            );
          })}
        </ol>
      </article>
    </section>
  );
}
