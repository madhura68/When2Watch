"use client";

import { useCallback, useState } from "react";

const fallback = "/images/when2watch-banner.svg";
function BannerImage({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && url ? url : fallback;
  const ref = useCallback((image: HTMLImageElement | null) => {
    // A cached failure can finish before hydration attaches onError.
    if (url && image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [url]);
  return <img ref={ref} src={src} alt="" width={900} height={180} loading="lazy" decoding="async"
    onError={() => { if (src !== fallback) setFailed(true); }} />;
}

export function SeriesBanner({ url = null }: { url?: string | null }) {
  return <div className="series-banner" aria-hidden="true">
    <BannerImage key={url} url={url} />
  </div>;
}
