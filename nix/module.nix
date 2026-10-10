# services.media: media as a systemd service.
{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.media;
in
{
  options.services.media = {
    enable = lib.mkEnableOption "media, a local library of the videos you watch again";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage "${self}/nix/package.nix" { };
      defaultText = lib.literalExpression "media built with the system's nixpkgs";
      description = "The media package. Override its yt-dlp when YouTube downloads break.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address to listen on.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3300;
      description = "Port to listen on.";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/media";
      description = "The library: videos, thumbnails, playlists, the lock (MEDIA_DIR).";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "media";
      description = "User to run as. `media` is created when left as is.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "media";
      description = "Group to run as. `media` is created when left as is.";
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = {
        MEDIA_MAX_HEIGHT = "720";
      };
      description = "Extra environment variables.";
    };
  };

  config = lib.mkIf cfg.enable {
    users.users = lib.mkIf (cfg.user == "media") {
      media = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.dataDir;
      };
    };
    users.groups = lib.mkIf (cfg.group == "media") { media = { }; };

    systemd.tmpfiles.settings."10-media".${cfg.dataDir}.d = {
      inherit (cfg) user group;
      mode = "0755";
    };

    systemd.services.media = {
      description = "media";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      unitConfig.RequiresMountsFor = [ cfg.dataDir ];

      environment = {
        MEDIA_DIR = cfg.dataDir;
        # yt-dlp's cache, and deno's for YouTube's challenges: home is off limits.
        XDG_CACHE_HOME = "/var/cache/media";
      }
      // cfg.environment;

      serviceConfig = {
        ExecStart = "${lib.getExe cfg.package} --hostname ${cfg.host} --port ${toString cfg.port}";
        User = cfg.user;
        Group = cfg.group;
        Restart = "on-failure";
        RestartSec = 5;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ cfg.dataDir ];
        CacheDirectory = "media";
      };
    };
  };
}
