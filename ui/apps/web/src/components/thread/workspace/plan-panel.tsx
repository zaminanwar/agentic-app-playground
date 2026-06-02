import { CheckCircle2, Circle, ListTodo, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Todo, TodoStatus } from "@/lib/agent-types";

const STATUS_CONFIG: Record<
  TodoStatus,
  { label: string; row: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    row: "border-border bg-muted/40",
    text: "text-muted-foreground",
    icon: <Circle className="size-4 text-muted-foreground/60" />,
  },
  in_progress: {
    label: "In progress",
    row: "border-blue-200 bg-blue-50",
    text: "text-blue-900",
    icon: <Loader2 className="size-4 animate-spin text-blue-500" />,
  },
  completed: {
    label: "Done",
    row: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-900 line-through decoration-emerald-500/40",
    icon: <CheckCircle2 className="size-4 text-emerald-500" />,
  },
};

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
        initial={false}
        animate={{ width: `${percentage}%` }}
        transition={{ type: "spring", stiffness: 200, damping: 30 }}
      />
    </div>
  );
}

export function PlanPanel({
  todos,
  isLoading,
}: {
  todos: Todo[];
  isLoading: boolean;
}) {
  const total = todos.length;
  const completed = todos.filter((t) => t.status === "completed").length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  // Only the first active task pulses, so a multi-task plan doesn't get noisy.
  const firstInProgress = todos.findIndex((t) => t.status === "in_progress");

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Drafting a research plan…
          </>
        ) : (
          <>
            <ListTodo className="size-4" />
            The plan appears here once the agent breaks down your question.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {completed}/{total} steps · {percentage}%
        </span>
      </div>
      <ProgressBar percentage={percentage} />
      <ul className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {todos.map((todo, i) => {
            const cfg = STATUS_CONFIG[todo.status] ?? STATUS_CONFIG.pending;
            const isActive = i === firstInProgress;
            return (
              <motion.li
                key={`${i}-${todo.content}`}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                  cfg.row,
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {isActive || todo.status !== "in_progress"
                    ? cfg.icon
                    : STATUS_CONFIG.pending.icon}
                </span>
                <span className={cn("text-sm leading-snug", cfg.text)}>
                  {todo.content}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
