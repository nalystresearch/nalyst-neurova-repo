import { useEffect, useState } from "react";
import { getImageBlob } from "../api";

const urlCache = new Map<number, string>();
const inflight = new Map<number, Promise<string>>();

function blobToObjectUrl(imageId: number, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urlCache.set(imageId, url);
  return url;
}

async function loadUrl(imageId: number): Promise<string> {
  const cached = urlCache.get(imageId);
  if (cached) return cached;

  const pending = inflight.get(imageId);
  if (pending) return pending;

  const promise = (async () => {
    const blob = await getImageBlob(imageId);
    return blobToObjectUrl(imageId, blob);
  })().finally(() => {
    inflight.delete(imageId);
  });

  inflight.set(imageId, promise);
  return promise;
}

export function revokeImageUrl(imageId: number) {
  const existing = urlCache.get(imageId);
  if (existing) {
    URL.revokeObjectURL(existing);
    urlCache.delete(imageId);
  }
}

export default function useImageUrl(imageId: number | null | undefined) {
  const [url, setUrl] = useState<string>(
    imageId ? (urlCache.get(imageId) ?? "") : "",
  );

  useEffect(() => {
    let cancelled = false;
    if (!imageId) {
      setUrl("");
      return;
    }

    const cached = urlCache.get(imageId);
    if (cached) {
      setUrl(cached);
      return;
    }

    void loadUrl(imageId).then((u) => {
      if (!cancelled) setUrl(u);
    });

    return () => {
      cancelled = true;
    };
  }, [imageId]);

  return url;
}
