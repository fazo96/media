// Stands in for YouTube's oEmbed (MEDIA_YOUTUBE_OEMBED) in the browser tests,
// for the preview page's title and channel: any video is "Stub video <id>"
// by "Stub channel", like e2e/stub-yt-dlp.mjs's downloads; id "noEmbed0001"
// is one whose owner turned embedding off (401, as YouTube answers).
//
// Run alone: node e2e/stub-oembed.mjs <port>
import http from "node:http";

const port = Number(process.argv[2]);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const id = new URL(url.searchParams.get("url") ?? "https://www.youtube.com/watch").searchParams.get("v");
    if (url.pathname !== "/oembed" || !id) return res.writeHead(404).end("Not Found");
    if (id === "noEmbed0001") return res.writeHead(401).end("Unauthorized");
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ title: `Stub video ${id}`, author_name: "Stub channel", type: "video" }));
  })
  .listen(port, "127.0.0.1", () => console.log(`stub oEmbed at http://127.0.0.1:${port}/oembed`));
