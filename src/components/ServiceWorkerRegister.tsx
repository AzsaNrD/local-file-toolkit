"use client";

import { useEffect } from "react";

/**
 * Production builds register the offline service worker. Any other build removes it: a
 * worker left over from an earlier production run on the same address would otherwise serve
 * old files to a development server.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration can fail in private windows; the app works the same without it.
      });
      return;
    }

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => caches.keys())
      .then((names) =>
        Promise.all(names.filter((name) => name.startsWith("local-file-toolkit-")).map((name) => caches.delete(name))),
      )
      .catch(() => {});
  }, []);

  return null;
}
