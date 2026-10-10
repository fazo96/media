import "server-only";
import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import type { ToolStatus } from "./types";

// The programs media runs: yt-dlp to download, ffmpeg and ffprobe to read,
// remux and take thumbnails. Each comes from its MEDIA_* variable (a command
// line, split on spaces), else from PATH, else, where nix is installed, from
// nixpkgs through `nix shell` (slow the first time, while nix fetches it).

type Tool = "yt-dlp" | "ffmpeg" | "ffprobe";

const ENV: Record<Tool, string> = { "yt-dlp": "MEDIA_YTDLP", ffmpeg: "MEDIA_FFMPEG", ffprobe: "MEDIA_FFPROBE" };
const NIX_PACKAGE: Record<Tool, string> = { "yt-dlp": "yt-dlp", ffmpeg: "ffmpeg-headless", ffprobe: "ffmpeg-headless" };

async function onPath(name: string): Promise<string | null> {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {}
  }
  return null;
}

const resolved = new Map<Tool, Promise<string[] | null>>();

/** The command line that runs `tool`, or null when there's no way to. */
export function command(tool: Tool): Promise<string[] | null> {
  let found = resolved.get(tool);
  if (!found) {
    found = (async () => {
      const env = process.env[ENV[tool]]?.trim();
      if (env) return env.split(/\s+/);
      const bin = await onPath(tool);
      if (bin) return [bin];
      const nix = await onPath("nix");
      if (nix) return [nix, "shell", `nixpkgs#${NIX_PACKAGE[tool]}`, "--command", tool];
      return null;
    })();
    resolved.set(tool, found);
  }
  return found;
}

export class ToolError extends Error {}

type RunOpts = { signal?: AbortSignal; onLine?: (line: string) => void };

/** Run `tool` with `args`; its stdout, or a ToolError with the end of stderr. */
export async function run(tool: Tool, args: string[], { signal, onLine }: RunOpts = {}): Promise<string> {
  const cmd = await command(tool);
  if (!cmd) throw new ToolError(`${tool} isn’t installed (set ${ENV[tool]}, or put it on PATH).`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd[0], [...cmd.slice(1), ...args], { stdio: ["ignore", "pipe", "pipe"], signal });
    let out = "";
    let err = "";
    let partial = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      out += chunk;
      if (!onLine) return;
      const lines = (partial + chunk).split(/\r?\n|\r/);
      partial = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      err = (err + chunk).slice(-8000);
    });
    child.on("error", (e) => reject(e.name === "AbortError" ? e : new ToolError(`${tool}: ${e.message}`)));
    child.on("close", (code) => {
      if (partial && onLine) onLine(partial);
      if (code === 0) resolve(out);
      else reject(new ToolError(lastError(err) || `${tool} exited with code ${code}`));
    });
  });
}

/** The most telling line of a tool's stderr: its last ERROR, else its last line. */
export function lastError(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors = lines.filter((l) => /^ERROR:/i.test(l));
  return (errors.at(-1) ?? lines.at(-1) ?? "").replace(/^ERROR:\s*/i, "").slice(0, 500);
}

/** What Settings shows: each tool, how it runs, and its version. */
export async function toolStatus(): Promise<ToolStatus[]> {
  const versionArgs: Record<Tool, string[]> = { "yt-dlp": ["--version"], ffmpeg: ["-version"], ffprobe: ["-version"] };
  return Promise.all(
    (["yt-dlp", "ffmpeg", "ffprobe"] as Tool[]).map(async (name) => {
      const cmd = await command(name);
      if (!cmd) return { name, command: null };
      try {
        const out = await run(name, versionArgs[name], { signal: AbortSignal.timeout(120_000) });
        const first = out.split("\n")[0].trim();
        return { name, command: cmd, version: first.replace(/^ff\w+ version (\S+).*/, "$1") };
      } catch (err) {
        return { name, command: cmd, error: (err as Error).message };
      }
    }),
  );
}
