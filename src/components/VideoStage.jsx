export function VideoStage({
  cameraActive,
  motionValue,
  handCount,
  correctionCount,
  elapsedValue,
  showCompletion,
  completionSummary,
  videoRef,
  overlayRef,
  captureCanvasRef,
  onStartCamera,
  onStopCamera,
}) {
  return (
    <section className="panel center-panel">
      <article className="card stage-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Workspace Feed</p>
            <h2>Realtime verification</h2>
          </div>

          <div className="stage-actions">
            <button className="primary-button" type="button" onClick={onStartCamera}>
              Start Camera
            </button>
            <button className="secondary-button" type="button" onClick={onStopCamera}>
              Stop
            </button>
          </div>
        </div>

        <div className="video-shell">
          <video
            ref={videoRef}
            className={cameraActive ? "camera-live" : ""}
            autoPlay
            playsInline
            muted
          />
          <canvas ref={overlayRef} aria-hidden="true" />
          <canvas ref={captureCanvasRef} className="hidden-canvas" aria-hidden="true" />

          {!cameraActive ? (
            <div className="video-placeholder">
              <p>Camera inactive</p>
              <span>Start the feed to enable motion and hand analysis.</span>
            </div>
          ) : null}
        </div>

        <div className="stage-footer">
          <div className="metric-card">
            <span>Motion</span>
            <strong>{motionValue}</strong>
          </div>
          <div className="metric-card">
            <span>Hands</span>
            <strong>{handCount}</strong>
          </div>
          <div className="metric-card">
            <span>Corrections</span>
            <strong>{correctionCount}</strong>
          </div>
          <div className="metric-card">
            <span>Elapsed</span>
            <strong>{elapsedValue}</strong>
          </div>
        </div>
      </article>

      <article className={`card completion-card${showCompletion ? "" : " hidden"}`}>
        <p className="eyebrow">Session Complete</p>
        <h2>All steps completed successfully.</h2>
        <p className="support-text">{completionSummary}</p>
      </article>
    </section>
  );
}
