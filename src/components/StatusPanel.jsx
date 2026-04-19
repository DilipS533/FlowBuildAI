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
            <p className="eyebrow">Event Stream</p>
            <h2>Session log</h2>
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
          Hands are drawn as small dots on the video. LEGO-like feedback uses
          the same low-res color scan as the caption under the feed (hue blobs,
          not part numbers) plus before/after motion checks. Step wording and
          named colors steer pick/place/attach logic; Demo Mode eases motion
          thresholds.
        </p>
      </article>
    </aside>
  );
}
