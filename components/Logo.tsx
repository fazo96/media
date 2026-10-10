/** The mark: a screen with a play button, in the current text and accent colours. */
export default function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="13" width="52" height="38" rx="6" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M26 23v18l15-9z" fill="var(--accent)" />
    </svg>
  );
}
