// Currency ticks (and therefore a save-worthy state change) happen once per
// second, so a "just saved" flash would be permanently lit and meaningless.
// A quiet, always-present reassurance is more honest than a constant pulse.
export function SaveIndicator() {
  return <div className="save-indicator">Progress saves automatically in this browser</div>
}
