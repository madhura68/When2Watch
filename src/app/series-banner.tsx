"use client";

import { useCallback, useState } from "react";

const fallback = "/images/when2watch-banner.svg";
type Artwork = { url: string; kind: "banner" | "background" | "poster" | "general" };
type Props = { bannerUrl: string | null; backgroundUrl: string | null; poster: string | null };

function BannerImage({ candidates }: { candidates: Artwork[] }) {
  const [index, setIndex] = useState(0);
  const candidate = candidates[index];
  // A cached failure and onError can report the same failed image.
  const advance = useCallback(() => setIndex(current => current === index ? current + 1 : current), [index]);
  const ref = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) advance();
  }, [advance]);
  if (!candidate) return null;
  return <img key={candidate.url} ref={ref} src={candidate.url} className={`series-artwork-${candidate.kind}`}
    alt="" width={900} height={180} loading="lazy" decoding="async" onError={advance} />;
}

export function SeriesBanner({ bannerUrl, backgroundUrl, poster }: Props) {
  const seen = new Set<string>();
  const options: { url: string | null; kind: Artwork["kind"] }[] = [
    { url: bannerUrl, kind: "banner" }, { url: backgroundUrl, kind: "background" },
    { url: poster, kind: "poster" }, { url: fallback, kind: "general" },
  ];
  const candidates = options.filter((candidate): candidate is Artwork => {
    if (!candidate.url || seen.has(candidate.url)) return false;
    seen.add(candidate.url); return true;
  });
  return <div className="series-banner" aria-hidden="true">
    <BannerImage key={JSON.stringify(candidates)} candidates={candidates} />
  </div>;
}
