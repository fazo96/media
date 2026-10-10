// Stands in for yt-dlp in the browser tests (MEDIA_YTDLP): "downloads" the
// fixture clip, printing progress the way lib/downloads.ts asks for it, so
// nothing reaches YouTube. Video id "unavailable" fails like a removed video.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const id = args.at(-1);

// A search ("ytsearchN:<query>") finds three videos named after the query, the
// first with the id "s" + the query (padded to 11 characters), and a live
// stream that has to be left out. Query "nothing" finds nothing.
const search = /^ytsearch\d*:(.*)$/s.exec(id);
if (search) {
  const query = search[1];
  if (query !== "nothing") {
    const base = `s${query.replace(/[^A-Za-z0-9]/g, "")}`.padEnd(10, "0").slice(0, 10);
    for (const [n, duration] of [[1, 30], [2, 95], [3, 4000], [4, null]]) {
      console.log(JSON.stringify({ _type: "url", ie_key: "Youtube", id: `${base}${n}`, title: `Found ${query} ${n}`, channel: "Stub channel", duration, view_count: 1234 * n }));
    }
  }
  process.exit(0);
}

// A playlist search (YouTube's results page) finds two playlists named after
// the query, with the ids "PL" + the query; query "nothing" finds none.
if (id.startsWith("https://www.youtube.com/results?")) {
  const query = new URL(id).searchParams.get("search_query") ?? "";
  if (query !== "nothing") {
    for (const n of [1, 2]) {
      console.log(JSON.stringify({ _type: "url", ie_key: "YoutubeTab", id: `PL${query.replace(/[^A-Za-z0-9]/g, "")}${n}`, title: `List ${query} ${n}`, channel: "Stub channel" }));
    }
  }
  process.exit(0);
}

// A playlist (…/playlist?list=<id>) holds three videos, "p" + the id's last
// nine characters + 1, 2 and 3, and a private video that has to be left out.
// A list id ending in "missing" doesn't exist.
if (id.includes("/playlist?list=")) {
  const list = new URL(id).searchParams.get("list");
  if (list.endsWith("missing")) {
    console.error(`ERROR: [youtube:tab] ${list}: The playlist does not exist.`);
    process.exit(1);
  }
  const base = list.replace(/[^A-Za-z0-9]/g, "").slice(-9).padStart(9, "0");
  const entries = [1, 2, 3].map((n) => ({ _type: "url", ie_key: "Youtube", id: `p${base}${n}`, title: `Listed ${list} ${n}`, channel: "Stub channel", duration: 30 }));
  entries.splice(1, 0, { _type: "url", ie_key: "Youtube", id: "privatevid0", title: "[Private video]", duration: null });
  console.log(JSON.stringify({ _type: "playlist", id: list, title: `Stub playlist ${list}`, channel: "Stub channel", entries }));
  process.exit(0);
}

const outputs = [];
for (let i = 0; i < args.length; i++) if (args[i] === "-o") outputs.push(args[i + 1]);
const videoTemplate = outputs.find((o) => !/^\w+:/.test(o));
const dir = path.dirname(videoTemplate);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (id === "unavailable") {
  console.error(`ERROR: [youtube] ${id}: Video unavailable`);
  process.exit(1);
}

const fixture = path.resolve(import.meta.dirname, "../tests/fixtures/clip.mp4");
const size = fs.statSync(fixture).size;
for (let i = 1; i <= 4; i++) {
  console.log(`media-progress ${Math.round((size * i) / 4)} ${size} NA 100000 ${4 - i}`);
  await sleep(250);
}
fs.copyFileSync(fixture, path.join(dir, "video.mp4"));
fs.writeFileSync(path.join(dir, "info.info.json"), JSON.stringify({ title: `Stub video ${id}`, channel: "Stub channel" }));
