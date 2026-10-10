"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { changePlaylist, deletePlaylist, errorMessage, requestYoutube } from "@/lib/api";
import { playlistCount, sourceLabel } from "@/lib/format";
import { youtubeIdFromVideoId } from "@/lib/ids";
import { type AddOptions as Options, inLibrary, isActive, isAudio, type Job, type Playlist, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { youtubeUrl } from "@/lib/youtube";
import AddBar from "./AddBar";
import AddOptions, { useAddOptions } from "./AddOptions";
import { IconClose, IconEdit, IconExternal, IconFilm, IconHeadphones, IconPlay, IconRefresh, IconTrash, IconUpload } from "./icons";
import { Confirm, Rename } from "./InlineEdit";
import { UploadCard } from "./JobCard";
import MediaRow, { Still } from "./MediaRow";
import Notice from "./Notice";
import ShareButton from "./ShareLinks";
import Topbar, { toPlaylists } from "./Topbar";
import { useLibrary } from "./useLibrary";
import { useDropAndPaste, useUploads } from "./useUploads";
import { type News, useYoutube } from "./useYoutube";
import YtThumb from "./YtThumb";

type Props = { initialPlaylist: Playlist; initialPlaylists: Playlist[]; initialVideos: Video[]; initialJobs: Job[] };

/**
 * A playlist: its videos in order, played through from the top; renamed,
 * trimmed or deleted here. What's dropped, pasted or downloaded here goes into
 * it (and any other playlists picked).
 */
export default function PlaylistView({ initialPlaylist, initialPlaylists, initialVideos, initialJobs }: Props) {
  const router = useRouter();
  const lib = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const { videos, jobs, keepPlaylist, keepJobs, keepVideo, refresh } = lib;
  // As the library has it now; gone meanwhile (once it's been asked), to the library.
  const found = lib.playlists.find((x) => x.id === initialPlaylist.id);
  const p = found ?? initialPlaylist;
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [notice, setNotice] = useState<News | null>(null);
  const fail = (err: unknown) => setNotice({ text: errorMessage(err), error: true });
  const say = useCallback((text: string) => setNotice({ text, error: true }), []);

  useEffect(() => {
    if (lib.synced && !found) router.replace("/");
  }, [lib.synced, found, router]);

  // Adding from here: into this playlist to start with.
  const add = useAddOptions([initialPlaylist.id]);
  const yt = useYoutube({ keepJobs, keepPlaylist, say: setNotice, options: add.options, into: initialPlaylist.id });
  const { addLink } = yt;
  const onUploaded = useCallback(
    (v: Video, o: Options) => {
      keepVideo(v);
      if (o.playlists?.length) void refresh();
    },
    [keepVideo, refresh],
  );
  const up = useUploads({ onAdded: onUploaded, onRefused: say, options: add.options });
  const { addFiles } = up;
  const onFiles = useCallback(
    (files: File[]) => {
      if (addFiles(files)) setNotice(null);
    },
    [addFiles],
  );
  const onLink = useCallback((text: string) => void addLink(text), [addLink]);
  const dragging = useDropAndPaste({ onFiles, onLink });

  const byId = new Map(videos.map((v) => [v.id, v]));
  const present = inLibrary(p.items, byId);
  // The latest: one tried again comes after the one that failed.
  const jobFor = (ytId: string | null) => (ytId ? jobs.findLast((j) => j.youtubeId === ytId && (isActive(j) || j.state === "failed")) : undefined);

  const rename = async (title: string) => {
    try {
      keepPlaylist(await changePlaylist(p.id, { title }));
    } catch (err) {
      fail(err);
      throw err;
    }
  };

  const remove = async (id: string) => {
    try {
      keepPlaylist(await changePlaylist(p.id, { remove: [id] }));
    } catch (err) {
      fail(err);
    }
  };

  // A failed one tries again as what it was asked as (it's in the playlist already).
  const download = async (ytId: string, music?: boolean) => {
    try {
      const res = await requestYoutube(ytId, { music });
      if (res.job) keepJobs([res.job]);
      if (res.video) keepVideo(res.video);
    } catch (err) {
      fail(err);
    }
  };

  const destroy = async () => {
    try {
      await deletePlaylist(p.id);
      router.push("/playlists");
    } catch (err) {
      fail(err);
    }
  };

  // Listen mode is each video's: the playlist's button sets it for all of them, and shows on once they all have it.
  // Music is always in it, so the button is for the videos (and isn't there for an album).
  const videosIn = present.filter((v) => !isAudio(v));
  const allListen = videosIn.length > 0 && videosIn.every((v) => v.listen);
  const toggleListen = async () => {
    const listen = !allListen;
    try {
      keepPlaylist(await changePlaylist(p.id, { listen }));
      lib.updateVideos((v) => (p.items.includes(v.id) && !isAudio(v) ? { ...v, listen } : v));
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="app">
      <Topbar back={toPlaylists} title={p.title} />

      <main className="library playlist-page">
        <section className="playlist-head">
          {mode === "rename" ? (
            <Rename initial={p.title} label="Playlist name" onSave={rename} onDone={() => setMode("idle")} />
          ) : (
            <h1 className="shelf-title">{p.title}</h1>
          )}
          <p className="card-meta">
            {[p.youtubePlaylistId ? (p.channel ?? "YouTube") : null, playlistCount(p.items.length, present.length)].filter(Boolean).join(" · ")}
            {p.url && (
              <>
                {" · "}
                <a href={p.url} target="_blank" rel="noreferrer">
                  YouTube <IconExternal />
                </a>
              </>
            )}
          </p>
          <div className="playlist-actions">
            {present.length > 0 && (
              <Link href={playerHref(present[0].id, p.id)} className="btn btn-primary">
                <IconPlay /> Play all
              </Link>
            )}
            {videosIn.length > 0 && (
              <button
                type="button"
                className={`btn ${allListen ? "is-on" : ""}`}
                onClick={toggleListen}
                aria-pressed={allListen}
                title={allListen ? "Its videos play their audio alone: turn that off for all of them" : "Play all its videos’ audio alone, which keeps playing with the screen off"}
              >
                <IconHeadphones /> Listen
              </button>
            )}
            <button type="button" className="btn" onClick={() => setMode("rename")}>
              <IconEdit /> Rename
            </button>
            <ShareButton of={{ playlistId: p.id }} title={p.title} small={false} />
            {mode === "delete" ? (
              <Confirm question="Delete the playlist? Its videos stay in the library." onConfirm={destroy} onCancel={() => setMode("idle")} />
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setMode("delete")}>
                <IconTrash /> Delete
              </button>
            )}
          </div>
        </section>

        <AddBar
          onLink={addLink}
          onSearch={yt.runSearch}
          onFiles={onFiles}
          options={<AddOptions choice={add} playlists={lib.playlists} onCreated={keepPlaylist} onError={say} />}
        />

        {notice && (
          <Notice error={notice.error} onDismiss={() => setNotice(null)}>
            {notice.text}
            {notice.action && (
              <button type="button" className="link-btn" onClick={notice.action.run}>
                {notice.action.label}
              </button>
            )}
          </Notice>
        )}

        {up.uploads.length > 0 && (
          <ul className="grid grid-coming">
            {up.uploads.map((u) => (
              <li key={u.key}>
                <UploadCard upload={u} onDismiss={() => up.dismiss(u.key)} />
              </li>
            ))}
          </ul>
        )}

        {p.items.length === 0 ? (
          <p className="none">Nothing here yet. Drop files on this page, paste a YouTube link, or add videos from their ⋯ menu in the library.</p>
        ) : (
          <ol className="pl-items">
            {p.items.map((id, i) => {
              const v = byId.get(id);
              const ytId = youtubeIdFromVideoId(id);
              const job = jobFor(ytId);
              const status = v
                ? sourceLabel(v)
                : job
                  ? job.state === "failed"
                    ? (job.error ?? "Failed")
                    : job.state === "queued"
                      ? "Waiting to download"
                      : "Downloading…"
                  : ytId
                    ? "Not downloaded"
                    : "Deleted from the library";
              return (
                <li key={id} className={`pl-item ${v ? "" : "is-missing"}`} data-item={id}>
                  <span className="pl-index">{i + 1}</span>
                  <MediaRow
                    still={v ? <Still video={v} src={thumbUrl(v)} /> : ytId ? <YtThumb id={ytId} /> : <IconFilm />}
                    duration={v?.duration}
                    title={v?.title ?? job?.title ?? (ytId ? `YouTube · ${ytId}` : id)}
                    meta={status}
                    error={job?.state === "failed"}
                    href={v && playerHref(v.id, p.id)}
                  />
                  <span className="pl-item-actions">
                    {!v && ytId && (!job || job.state === "failed") && (
                      <button type="button" className="icon-btn" onClick={() => download(ytId, job?.music)} aria-label="Download it" title="Download it">
                        <IconRefresh />
                      </button>
                    )}
                    {!v && ytId && (
                      <a className="icon-btn" href={youtubeUrl(ytId)} target="_blank" rel="noreferrer" aria-label="Open on YouTube" title="Open on YouTube">
                        <IconExternal />
                      </a>
                    )}
                    <button type="button" className="icon-btn" onClick={() => remove(id)} aria-label="Remove from the playlist" title="Remove from the playlist">
                      <IconClose />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </main>

      {dragging && (
        <div className="drop-target" aria-hidden="true">
          <div className="drop-card">
            <IconUpload />
            <span>
              Drop to add to “{p.title}”{add.music ? " as music" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
