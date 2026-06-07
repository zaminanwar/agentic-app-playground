"use client";

// Flagship "watch the deep agent" view: a live React Flow graph of the
// orchestrator delegating to research subagents. Nodes animate by status,
// derived from the same `getSubagent()` stream the subagent cards use.

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, ClipboardCheck, Sparkles, Telescope } from "lucide-react";
import type { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { cn } from "@/lib/utils";
import { classifyToolCall } from "@/lib/agent-types";
import { useStreamContext } from "@/providers/Stream";

type Status = "pending" | "running" | "complete" | "error";

const STATUS_STYLE: Record<Status, string> = {
  pending: "border-border bg-card text-muted-foreground",
  running: "border-blue-300 bg-blue-50 text-blue-700 shadow-sm",
  complete: "border-emerald-300 bg-emerald-50 text-emerald-700",
  error: "border-rose-300 bg-rose-50 text-rose-700",
};

function iconFor(kind: string) {
  const k = kind.toLowerCase();
  if (k === "orchestrator")
    return <Sparkles className="size-4 text-blue-500" />;
  if (k.includes("research")) return <Telescope className="size-4" />;
  if (k.includes("critique") || k.includes("edit") || k.includes("review"))
    return <ClipboardCheck className="size-4" />;
  if (k.includes("design")) return <Sparkles className="size-4" />;
  return <Bot className="size-4" />;
}

type AgentNodeData = {
  label: string;
  sublabel?: string;
  status: Status;
  kind: string;
  isRoot?: boolean;
};

function AgentNode({ data }: NodeProps) {
  const d = data as AgentNodeData;
  return (
    <div
      className={cn("w-52 rounded-xl border px-3 py-2", STATUS_STYLE[d.status])}
    >
      {!d.isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-muted-foreground/40"
        />
      )}
      <div className="flex items-center gap-2">
        {iconFor(d.kind)}
        <span className="truncate text-sm font-semibold capitalize">
          {d.label}
        </span>
      </div>
      {d.sublabel && (
        <p className="mt-1 line-clamp-2 text-xs opacity-80">{d.sublabel}</p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground/40"
      />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

export default function AgentGraph() {
  const stream = useStreamContext();
  const messages = stream.messages;
  const { getSubagent } = stream;
  const isLoading = stream.isLoading;

  const { nodes, edges } = useMemo(() => {
    const results = new Set<string>();
    for (const m of messages) {
      const id = (m as ToolMessage).tool_call_id;
      if (m.type === "tool" && id) results.add(id);
    }

    type Task = { id: string; subagentType: string; description: string };
    const tasks: Task[] = [];
    for (const m of messages) {
      if (m.type !== "ai") continue;
      for (const tc of (m as AIMessage).tool_calls ?? []) {
        if (classifyToolCall(tc.name) !== "task") continue;
        const args = (tc.args ?? {}) as Record<string, unknown>;
        tasks.push({
          id: tc.id ?? `task-${tasks.length}`,
          subagentType: String(args.subagent_type ?? "subagent"),
          description: String(args.description ?? ""),
        });
      }
    }

    const GAP = 230;
    const rootX = (Math.max(1, tasks.length) - 1) * (GAP / 2);
    const nodes: Node[] = [
      {
        id: "orchestrator",
        type: "agent",
        position: { x: rootX, y: 0 },
        data: {
          label: "Orchestrator",
          kind: "orchestrator",
          status: isLoading ? "running" : "complete",
          isRoot: true,
        } satisfies AgentNodeData,
      },
    ];
    const edges: Edge[] = [];
    tasks.forEach((t, i) => {
      const sub = getSubagent(t.id);
      const status: Status =
        (sub?.status as Status | undefined) ??
        (results.has(t.id) ? "complete" : "pending");
      nodes.push({
        id: t.id,
        type: "agent",
        position: { x: i * GAP, y: 150 },
        data: {
          label: t.subagentType.replace(/[-_]/g, " "),
          sublabel: t.description,
          status,
          kind: t.subagentType,
        } satisfies AgentNodeData,
      });
      edges.push({
        id: `e-${t.id}`,
        source: "orchestrator",
        target: t.id,
        animated: status === "running",
        style: {
          stroke:
            status === "complete"
              ? "#10b981"
              : status === "running"
                ? "#3b82f6"
                : "#cbd5e1",
        },
      });
    });
    return { nodes, edges };
  }, [messages, getSubagent, isLoading]);

  if (nodes.length <= 1) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Delegations to research subagents will appear here as a live graph.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        zoomOnDoubleClick={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
