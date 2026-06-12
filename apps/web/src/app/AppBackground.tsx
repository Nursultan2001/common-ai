// Ambient animated background for the app (dashboard/admin): aurora blobs +
// faint tech grid. Pure CSS animation, sits behind content (z-index 0).
export default function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="grid-layer" />
      <div className="blob a" />
      <div className="blob b" />
      <div className="blob c" />
    </div>
  );
}
