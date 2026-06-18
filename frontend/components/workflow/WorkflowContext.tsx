"use client";

import { createContext, useContext } from "react";
import type { NodeResult, RunStatus } from "@/lib/workflow/engine";

export type NodeRunInfo = {
  status: RunStatus;
  result?: NodeResult;
  error?: string;
  // True when this result was reused from cache (no GPU call this run).
  cached?: boolean;
};

export type WorkflowRuntime = {
  runState: Record<string, NodeRunInfo>;
  // Merge a partial patch into a node's data (config edits + upload results).
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  // Remove a node (and its edges) from the canvas.
  deleteNode: (id: string) => void;
  // Run a single node + just the upstream nodes it depends on.
  runNode: (id: string) => void;
  // True while a run is in progress — nodes disable their inputs.
  running: boolean;
};

const WorkflowRuntimeContext = createContext<WorkflowRuntime | null>(null);

export const WorkflowRuntimeProvider = WorkflowRuntimeContext.Provider;

export function useWorkflowRuntime(): WorkflowRuntime {
  const ctx = useContext(WorkflowRuntimeContext);
  if (!ctx) {
    throw new Error("useWorkflowRuntime must be used inside the workflow canvas");
  }
  return ctx;
}

export function useNodeRunInfo(id: string): NodeRunInfo {
  const { runState } = useWorkflowRuntime();
  return runState[id] ?? { status: "idle" };
}
