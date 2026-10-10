// Stands in for yt-dlp in the browser tests (MEDIA_YTDLP): "downloads" the
// fixture clip, printing progress the way lib/downloads.ts asks for it, so
// nothing reaches YouTube. Video id "unavailable" fails like a removed video.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const id = args.at(-1);
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
