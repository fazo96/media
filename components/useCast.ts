"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { castShare, saveProgress } from "@/lib/api";
import { listenMime, type Video } from "@/lib/types";

// Casting the player's video (in listen mode, its audio alone) to a Chromecast
// or Android TV (docs/pages.md#casting), with Google's Cast sender SDK and its
// Default Media Receiver, so there's no receiver app of our own. The device has
// no session cookie, so it plays from a short-lived share link (lib/shares.ts).
// Only Chrome has Cast: elsewhere the SDK says it isn't available and there's
// no button.

const SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
/** How often, while the TV plays, where it is goes to the server (as the player does). */
const SAVE_EVERY_MS = 5000;

// The part of the SDK used here (it ships no types we could install offline).
type CastEvent = { sessionState?: string; castState?: string };
type CastSession = {
  getCastDevice(): { friendlyName: string };
  getMediaSession(): { media?: { contentId: string } } | null;
  loadMedia(request: unknown): Promise<unknown>;
};
type CastContext = {
  setOptions(o: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  getCastState(): string;
  getCurrentSession(): CastSession | null;
  requestSession(): Promise<unknown>;
  endCurrentSession(stopCasting: boolean): void;
  addEventListener(type: string, fn: (e: CastEvent) => void): void;
  removeEventListener(type: string, fn: (e: CastEvent) => void): void;
};
type RemotePlayer = { currentTime: number; duration: number; playerState: string | null; isPaused: boolean };
type RemoteController = {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  playOrPause(): void;
};
type Framework = {
  CastContext: { getInstance(): CastContext };
  CastContextEventType: { SESSION_STATE_CHANGED: string; CAST_STATE_CHANGED: string };
  SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string };
  CastState: { NO_DEVICES_AVAILABLE: string; CONNECTED: string };
  RemotePlayer: new () => RemotePlayer;
  RemotePlayerController: new (p: RemotePlayer) => RemoteController;
  RemotePlayerEventType: { CURRENT_TIME_CHANGED: string; PLAYER_STATE_CHANGED: string };
};
type ChromeCast = {
  AutoJoinPolicy: { ORIGIN_SCOPED: string };
  Image: new (url: string) => unknown;
  media: {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    MediaInfo: new (contentId: string, contentType: string) => { metadata?: unknown; streamType?: string };
    GenericMediaMetadata: new () => { title?: string; subtitle?: string; images?: unknown[] };
    LoadRequest: new (info: unknown) => { currentTime?: number; autoplay?: boolean };
  };
};
declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: { framework: Framework };
    chrome?: { cast?: ChromeCast };
  }
}

