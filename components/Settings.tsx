"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ToolStatus } from "@/lib/types";
import { IconBack, IconFilm, IconShare, IconWarn } from "./icons";
import LockSettings from "./LockSettings";
import SettingsHead from "./SettingsHead";
import { SharedLinks } from "./ShareLinks";
import ThemeButton from "./ThemeButton";

const PURPOSE: Record<string, string> = {
  "yt-dlp": "Downloads from YouTube",
  ffmpeg: "Joins YouTube’s video and audio, makes thumbnails, repacks files browsers can’t open",
  ffprobe: "Reads a video’s length, size and codecs",
};

const ENV: Record<string, string> = { "yt-dlp": "MEDIA_YTDLP", ffmpeg: "MEDIA_FFMPEG", ffprobe: "MEDIA_FFPROBE" };

/** The tools the server runs, found or not. Asked for on open: through nix shell the first check can take a while. */
function Tools() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<ToolStatus[]>("/api/tools").then(setTools, () => setError(true));
  }, []);

  return (
    <section className="settings-section" aria-labelledby="tools-title">
      <SettingsHead icon={<IconFilm />} title="Tools" id="tools-title" />
      <p className="settings-text">
        media runs these on the server. Each is looked for in its environment variable, then on PATH, then through{" "}
        <code>nix shell</code>.
      </p>
      {error && <p className="welcome-error">Couldn’t ask the server.</p>}
      {!tools && !error && <p className="settings-hint">Checking… (the first look through nix can take a minute)</p>}
      {tools && (
        <dl className="tools">
          {tools.map((t) => (
            <div key={t.name} className={`tool ${t.command && !t.error ? "is-ok" : "is-missing"}`}>
              <dt>
                {t.name} {t.version && <span className="tool-version">{t.version}</span>}
              </dt>
              <dd>
                <span className="tool-purpose">{PURPOSE[t.name]}</span>
                {t.command ? (
                  <code className="tool-command">{t.command.join(" ")}</code>
                ) : (
                  <span className="tool-error">
                    <IconWarn /> Not found. Install it, or set {ENV[t.name]}.
                  </span>
                )}
                {t.error && (
                  <span className="tool-error">
                    <IconWarn /> {t.error}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default function Settings({ locked }: { locked: boolean }) {
  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" className="icon-btn" aria-label="Back to the library" title="Library">
          <IconBack />
        </Link>
        <span className="topbar-title">Settings</span>
        <div className="topbar-right">
          <ThemeButton />
        </div>
      </header>
      <main className="settings">
        <Tools />
        <section className="settings-section" aria-labelledby="shares-title">
          <SettingsHead icon={<IconShare />} title="Shared links" id="shares-title" />
          <p className="settings-text">Links that play one video for anyone who has them, no password needed. Revoke one and it stops working at once.</p>
          <SharedLinks />
        </section>
        <LockSettings locked={locked} />
      </main>
    </div>
  );
}
