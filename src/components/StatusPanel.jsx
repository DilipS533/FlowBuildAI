export function StatusPanel({
  status,
  engineState,
  sessionState,
  handState,
  guidanceState,
  eventLog,
}) {
  return (
    <aside className="panel right-panel">
      <article className="card status-card">
        <p className="eyebrow">System Status</p>
        <div className={`status-pill ${status.tone}`}>{status.label}</div>
        <p className="status-detail">{status.detail}</p>

        <div className="status-grid">
          <div className="status-grid-item">
            <span>Engine</span>
            <strong>{engineState}</strong>
          </div>
          <div className="status-grid-item">
            <span>Session</span>
            <strong>{sessionState}</strong>
          </div>
          <div className="status-grid-item">
            <span>Hand Check</span>
            <strong>{handState}</strong>
          </div>
          <div className="status-grid-item">
            <span>Guidance</span>
            <strong>{guidanceState}</strong>
          </div>
        </div>
      </article>

      <article className="card timeline-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Live Feed</p>
            <h2>Event stream</h2>
          </div>
        </div>

        <ul className="event-log">
          {eventLog.length ? (
            eventLog.map((entry, index) => (
              <li key={`${entry.time}-${index}`}>
                <time>
                  {new Date(entry.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
                <span>{entry.message}</span>
              </li>
            ))
          ) : (
            <li>No events yet.</li>
          )}
        </ul>
      </article>

      <article className="card hint-card">
        <p className="eyebrow">Verification Model</p>
        <p className="support-text">
          Step completion uses motion onset, hand presence, and post-action
          stabilization. Demo Mode lowers the motion threshold and accepts
          shorter actions.
        </p>
      </article>
    </aside>
  );
}
