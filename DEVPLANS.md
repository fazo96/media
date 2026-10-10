# Dev plans

What's next, roughly in order. Each gets planned properly before it starts.

- [x] **Refactor pass**: clean the codebase up before any of the below.
- [x] **List view**: the library as a list (title, channel or artist, duration, added, plays), beside the grid, remembered per device.
- [x] **Multi-select**: pick several videos at once to add them to a playlist in bulk.
- [x] **Playlists page**: playlists get their own page instead of a shelf on the library.
- [x] **Search page**: YouTube search (and its playlist previews) on its own page instead of above the library.
- [x] **Preview before downloading**: watch or listen to a YouTube video or a torrent's file before adding it to the library.
- [x] **Choose playlists when adding**: pick the playlists a video goes into as it's added (download, import, upload).
- [x] **"Add as Music"**: add something (a YouTube video, say) as music rather than as a video.
- [x] **`/watch?v=` URLs**: answer YouTube's own paths, so a YouTube link can be redirected to this app.
- [ ] **Queue**: a play queue (play next, add to queue, reorder, clear), in the now playing layer.
- [ ] **Transcoding**: controls to convert files that aren't in ideal codecs (mainly ones a browser can't play, e.g. HEVC, MPEG-4 Part 2), as jobs with progress.
- [ ] **File hygiene page**: a page listing files with problems (unplayable codecs, missing stills, missing metadata…) and what to do about each.
- [ ] **Metadata**: edit a video's or track's metadata (title, artist, album, cover…) by hand.
- [ ] **Metadata fetching**: fill metadata in automatically from online APIs (e.g. MusicBrainz / Cover Art Archive for music, TMDB for films).
- [ ] **Spotify as a source**: find and add music through Spotify instead of YouTube.
- [ ] **Content-aware search**: search the library by what's in it, not just titles, using embeddings from the EmbeddingGemma 2 model.
- [ ] **AI help**: an assistant built in to help manage the library (tidy titles, sort into playlists, find duplicates…).
