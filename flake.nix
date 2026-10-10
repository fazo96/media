{
  description = "media: a local library of the videos you watch again";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      # Node for Next.js; yt-dlp downloads from YouTube, ffmpeg merges its
      # streams and makes thumbnails (ffprobe reads a video's details).
      tools = pkgs: [
        pkgs.nodejs_24
        pkgs.yt-dlp
        pkgs.ffmpeg-headless
      ];
    in
    {
      packages = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system: rec {
        media = nixpkgs.legacyPackages.${system}.callPackage ./nix/package.nix { };
        default = media;
      });

      nixosModules.default = import ./nix/module.nix { inherit self; };

      devShells = forAllSystems (
        pkgs:
        {
          default = pkgs.mkShell {
            packages = tools pkgs;
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
            '';
          };
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          # The browser tests (npm run test:e2e): the same, plus a Chromium for
          # Playwright, since the browsers it downloads don't run on NixOS.
          e2e = pkgs.mkShell {
            packages = tools pkgs ++ [ pkgs.chromium ];
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              export MEDIA_E2E_CHROMIUM=${pkgs.chromium}/bin/chromium
            '';
          };
        }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
