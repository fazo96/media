"use client";

import { formatSize } from "@/lib/format";
import type { Job } from "@/lib/types";
import { IconClose, IconDownload, IconRefresh, IconUpload, IconWarn } from "./icons";
import YtThumb from "./YtThumb";

export type Upload = { key: string; name: string; sent: number; state: "waiting" | "sending" | "processing" | "failed"; error?: string };

/** A bar, or a sweeping one when how far along isn't known. */
export function Progress({ value }: { value: number | null }) {
  return (
    <div className={`progress ${value === null ? "is-unknown" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
      <span style={value === null ? undefined : { width: `${value * 100}%` }} />
    </div>
  );
}

const eta = (s?: number) => (s === undefined || !Number.isFinite(s) ? "" : s < 60 ? `${Math.round(s)}s left` : `${Math.round(s / 60)} min left`);

/** How a job is getting on, in a line: "42% · audio · 3 MB/s", "Converting audio", its error. */
export function jobStatus(job: Job): string {
  const t = job.torrent;
  // Which of a torrent's files, when it's more than one.
  const of = t && t.files.length > 1 ? `${t.current + 1} of ${t.files.length}` : "";
  return job.state === "queued"
      ? "Waiting its turn"
      : job.state === "downloading"
        ? [
            t ? "Copying" : "",
            of,
            job.progress === null ? (t ? "" : "Starting") : `${Math.round(job.progress * 100)}%`,
            job.stream > 0 ? "audio" : "",
            job.speed ? `${formatSize(job.speed)}/s` : "",
            eta(job.eta),
          ]
            .filter(Boolean)
            .join(" · ")
        : job.state === "processing"
          ? t
            ? [job.converting ? "Converting audio" : "Reading the video", of].filter(Boolean).join(" · ")
            : job.converting
              ? "Converting audio"
              : "Finishing"
          : job.state === "done"
            ? "Added"
            : (job.error ?? "Failed");
}

/** A YouTube download, or an import from Transmission, in the grid until its video takes its place. */
export default function JobCard({ job, onDismiss, onRetry }: { job: Job; onDismiss: () => void; onRetry: () => void }) {
  const failed = job.state === "failed";
  const t = job.torrent;
  const status = jobStatus(job);

  return (
    <article className={`card card-pending ${failed ? "is-failed" : ""}`}>
      <div className={`thumb ${t ? "thumb-blank" : ""}`}>
        {t ? (
          <IconDownload />
        ) : (
          <YtThumb id={job.youtubeId ?? ""} />
        )}
        {!failed && job.state !== "done" && <Progress value={job.state === "downloading" ? job.progress : null} />}
      </div>
      <div className="card-body">
        <h2 className="card-title">{job.title ?? (t ? "Torrent" : `YouTube · ${job.youtubeId}`)}</h2>
        <p className={`card-meta ${failed ? "is-error" : ""}`} title={failed ? status : undefined}>
          {failed && <IconWarn />} {status}
        </p>
      </div>
      <div className="card-actions">
        {failed && (
          <button type="button" className="icon-btn" onClick={onRetry} aria-label="Try again" title="Try again">
            <IconRefresh />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onDismiss} aria-label={failed ? "Dismiss" : t ? "Cancel import" : "Cancel download"} title={failed ? "Dismiss" : "Cancel"}>
          <IconClose />
        </button>
      </div>
    </article>
  );
}

/** A playlist's downloads still waiting their turn, as one card rather than one each. */
export function QueuedPlaylistCard({ title, jobs, onCancel }: { title: string; jobs: Job[]; onCancel: () => void }) {
  return (
    <article className="card card-pending" data-queued-playlist>
      <div className="thumb">
        <YtThumb id={jobs[0].youtubeId ?? ""} />
        <Progress value={null} />
      </div>
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p className="card-meta">
          {jobs.length} more {jobs.length === 1 ? "video" : "videos"} waiting their turn
        </p>
      </div>
      <div className="card-actions">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancel the rest" title="Cancel the rest">
          <IconClose />
        </button>
      </div>
    </article>
  );
}

/** A dropped file on its way up. */
export function UploadCard({ upload, onDismiss }: { upload: Upload; onDismiss: () => void }) {
  const failed = upload.state === "failed";
  const status =
    upload.state === "waiting"
      ? "Waiting its turn"
      : upload.state === "sending"
        ? `Uploading · ${Math.round(upload.sent * 100)}%`
        : upload.state === "processing"
          ? "Reading the video"
          : (upload.error ?? "Failed");
  return (
    <article className={`card card-pending ${failed ? "is-failed" : ""}`}>
      <div className="thumb thumb-blank">
        <IconUpload />
        {!failed && <Progress value={upload.state === "sending" ? upload.sent : null} />}
      </div>
      <div className="card-body">
        <h2 className="card-title">{upload.name}</h2>
        <p className={`card-meta ${failed ? "is-error" : ""}`}>
          {failed && <IconWarn />} {status}
        </p>
      </div>
      {failed && (
        <div className="card-actions">
          <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
            <IconClose />
          </button>
        </div>
      )}
    </article>
  );
}
