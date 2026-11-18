"use client";

import { createContext, useEffect, useState } from "react";
import type { Capabilities } from "@/lib/types";

const DEFAULT_CAPABILITIES: Capabilities = {
  libreoffice: { available: false, version: null, path: null },
  ghostscript: { available: false, version: null, path: null },
  word: { available: false, version: null, path: null },
};

export interface CapabilitiesContextValue {
  capabilities: Capabilities;
  /** True until the one-time fetch on load (PRD Section 4.3) resolves. */
  loading: boolean;
}

export const CapabilitiesContext = createContext<CapabilitiesContextValue>({
  capabilities: DEFAULT_CAPABILITIES,
  loading: true,
});

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<CapabilitiesContextValue>({
    capabilities: DEFAULT_CAPABILITIES,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities")
      .then((response) => response.json())
      .then((capabilities: Capabilities) => {
        if (!cancelled) setValue({ capabilities, loading: false });
      })
      .catch(() => {
        if (!cancelled) setValue({ capabilities: DEFAULT_CAPABILITIES, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}
