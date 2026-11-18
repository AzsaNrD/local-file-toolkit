"use client";

import { useCallback, useRef, useState } from "react";
import { toAppError } from "@/lib/errors";
import type { OutputFile, RunState } from "@/lib/types";

const IDLE_STATE: RunState = {
  status: "idle",
  progress: null,
  detail: null,
  outputs: [],
  error: null,
  elapsedMs: null,
};

/** The one run-state machine every tool page uses (PRD Section 7.2). */
export function useToolRun() {
  const [state, setState] = useState<RunState>(IDLE_STATE);
  const runId = useRef(0);

  const setProgress = useCallback((progress: number | null, detail?: string) => {
    setState((current) => ({
      ...current,
      progress,
      // Calls that only report a percentage leave the batch readout as it was.
      detail: detail === undefined ? current.detail : detail,
    }));
  }, []);

  const run = useCallback(
    async (
      task: (setProgress: (progress: number | null, detail?: string) => void) => Promise<OutputFile[]>,
    ) => {
      const thisRun = ++runId.current;
      const startedAt = performance.now();
      setState({ status: "running", progress: null, detail: null, outputs: [], error: null, elapsedMs: null });

      try {
        const outputs = await task(setProgress);
        if (runId.current !== thisRun) return; // superseded by a reset() or a newer run
        setState({
          status: "success",
          progress: 100,
          detail: null,
          outputs,
          error: null,
          elapsedMs: performance.now() - startedAt,
        });
      } catch (thrown) {
        if (runId.current !== thisRun) return;
        setState({
          status: "error",
          progress: null,
          detail: null,
          outputs: [],
          error: toAppError(thrown),
          elapsedMs: null,
        });
      }
    },
    [setProgress],
  );

  const reset = useCallback(() => {
    runId.current += 1;
    setState(IDLE_STATE);
  }, []);

  return { ...state, run, reset };
}
