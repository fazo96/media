"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatSize } from "@/lib/format";
import type { DiskUsage } from "@/lib/types";

/** Under this share of the disk free, the meter warns. */
const LOW = 0.05;

const share = (n: number, s: DiskUsage) => `${s.total > 0 ? Math.min(100, Math.max(0, (n / s.total) * 100)) : 0}%`;

export const isLow = (s: DiskUsage) => s.total > 0 && s.free / s.total < LOW;

/** "Library 312 GB (+40 GB in the trash) · 1.1 TB free of 4 TB" */
export function describeStorage(s: DiskUsage): string {
  const trash = s.trash > 0 ? ` (+${formatSize(s.trash)} in the trash)` : "";
  return `Library ${formatSize(s.library)}${trash} · ${formatSize(s.free)} free of ${formatSize(s.total)}`;
}

/** The disk as a bar: the library (and its trash), everything else on it, and what's free. */
export function StorageBar({ storage: s }: { storage: DiskUsage }) {
  const other = Math.max(0, s.total - s.free - s.library - s.trash);
  return (
    <span className="storage-bar" aria-hidden="true">
      <span className="storage-library" style={{ width: share(s.library + s.trash, s) }} />
      <span className="storage-other" style={{ width: share(other, s) }} />
    </span>
  );
}

/**
 * The topbar's meter, to Settings' DiskUsage section. `watch` changes when the
 * videos do (one added, one deleted): then it asks again.
 */
export default function StorageMeter({ initial, watch }: { initial: DiskUsage; watch: string }) {
  const [storage, setStorage] = useState(initial);
  const first = useRef(true);
  // Not on mount: the page brought it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    api<DiskUsage>("/api/storage").then(setStorage, () => {});
  }, [watch]);

  const text = describeStorage(storage);
  return (
    <Link href="/settings#storage" className={`storage ${isLow(storage) ? "is-low" : ""}`} title={text} aria-label={text}>
      <StorageBar storage={storage} />
      <span className="storage-text">
        {formatSize(storage.library)} · {formatSize(storage.free)} free
      </span>
    </Link>
  );
}
