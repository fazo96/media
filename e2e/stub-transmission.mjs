// Stands in for Transmission's RPC (MEDIA_TRANSMISSION_URL) in the unit and
// browser tests: torrents whose "downloaded" files are copies of the fixture
// clip under `root`, reported as Transmission in a container would, under
// /downloads (so MEDIA_TRANSMISSION_PATHS has to map them). It asks for the
// session id the way Transmission does (409 first). torrent-remove with
// delete-local-data deletes the files. `stub-reset` (not Transmission's) puts
// everything back, so tests don't depend on each other; `stub-removed` lists
// what was removed.
//
// Run alone: node e2e/stub-transmission.mjs <port> <root>
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../tests/fixtures/clip.mp4", import.meta.url));
const SESSION = "stub-session-id";
export const DOWNLOAD_DIR = "/downloads/complete";

/** The torrents: `done` is how much of each file is downloaded (0–1). */
const TORRENTS = [
  { hash: "a".repeat(40), name: "Stub.Movie.2020.1080p.mp4", added: 3, files: [{ name: "Stub.Movie.2020.1080p.mp4", done: 1 }] },
  {
    hash: "b".repeat(40),
    name: "Stub Series",
    added: 2,
    files: [
      { name: "Stub Series/Episode 1.mp4", done: 1 },
      { name: "Stub Series/Episode 2.mp4", done: 1 },
      { name: "Stub Series/Episode 3.mp4", done: 0.4 },
      { name: "Stub Series/notes.nfo", done: 1 },
    ],
  },
  { hash: "c".repeat(40), name: "Not a video.pdf", added: 1, files: [{ name: "Not a video.pdf", done: 1 }] },
  // Finished, but its file is gone from disk.
  { hash: "d".repeat(40), name: "Missing.mp4", added: 0, files: [{ name: "Missing.mp4", done: 1, missing: true }] },
];

export function startStub({ port = 0, root }) {
  const size = fs.statSync(FIXTURE).size;
  let torrents = [];
  let removed = [];

  const reset = () => {
    fs.rmSync(root, { recursive: true, force: true });
    torrents = structuredClone(TORRENTS);
    removed = [];
    for (const t of torrents) {
      for (const f of t.files) {
        if (f.missing) continue;
        const file = path.join(root, "complete", f.name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.copyFileSync(FIXTURE, file);
      }
    }
  };
  reset();

  const raw = (t) => ({
    hashString: t.hash,
    name: t.name,
    downloadDir: DOWNLOAD_DIR,
    addedDate: 1_700_000_000 + t.added,
    totalSize: size * t.files.length,
    percentDone: t.files.reduce((s, f) => s + f.done, 0) / t.files.length,
    files: t.files.map((f) => ({ name: f.name, length: size, bytesCompleted: Math.floor(size * f.done) })),
    wanted: t.files.map(() => 1),
  });

  const call = ({ method, arguments: args = {} }) => {
    if (method === "torrent-get") {
      const ids = args.ids;
      return { torrents: torrents.filter((t) => !ids || ids.includes(t.hash)).map(raw) };
    }
    if (method === "torrent-remove") {
      for (const t of torrents.filter((t) => args.ids.includes(t.hash))) {
        removed.push({ hash: t.hash, deleteLocalData: args["delete-local-data"] === true });
        if (args["delete-local-data"]) {
          const top = t.files[0].name.split("/")[0];
          fs.rmSync(path.join(root, "complete", top), { recursive: true, force: true });
        }
      }
      torrents = torrents.filter((t) => !args.ids.includes(t.hash));
      return {};
    }
    if (method === "stub-reset") {
      reset();
      return {};
    }
    if (method === "stub-removed") return { removed };
    return null;
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.headers["x-transmission-session-id"] !== SESSION) {
        res.writeHead(409, { "X-Transmission-Session-Id": SESSION }).end("<h1>409: Conflict</h1>");
        return;
      }
      let result;
      try {
        result = call(JSON.parse(body));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result: String(err.message) }));
        return;
      }
      const answer = result ? { result: "success", arguments: result } : { result: "method name not recognized" };
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(answer));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/transmission/rpc`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [port, root] = process.argv.slice(2);
  const { url } = await startStub({ port: Number(port), root: path.resolve(root) });
  console.log(`stub Transmission at ${url}`);
}
