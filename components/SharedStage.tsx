"use client";

import { useState } from "react";
import { formatDuration, formatHeight, formatSize } from "@/lib/format";
import { isAudio, type SharedItem } from "@/lib/types";
import { IconDownload, IconStill, IconWarn } from "./icons";
import Notice from "./Notice";

type Props = {
  item: SharedItem;
  /** Where its file and still are: `<base>/file`, `<base>/thumb`. */
  base: string;
  mediaRef?: React.Ref<HTMLMediaElement>;
  onEnded?: () => void;
};

/**
 * A shared video playing (music: the browser's audio controls under its
 * cover), its details and Download. Keyed by the video, so a new one starts
 * afresh.
 */
export default function SharedStage({ item: v, base, mediaRef, onEnded }: Props) {
  const [failed, setFailed] = useState(false);
  const file = `${base}/file`;
  const thumb = v.hasThumb ? `${base}/thumb` : undefined;
  const details = [v.duration ? formatDuration(v.duration) : null, formatHeight(v.height), formatSize(v.size)].filter(Boolean);
  return (
    <section className="stage">
      {isAudio(v) ? (
        <>
          <div className="screen is-listening">{thumb ? <img src={thumb} alt="" /> : <IconStill audio />}</div>
          {/* biome-ignore lint/a11y/useMediaCaption: music */}
          <audio ref={mediaRef} className="shared-audio" src={file} controls preload="metadata" onError={() => setFailed(true)} onEnded={onEnded} />
        </>
      ) : (
        <div className="screen">
          {/* biome-ignore lint/a11y/useMediaCaption: the library's videos come without caption files */}
          <video
            ref={mediaRef as React.Ref<HTMLVideoElement>}
            src={file}
            poster={thumb}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            onEnded={onEnded}
          />
        </div>
      )}
      {(failed || !v.playable) && (
        <Notice error>
          <IconWarn />
          {isAudio(v)
            ? "This browser couldn’t play it. Download it to play it elsewhere."
            : `This is ${v.videoCodec ?? "an unusual codec"}, which this browser can’t play. Download it to watch it in a video player.`}
        </Notice>
      )}
      <div className="watch-info">
        <h1 className="watch-title">{v.title}</h1>
        {v.channel && <p className="watch-meta">{v.channel}</p>}
        <p className="watch-details">{details.join(" · ")}</p>
        <div className="watch-actions">
          <a className="btn" href={`${file}?download`} download>
            <IconDownload /> Download
          </a>
        </div>
      </div>
    </section>
  );
}
