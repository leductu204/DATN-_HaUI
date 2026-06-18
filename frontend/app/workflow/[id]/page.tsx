"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Workflow } from "@/lib/types";
import WorkflowCanvas from "@/components/workflow/WorkflowCanvas";

export default function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const workflowId = parseInt(id, 10);

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setWorkflow(null);
    setError(null);
    api<Workflow>(`/workflows/${workflowId}`)
      .then((wf) => {
        if (active) setWorkflow(wf);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Không tải được workflow");
      });
    return () => {
      active = false;
    };
  }, [workflowId]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
        Đang tải…
      </div>
    );
  }

  return <WorkflowCanvas workflow={workflow} />;
}
