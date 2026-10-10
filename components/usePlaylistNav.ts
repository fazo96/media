"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { neighbours, type Video } from "@/lib/types";
import { playerHref } from "@/lib/urls";
import type { Queue } from "./NowPlaying";

/** In a playlist, how long "Up next" waits before playing it. */
const UP_NEXT_S = 5;

/**
 * The player page within a playlist (?list=): the ones either side, going to
 * them, and at the end "Up next" counting down to the next one. The
 * functions it hands back don't change, so listeners set up once can call them.
 */
export function usePlaylistNav(playlist: Queue | undefined, id: string) {
  const router = useRouter();
  const { index, previous, next } = playlist ? neighbours(playlist.videos, id) : { index: -1 };
  const hrefOf = (o: Video) => playerHref(o.id, playlist?.id);
  // The seconds left before the next one plays (null: not counting).
  const [upNext, setUpNext] = useState<number | null>(null);
  const to = useRef({ next: "", previous: "" });
  to.current = { next: next ? hrefOf(next) : "", previous: previous ? hrefOf(previous) : "" };

  useEffect(() => {
    if (upNext === null) return;
    if (upNext <= 0) {
      if (to.current.next) router.push(to.current.next);
      return;
    }
    const timer = setTimeout(() => setUpNext((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [upNext, router]);

  const goNext = useCallback(() => to.current.next && router.push(to.current.next), [router]);
  const goPrevious = useCallback(() => to.current.previous && router.push(to.current.previous), [router]);
  /** It ended: count down to the next one, if there is one. */
  const countDown = useCallback(() => to.current.next && setUpNext(UP_NEXT_S), []);
  const cancel = useCallback(() => setUpNext(null), []);

  return { index, previous, next, hrefOf, upNext, goNext, goPrevious, countDown, cancel };
}
