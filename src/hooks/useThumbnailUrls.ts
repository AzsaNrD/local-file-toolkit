"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One object URL per file id, created when an id first appears and revoked
 * as soon as it disappears from `items` (or the component unmounts):
 * a preview thumbnail should never outlive the file it points to.
 */
export function useThumbnailUrls(items: { id: string; file: File }[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef(urls);

  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);

  useEffect(() => {
    // Object URLs are a browser-side resource (like a subscription), not
    // derivable state: allocating/revoking them is the actual synchronization
    // this effect exists to do, so the setState here is unavoidable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls((prev) => {
      const currentIds = new Set(items.map((item) => item.id));
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          URL.revokeObjectURL(next[id]);
          delete next[id];
          changed = true;
        }
      }
      for (const item of items) {
        if (!next[item.id]) {
          next[item.id] = URL.createObjectURL(item.file);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  return urls;
}
