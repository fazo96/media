import Link from "next/link";

export default function NotFound() {
  return (
    <main className="empty-page">
      <h1>Not in the library</h1>
      <p>That video may have been deleted.</p>
      <Link className="btn" href="/">
        Back to the library
      </Link>
    </main>
  );
}
