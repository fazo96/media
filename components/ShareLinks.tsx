"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createShare, errorMessage, listShares, revokeShare, shareUrl } from "@/lib/api";
import { formatAgo, formatIn } from "@/lib/format";
import type { SharedLink, ShareExpiry, ShareTarget } from "@/lib/types";
import { IconCheck, IconLink, IconShare, IconTrash } from "./icons";

const EXPIRIES: { key: ShareExpiry; label: string }[] = [
  { key: "1d", label: "1 day" },
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "never", label: "Never" },
];

/** One link: its address to copy or send on, how long it lasts, and revoke. `withTitle`: say which video or playlist (in Settings). */
export function ShareLinkRow({ link, onRevoked, withTitle = false }: { link: SharedLink; onRevoked: () => void; withTitle?: boolean }) {
  const url = shareUrl(link);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn’t copy: select the link and copy it instead.");
    }
  };
  const send = () => void navigator.share({ title: link.title, url }).catch(() => {}); // cancelling is fine
  const revoke = async () => {
    setBusy(true);
    try {
      await revokeShare(link.token);
      onRevoked();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <li className="share-link" aria-busy={busy}>
      {withTitle && (
        <span className="share-link-title">
          {link.playlistId ? "Playlist: " : ""}
          {link.title ? (
            <Link href={link.playlistId ? `/p/${link.playlistId}` : `/v/${link.videoId}`}>{link.title}</Link>
          ) : link.playlistId ? (
            "deleted"
          ) : (
            "A deleted video"
          )}
        </span>
      )}
      <input className="share-link-url" value={url} readOnly aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
      <span className="share-link-actions">
        <button type="button" className="btn btn-small" onClick={() => void copy()}>
          {copied ? <IconCheck /> : <IconLink />} {copied ? "Copied" : "Copy"}
        </button>
        {canSend && (
          <button type="button" className="btn btn-small" onClick={send}>
            <IconShare /> Send
          </button>
        )}
        <button type="button" className="btn btn-quiet btn-small share-revoke" onClick={() => void revoke()} disabled={busy}>
          <IconTrash /> Revoke
        </button>
      </span>
      <span className="share-link-meta">
        Made {formatAgo(link.createdAt)} · {link.expiresAt === null ? "never expires" : `expires ${formatIn(link.expiresAt)}`}
      </span>
      {error && <span className="share-link-error">{error}</span>}
    </li>
  );
}

type ButtonProps = { of: ShareTarget; title: string; small?: boolean };

/** Share, under a video or on a playlist's page: make a link anyone can watch from, and the ones made already. */
export default function ShareButton({ of, title, small = true }: ButtonProps) {
  // `of` is a new object each render: the effect below follows `key`, what it names.
  const target = useRef(of);
  target.current = of;
  const key = "videoId" in of ? `v:${of.videoId}` : `p:${of.playlistId}`;
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<SharedLink[] | null>(null);
  const [expires, setExpires] = useState<ShareExpiry>("1w");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listShares(target.current).then(setLinks, (err) => setError(errorMessage(err)));
  }, [open, key]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await createShare(of, expires);
      setLinks((ls) => [{ ...s, title }, ...(ls ?? [])]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="share">
      <button type="button" className={`btn ${small ? "btn-small" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconShare /> Share
      </button>
      {open && (
        <section className="share-panel" aria-label="Share links">
          <p className="share-text">
            {"videoId" in of
              ? "Anyone with a link can watch and download this video, without the password, until it expires or you revoke it."
              : "Anyone with a link can watch and download this playlist’s videos, as the playlist is when they open it (videos you add later too), without the password, until it expires or you revoke it."}
          </p>
          <div className="share-new">
            <span className="share-label" id="share-expiry">
              Expires after
            </span>
            <fieldset className="chips" aria-labelledby="share-expiry">
              {EXPIRIES.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={expires === e.key}
                  className={`chip ${expires === e.key ? "is-on" : ""}`}
                  onClick={() => setExpires(e.key)}
                >
                  {e.label}
                </button>
              ))}
            </fieldset>
            <button type="button" className="btn btn-primary btn-small" onClick={() => void create()} disabled={busy}>
              <IconLink /> Make a link
            </button>
          </div>
          {error && <p className="share-link-error">{error}</p>}
          {links && links.length > 0 && (
            <ul className="share-links">
              {links.map((l) => (
                <ShareLinkRow key={l.token} link={l} onRevoked={() => setLinks((ls) => ls?.filter((x) => x.token !== l.token) ?? null)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Settings: every link still good, to revoke any. */
export function SharedLinks() {
  const [links, setLinks] = useState<SharedLink[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    listShares().then(setLinks, () => setError(true));
  }, []);
  return (
    <>
      {error && <p className="welcome-error">Couldn’t ask the server.</p>}
      {links?.length === 0 && <p className="settings-hint">No links. Make one with Share, under a video or on a playlist.</p>}
      {links && links.length > 0 && (
        <ul className="share-links">
          {links.map((l) => (
            <ShareLinkRow key={l.token} link={l} withTitle onRevoked={() => setLinks((ls) => ls?.filter((x) => x.token !== l.token) ?? null)} />
          ))}
        </ul>
      )}
    </>
  );
}
