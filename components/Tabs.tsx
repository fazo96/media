"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDownload, IconFilm, IconPlaylist, IconSearch } from "./icons";

/** `transmission`: importing from Transmission is set up, so it has a tab. */
type Props = { transmission: boolean };

/** The app's sections, under the top bar of each: the library, the playlists, YouTube, Transmission. */
export default function Tabs({ transmission }: Props) {
  const here = usePathname();
  const tabs = [
    { href: "/", label: "Library", icon: <IconFilm /> },
    { href: "/playlists", label: "Playlists", icon: <IconPlaylist /> },
    { href: "/search", label: "Search", icon: <IconSearch /> },
    ...(transmission ? [{ href: "/transmission", label: "Transmission", icon: <IconDownload /> }] : []),
  ];
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="tab" aria-current={here === t.href ? "page" : undefined}>
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
