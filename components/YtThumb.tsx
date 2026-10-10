import { ytThumb } from "@/lib/urls";

/** YouTube's still for a video not in the library; gone (leaving what's behind it) if YouTube has none. */
export default function YtThumb({ id }: { id: string }) {
  return <img src={ytThumb(id)} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />;
}
