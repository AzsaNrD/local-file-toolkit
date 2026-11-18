"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const PREFIX = "local-file-toolkit:";

/**
 * useState that remembers its value in this browser's localStorage, for the options a person
 * tends to repeat from one visit to the next. Nothing leaves the browser. The first render
 * always uses `initial`, so server and client markup match; the saved value arrives right
 * after. `isValid` drops a saved value that no longer fits, e.g. an option that was removed.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T = (value): value is T => typeof value === typeof initial,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        // Reading browser storage after mount is the synchronization this hook exists for.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (isValid(parsed)) setValue(parsed);
      }
    } catch {
      // Storage blocked or the saved text is not JSON: start from the default.
    }
    setReady(true);
    // `isValid` is a plain function the caller may recreate every render; the saved value is read once per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Private window or full storage: the option still works, it just is not remembered.
    }
  }, [key, value, ready]);

  return [value, setValue];
}

/** Validator for a setting that must be one of a fixed set of strings. */
export function oneOf<T extends string>(values: readonly T[]): (value: unknown) => value is T {
  return (value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Validator for a saved colour picker value. */
export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
