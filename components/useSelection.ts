"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Videos picked for a bulk action, by id. `order` is the order they show in,
 * for a Shift-click's range (from the last one picked to this one). Ids that
 * leave `present` (deleted, here or elsewhere) drop out.
 */
export function useSelection(order: string[], present: string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    const ids = new Set(present);
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [present]);

  /** Pick it or put it back; with `range`, everything from the last one picked takes this one's new state too. */
  const toggle = useCallback(
    (id: string, range = false) => {
      // Read now: React may run the update after the anchor has moved on.
      const from = range && anchor.current ? order.indexOf(anchor.current) : -1;
      const to = order.indexOf(id);
      const ids = from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
      setSelected((s) => {
        const on = !s.has(id);
        const next = new Set(s);
        for (const i of ids) {
          if (on) next.add(i);
          else next.delete(i);
        }
        return next;
      });
      anchor.current = id;
    },
    [order],
  );

  /** Exactly these. */
  const set = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
    anchor.current = null;
  }, []);

  return { selected, toggle, set };
}
