"use client";

import { useContext } from "react";
import { CapabilitiesContext } from "@/context/CapabilitiesProvider";

export function useCapabilities() {
  return useContext(CapabilitiesContext);
}
