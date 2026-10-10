/** A share link that expired, was revoked, or whose video is gone. Nothing here leads into the library. */
export default function NotFound() {
  return (
    <main className="empty-page">
      <h1>This link doesn’t work any more</h1>
      <p>It may have expired, or been turned off by whoever shared it.</p>
    </main>
  );
}
