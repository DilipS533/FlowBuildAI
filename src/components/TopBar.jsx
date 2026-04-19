export function TopBar({ demoMode, onDemoModeChange }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">StepSight AI</p>
        <h1>Live task guidance with in-browser verification</h1>
      </div>

      <label className="demo-toggle" htmlFor="demoMode">
        <span>Demo Mode</span>
        <input
          id="demoMode"
          type="checkbox"
          checked={demoMode}
          onChange={onDemoModeChange}
        />
        <span className="toggle-visual" aria-hidden="true" />
      </label>
    </header>
  );
}
