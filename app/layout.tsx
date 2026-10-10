import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
// Fonts from npm (@fontsource-variable) rather than next/font/google, so a build
// never has to reach Google; the families are named in styles/base.css.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
// The styles, one file per part of the app. Order matters (later rules win
// ties), so keep it: base, then the shared controls, then the pages.
import "./styles/base.css";
import "./styles/controls.css";
import "./styles/library.css";
import "./styles/playlists.css";
import "./styles/transmission.css";
import "./styles/player.css";
import "./styles/settings.css";

export const metadata: Metadata = {
  title: "media",
  description: "The videos you watch again, kept here.",
  appleWebApp: { capable: true, title: "media", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1ede6" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

// Runs before paint so a stored theme never flashes the wrong one.
const themeScript = `try{var t=localStorage.getItem("media:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script of ours, run before paint so the theme doesn't flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
