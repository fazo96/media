/** A line of news under the page's controls: a status, or an error (an alert), maybe with an ×. */
export default function Notice({
  error = false,
  className,
  onDismiss,
  children,
}: {
  error?: boolean;
  className?: string;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <p className={["notice", error && "is-error", className].filter(Boolean).join(" ")} role={error ? "alert" : "status"}>
      {children}
      {onDismiss && (
        <button type="button" className="notice-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </p>
  );
}
