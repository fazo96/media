# media as `next start` serves it: the build and its node_modules in
# lib/media, with yt-dlp and ffmpeg pinned in the wrapper. The library comes
# from MEDIA_DIR: lib/media is read-only.
{
  lib,
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  makeWrapper,
  yt-dlp,
  ffmpeg-headless,
}:

let
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.difference ../. (
      lib.fileset.unions [
        ../nix
        ../flake.nix
        ../flake.lock
        ../e2e
        ../tests
        ../docs
      ]
    );
  };
in
buildNpmPackage {
  pname = "media";
  version = (lib.importJSON ../package.json).version;
  inherit src;

  nodejs = nodejs_24;
  npmDeps = importNpmLock { npmRoot = src; };
  npmConfigHook = importNpmLock.npmConfigHook;

  nativeBuildInputs = [ makeWrapper ];

  env.NEXT_TELEMETRY_DISABLED = "1";

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-save
    mkdir -p $out/lib/media $out/bin
    cp -r .next node_modules public package.json next.config.ts $out/lib/media/
    rm -rf $out/lib/media/.next/cache

    makeWrapper ${lib.getExe nodejs_24} $out/bin/media \
      --chdir $out/lib/media \
      --add-flags $out/lib/media/node_modules/next/dist/bin/next \
      --add-flags start \
      --set-default NODE_ENV production \
      --set-default NEXT_TELEMETRY_DISABLED 1 \
      --set-default MEDIA_YTDLP ${lib.getExe yt-dlp} \
      --set-default MEDIA_FFMPEG ${ffmpeg-headless}/bin/ffmpeg \
      --set-default MEDIA_FFPROBE ${ffmpeg-headless}/bin/ffprobe

    runHook postInstall
  '';

  meta = {
    description = "A local library of the videos you watch again";
    homepage = "https://github.com/fazo96/media";
    license = lib.licenses.agpl3Plus;
    mainProgram = "media";
  };
}
