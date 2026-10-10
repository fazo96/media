import Link from "next/link";
import { IconBack, IconSettings } from "./icons";
import Logo from "./Logo";
import NowPlayingWidget from "./NowPlayingWidget";
import ThemeButton from "./ThemeButton";

type Props = {
  /** A back button instead of the wordmark: where to, and what it's called. */
  back?: { href: string; label: string; title: string };
  /** What the page is, beside the back button or the wordmark. */
  title?: string;
  /** A page outside the library (a share link's, the lock's): the wordmark leads nowhere, and there's no now playing. */
  standalone?: boolean;
  /** Settings' button, after the theme's (the library's top bar). */
  settings?: boolean;
  /** Between the wordmark and the right side (the library's search). */
  children?: React.ReactNode;
  /** On the right, after now playing (the library's storage meter). */
  right?: React.ReactNode;
};

/** Every page's top bar: back or the wordmark, the page's title, now playing and the theme. */
export default function Topbar({ back, title, standalone = false, settings = false, children, right }: Props) {
  const wordmark = (
    <>
      <Logo />
      <span>media</span>
    </>
  );
  return (
    <header className="topbar">
      {back ? (
        <Link href={back.href} className="icon-btn" aria-label={back.label} title={back.title}>
          <IconBack />
        </Link>
      ) : standalone ? (
        <span className="wordmark">{wordmark}</span>
      ) : (
        <Link href="/" className="wordmark" aria-label="media, the library">
          {wordmark}
        </Link>
      )}
      {title && <span className="topbar-title">{title}</span>}
      {children}
      <div className="topbar-right">
        {!standalone && <NowPlayingWidget />}
        {right}
        <ThemeButton />
        {settings && (
          <Link href="/settings" className="icon-btn" aria-label="Settings" title="Settings">
            <IconSettings />
          </Link>
        )}
      </div>
    </header>
  );
}

/** Back to the library. */
export const toLibrary = { href: "/", label: "Back to the library", title: "Library" };
