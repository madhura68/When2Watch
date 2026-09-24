"use client";
import { useState } from "react";

function PosterImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? "TV" : <img src={src} alt="" width={80} height={112} loading="lazy" decoding="async"
    ref={image => { if (image?.complete && image.naturalWidth === 0) setFailed(true); }}
    onError={() => setFailed(true)} />;
}

export function SeriesPoster({ src }: { src: string | null }) {
  return <span className="series-poster" aria-hidden="true">{src ? <PosterImage key={src} src={src} /> : "TV"}</span>;
}
