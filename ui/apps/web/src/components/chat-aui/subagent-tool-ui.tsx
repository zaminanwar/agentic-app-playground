"use client";

// Renders the deepagents `task` delegation as our existing live SubagentCard,
// inside assistant-ui's tool-UI slot. The card is fed by the SAME live subagent
// stream we built (getSubagent(toolCallId)), so the subagent-streaming work
// carries over unchanged into the assistant-ui spine.

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useStreamContext } from "@/providers/Stream";
import { SubagentCard } from "../thread/messages/subagent-card";

type TaskArgs = { subagent_type?: string; description?: string };

// Named component (not an inline render fn) so the rules-of-hooks lint is happy
// — it calls useStreamContext to fetch the live subagent stream.
function SubagentTaskRender({
  toolCallId,
  args,
}: {
  toolCallId?: string;
  args?: TaskArgs;
}) {
  const { getSubagent } = useStreamContext();
  const subagent = toolCallId ? getSubagent(toolCallId) : undefined;
  return (
    <div className="my-1">
      <SubagentCard
        subagentType={String(args?.subagent_type ?? "subagent")}
        description={String(args?.description ?? "")}
        subagent={subagent}
      />
    </div>
  );
}

export const SubagentToolUI = makeAssistantToolUI<TaskArgs, unknown>({
  toolName: "task",
  render: SubagentTaskRender,
});
