import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  FolderOpen,
  ListTodo,
  PanelRightClose,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { TooltipIconButton } from "../tooltip-icon-button";
import { PlanPanel } from "./plan-panel";
import { FilesPanel } from "./files-panel";

function Section({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
          {badge}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function CountBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {n}
    </span>
  );
}

export function WorkspacePanel({ onClose }: { onClose: () => void }) {
  const stream = useStreamContext();
  const todos = stream.values?.todos ?? [];
  const files = stream.values?.files ?? {};
  const fileCount = Object.keys(files).length;
  const isLoading = stream.isLoading;

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Sparkles className="size-4 text-blue-500" />
          Research Workspace
        </span>
        <TooltipIconButton
          tooltip="Hide workspace"
          variant="ghost"
          className="size-7"
          onClick={onClose}
        >
          <PanelRightClose className="size-4" />
        </TooltipIconButton>
      </div>

      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
        <Section
          title="Plan"
          icon={<ListTodo className="size-4 text-blue-500" />}
          badge={<CountBadge n={todos.length} />}
        >
          <PlanPanel todos={todos} isLoading={isLoading} />
        </Section>
        <Section
          title="Artifacts"
          icon={<FolderOpen className="size-4 text-amber-500" />}
          badge={<CountBadge n={fileCount} />}
        >
          <FilesPanel files={files} />
        </Section>
      </div>
    </div>
  );
}