/** The SDK, loaded once a page; null where there's no Cast (anything but Chrome). */
let loading: Promise<{ framework: Framework; chromeCast: ChromeCast } | null> | null = null;
function loadSdk() {
  loading ??= new Promise((resolve) => {
    window.__onGCastApiAvailable = (available) => {
      const framework = window.cast?.framework;
      const chromeCast = window.chrome?.cast;
      if (!available || !framework || !chromeCast) return resolve(null);
      framework.CastContext.getInstance().setOptions({
        receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        // A page opened while this tab's origin is casting joins in (playing the next in a playlist, say).
        autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      resolve({ framework, chromeCast });
    };
    const script = document.createElement("script");
    script.src = SDK;
    script.async = true;
    script.onerror = () => resolve(null); // offline, or blocked
    document.head.append(script);
  });
  return loading;
}

type Options = {
  video: Video;
  /**
   * The element playing it here, if one is: the page's video, or in listen
   * mode the layer's audio. Paused while the TV plays, and (the video) back
   * where the TV was after.
   */
  local: () => HTMLMediaElement | null;
  /** Listen mode: the TV plays its audio alone (api/s/<token>/audio), and the page's play button isn't the TV's. */
  listen: boolean;
  /** Set while the TV plays it, so the page's own player doesn't save its (stale) place. */
  casting: RefObject<boolean>;
  /** The TV played it to the end. */
  onEnded: () => void;
  /** The TV took over (the local element paused by then), or handed back, at where it was (null: not known, or it ended). */
  onCasting?: (on: boolean, at: number | null) => void;
};

export type Cast = {
  /** A Cast device is around (so there's a button). */
  available: boolean;
  /** The device's name while casting to one. */
  device: string | null;
  /** The TV has it paused. */
  paused: boolean;
  error: string | null;
  /** Pick a device and play there, or stop casting. */
  toggle: () => void;
  /** Play or pause on the TV. */
  playOrPause: () => void;
};

/** Cast for the player: playing on the TV from where the page was, keeping the server told where it is, and back. */
export function useCast({ video: v, local: getLocal, listen, casting, onEnded, onCasting }: Options): Cast {
  const [available, setAvailable] = useState(false);
  const [device, setDevice] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sdk = useRef<Awaited<ReturnType<typeof loadSdk>>>(null);
  const remote = useRef<RemoteController | null>(null);
  // Read when they're needed, so the effect below doesn't start over for each render.
  const handlers = useRef({ getLocal, onEnded, onCasting });
  handlers.current = { getLocal, onEnded, onCasting };

  useEffect(() => {
    let gone = false;
    let remoteTime = -1;
    let lastSave = 0;
    let finished = false;
    let off = () => {};

    /** Play this video (or in listen mode its audio) on the session's device, unless it already is (a reload while casting). */
    const play = async (session: CastSession, s: NonNullable<typeof sdk.current>) => {
      const local = handlers.current.getLocal();
      const from = local && local.readyState >= 1 ? local.currentTime : v.position;
      casting.current = true;
      local?.pause();
      handlers.current.onCasting?.(true, from);
      setDevice(session.getCastDevice().friendlyName);
      setError(null);
      try {
        const share = await castShare(v.id);
        if (gone) return;
        const base = `${location.origin}/api/s/${share.token}`;
        const url = listen ? `${base}/audio` : `${base}/file`;
        if (session.getMediaSession()?.media?.contentId === url) return;
        const info = new s.chromeCast.media.MediaInfo(url, listen ? listenMime(v) : v.mime);
        const meta = new s.chromeCast.media.GenericMediaMetadata();
        meta.title = v.title;
        if (v.channel) meta.subtitle = v.channel;
        if (v.hasThumb) meta.images = [new s.chromeCast.Image(`${base}/thumb`)];
        info.metadata = meta;
        info.streamType = "BUFFERED";
        const request = new s.chromeCast.media.LoadRequest(info);
        request.currentTime = from;
        request.autoplay = true;
        finished = false;
        await session.loadMedia(request);
      } catch {
        if (!gone) setError("The TV couldn’t play it. Is this server reachable from it?");
      }
    };

    /** Casting ended: the page picks up where the TV was. */
    const back = () => {
      setDevice(null);
      if (!casting.current) return;
      casting.current = false;
      const at = finished ? null : remoteTime >= 0 ? remoteTime : null;
      const local = handlers.current.getLocal();
      if (local && at !== null) local.currentTime = at;
      handlers.current.onCasting?.(false, at);
    };

    void loadSdk().then((s) => {
      if (gone || !s) return;
      sdk.current = s;
      const { framework } = s;
      const context = framework.CastContext.getInstance();
      const onCastState = (e: CastEvent) => setAvailable(e.castState !== framework.CastState.NO_DEVICES_AVAILABLE);
      const onSession = (e: CastEvent) => {
        const session = context.getCurrentSession();
        if ((e.sessionState === framework.SessionState.SESSION_STARTED || e.sessionState === framework.SessionState.SESSION_RESUMED) && session) {
          void play(session, s);
        } else if (e.sessionState === framework.SessionState.SESSION_ENDED) back();
      };

      // Where the TV is: saved like the page's player saves, and the end counted.
      const player = new framework.RemotePlayer();
      const controller = new framework.RemotePlayerController(player);
      remote.current = controller;
      const onTime = () => {
        if (!casting.current || !player.duration) return;
        remoteTime = player.currentTime;
        if (Date.now() - lastSave >= SAVE_EVERY_MS) {
          lastSave = Date.now();
          void saveProgress(v.id, { position: remoteTime });
        }
      };
      const onState = () => {
        setPaused(player.playerState === "PAUSED");
        // IDLE near the end is the video finishing (stopping or a new load are IDLE too, elsewhere).
        if (!casting.current || finished || player.playerState !== "IDLE") return;
        if (player.duration && remoteTime >= player.duration - 2) {
          finished = true;
          void saveProgress(v.id, { position: 0, ended: true });
          handlers.current.onEnded();
        }
      };

      context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, onCastState);
      context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
      controller.addEventListener(framework.RemotePlayerEventType.CURRENT_TIME_CHANGED, onTime);
      controller.addEventListener(framework.RemotePlayerEventType.PLAYER_STATE_CHANGED, onState);
      off = () => {
        context.removeEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, onCastState);
        context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
        controller.removeEventListener(framework.RemotePlayerEventType.CURRENT_TIME_CHANGED, onTime);
        controller.removeEventListener(framework.RemotePlayerEventType.PLAYER_STATE_CHANGED, onState);
        remote.current = null;
      };

      setAvailable(context.getCastState() !== framework.CastState.NO_DEVICES_AVAILABLE);
      // Already casting (this page opened from another while it was): this video goes to the TV.
      const session = context.getCurrentSession();
      if (session) void play(session, s);

      // The page's play button, or K, while the TV plays: the TV's to play or pause.
      // (In listen mode the page has no element of its own: its controls say what they do.)
      const local = listen ? null : handlers.current.getLocal();
      const onLocalPlay = () => {
        if (!casting.current) return;
        local?.pause();
        controller.playOrPause();
      };
      local?.addEventListener("play", onLocalPlay);
      const unlisten = off;
      off = () => {
        unlisten();
        local?.removeEventListener("play", onLocalPlay);
      };
    });

    return () => {
      gone = true;
      off();
      // Leaving while the TV plays: it keeps playing, and the next page (if it's a player) takes over.
      // `casting` stays set, so the page's own last save (of its stale place) doesn't follow this one.
      if (casting.current && remoteTime >= 0 && !finished) void saveProgress(v.id, { position: remoteTime }, true);
    };
  }, [v.id, v.mime, v.audioCodec, v.videoCodec, v.title, v.channel, v.hasThumb, v.position, listen, casting]);

  const toggle = useCallback(() => {
    const s = sdk.current;
    if (!s) return;
    const context = s.framework.CastContext.getInstance();
    if (context.getCurrentSession()) context.endCurrentSession(true);
    else context.requestSession().catch(() => {}); // closing the picker is fine
  }, []);

  const playOrPause = useCallback(() => remote.current?.playOrPause(), []);

  return { available, device, paused, error, toggle, playOrPause };
}
