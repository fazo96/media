"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, importTorrent, listTorrents } from "@/lib/api";
import { formatSize } from "@/lib/format";
import { local } from "@/lib/storage";
import type { Job, Torrent, TorrentFile } from "@/lib/types";
import { IconClose, IconRefresh, IconSearch } from "./icons";

const REMOVE_KEY = "media:transmission-remove";
const ACTIVE = new Set(["queued", "downloading", "processing"]);

const fileName = (f: TorrentFile) => f.name.split("/").pop() ?? f.name;
const percent = (n: number) => `${Math.floor(n * 100)}%`;

type Props = {
  jobs: Job[];
  /** An import was queued: its job joins the page's. */
  onJob: (job: Job) => void;
  onClose: () => void;
};

/** Transmission's torrents with a video in them: import their finished files, then (by default) remove the torrent. */
export default function TransmissionPanel({ jobs, onJob, onClose }: Props) {
  const [torrents, setTorrents] = useState<Torrent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [remove, setRemove] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // An import that would delete videos not in the library, waiting for a yes.
  const [confirming, setConfirming] = useState<{ hash: string; files: TorrentFile[]; left: number } | null>(null);

  useEffect(() => setRemove(local.get(REMOVE_KEY) !== "0"), []);
  const pickRemove = (on: boolean) => {
    setRemove(on);
    local.set(REMOVE_KEY, on ? "1" : "0");
  };

  const load = useCallback(async () => {
    try {
      setTorrents((await listTorrents()).torrents);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can’t reach the server.");
    }
  }, []);

  // Read again whenever an import starts or ends: its files are in the library, its torrent maybe gone.
  const importing = useMemo(() => new Set(jobs.filter((j) => j.torrent && ACTIVE.has(j.state)).map((j) => j.torrent?.hash)), [jobs]);
  const importingKey = [...importing].sort().join(",");
  useEffect(() => {
    void load();
  }, [load, importingKey]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!torrents || !q) return torrents;
    return torrents.filter((t) => `${t.name} ${t.files.map((f) => f.name).join(" ")}`.toLowerCase().includes(q));
  }, [torrents, filter]);

  const start = async (t: Torrent, files: TorrentFile[], confirmed = false) => {
    if (remove && !confirmed) {
      // Transmission removes a torrent whole: say what else goes with it first.
      const chosen = new Set(files.map((f) => f.index));
      const left = t.files.filter((f) => !chosen.has(f.index) && !f.videoId).length;
      if (left > 0) {
        setConfirming({ hash: t.hash, files, left });
        return;
      }
    }
    setConfirming(null);
    setBusy(t.hash);
    try {
      const { job } = await importTorrent(
        t.hash,
        files.map((f) => f.index),
        remove,
      );
      onJob(job);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can’t reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="results" aria-label="Transmission">
      <div className="shelf-head">
        <h2 className="shelf-title">Transmission</h2>
        <div className="shelf-actions">
          <button type="button" className="icon-btn" onClick={() => void load()} aria-label="Refresh" title="Refresh">
            <IconRefresh />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Transmission" title="Close">
            <IconClose />
          </button>
        </div>
      </div>
      <div className="preview-bar">
        <label className="search torrent-filter">
          <IconSearch />
          <input type="search" placeholder="Filter torrents" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter torrents" />
        </label>
        <label className="check">
          <input type="checkbox" checked={remove} onChange={(e) => pickRemove(e.target.checked)} />
          Then delete the torrent and its files from Transmission
        </label>
      </div>
      {error && <p className="notice is-error torrent-error">{error}</p>}
      {!torrents ? (
        !error && <p className="none">Asking Transmission…</p>
      ) : shown?.length === 0 ? (
        <p className="none">{filter ? `No torrent matches “${filter}”.` : "No torrent in Transmission has a video in it."}</p>
      ) : (
        <ul className="torrents">
          {shown?.map((t) => {
            const ready = t.files.filter((f) => f.done >= 1 && !f.videoId);
            const active = importing.has(t.hash);
            const disabled = active || busy === t.hash;
            const meta = [
              formatSize(t.size),
              `${t.files.length} ${t.files.length === 1 ? "video" : "videos"}`,
              t.progress < 1 ? `downloading, ${percent(t.progress)}` : null,
              active ? "importing" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={t.hash} className="torrent" data-torrent={t.hash}>
                <div className="torrent-head">
                  <div className="torrent-text">
                    <h3 className="torrent-name" title={t.name}>
                      {t.name}
                    </h3>
                    <p className="card-meta">{meta}</p>
                  </div>
                  {ready.length > 1 && (
                    <button type="button" className="btn btn-small" disabled={disabled} onClick={() => void start(t, ready)}>
                      Import all ({ready.length})
                    </button>
                  )}
                </div>
                {confirming?.hash === t.hash && (
                  <div className="confirm" role="alert">
                    <span>
                      Deleting the torrent also deletes {confirming.left} other {confirming.left === 1 ? "video" : "videos"} in it that{" "}
                      {confirming.left === 1 ? "isn’t" : "aren’t"} in the library.
                    </span>
                    <button type="button" className="btn btn-danger btn-small" onClick={() => void start(t, confirming.files, true)}>
                      Import and delete
                    </button>
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                <ul className="torrent-files">
                  {t.files.map((f) => (
                    <li key={f.index} className="torrent-file">
                      <span className="torrent-file-name" title={f.name}>
                        {fileName(f)}
                      </span>
                      <span className="torrent-file-size">{formatSize(f.size)}</span>
                      {f.videoId ? (
                        <Link href={`/v/${f.videoId}`} className="torrent-file-state">
                          In the library
                        </Link>
                      ) : f.done < 1 ? (
                        <span className="torrent-file-state">{percent(f.done)}</span>
                      ) : (
                        <button type="button" className="btn btn-small" disabled={disabled} onClick={() => void start(t, [f])}>
                          Import
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
