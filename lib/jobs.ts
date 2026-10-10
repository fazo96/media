import "server-only";
import { randomBytes } from "node:crypto";
import type { Job } from "./types";

// The jobs (docs/downloads.md): YouTube downloads and Transmission imports, in
// memory, as GET /api/jobs lists them. Each kind has a queue of its own that
// runs one job at a time. Jobs that end stay listed (done or failed) until
// dismissed or the server restarts; a restart drops them.

type State = { jobs: Map<string, Job>; aborts: Map<string, AbortController>; running: Set<Job["kind"]> };

// On globalThis so next dev's module reloads share one list.
const g = globalThis as { __mediaJobs?: State };
const state: State = (g.__mediaJobs ??= { jobs: new Map(), aborts: new Map(), running: new Set() });

export const listJobs = () => [...state.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
export const getJob = (id: string) => state.jobs.get(id) ?? null;

export const newJobId = () => randomBytes(8).toString("hex");

/** Cancel a job that's still going (or waiting), or forget one that ended. */
export function dismiss(id: string): boolean {
  const job = state.jobs.get(id);
  if (!job) return false;
  state.aborts.get(id)?.abort();
  state.jobs.delete(id);
  return true;
}

/**
 * A queue for one kind of job, run one at a time. `run` does a job: returning
 * is done, throwing is failed (with its message, or "Cancelled." once it was
 * dismissed, which aborts `signal`). `run` cleans up after itself.
 */
export function queue<K extends Job["kind"]>(kind: K, run: (job: Extract<Job, { kind: K }>, signal: AbortSignal) => Promise<void>) {
  type J = Extract<Job, { kind: K }>;
  async function pump() {
    if (state.running.has(kind)) return;
    state.running.add(kind);
    try {
      let job: J | undefined;
      while ((job = listJobs().find((j): j is J => j.kind === kind && j.state === "queued"))) {
        const abort = new AbortController();
        state.aborts.set(job.id, abort);
        try {
          await run(job, abort.signal);
          job.state = "done";
        } catch (err) {
          job.state = "failed";
          job.error = abort.signal.aborted ? "Cancelled." : (err as Error).message;
        } finally {
          job.converting = false;
          state.aborts.delete(job.id);
        }
      }
    } finally {
      state.running.delete(kind);
    }
  }
  /** List a job (queued) and get it going when its turn comes. */
  return (job: J): J => {
    state.jobs.set(job.id, job);
    void pump();
    return job;
  };
}
