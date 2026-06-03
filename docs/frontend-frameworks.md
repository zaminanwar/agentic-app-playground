# Frontend framework evaluation — assistant-ui vs AI Elements vs OpenUI

Status: **spike / decision doc** (branch `spike/openui-report-and-assistant-ui-scope`).
Context: the web app (`ui/apps/web`) is a Next.js deep-research workspace on
`@langchain/langgraph-sdk/react` `useStream` (v1 SDK, shadcn/Radix/Tailwind),
with live subagent streaming already shipped.

## TL;DR decision

These are three different *kinds* of thing, so the answer is a layered stack, not one pick:

| | What it is | Role in our stack |
|---|---|---|
| **assistant-ui** | A framework (runtime + headless primitives) | **The spine** — agent/chat control plane |
| **AI Elements** | Apache-2.0 shadcn source components | **A quarry** — cherry-pick Canvas graph, Sources, Artifact |
| **OpenUI** | Generative-UI engine (model emits `openui-lang`) | **The report wow-layer** — swappable behind the app shell |

- **assistant-ui** is the only true *framework*: deepest capability surface (generative UI, canvas/artifacts, HITL/interrupts, MCP, branching, voice), headless + own-your-markup so it can't box us in, and a **first-party LangGraph partnership** that serves subagent + interrupt + artifact workflows. Risk is organizational (seed-stage, ~8 ppl) but MIT, so forkable. **Recommended as the long-term spine.**
- **AI Elements** is a component catalog you own outright (no lock-in, infinite ceiling) but not a runtime and not the generative engine. Use it as a parts bin.
- **OpenUI** delivers the highest *wow* (model designs the UI) but is pre-1.0, single-vendor, and explicitly "not for complex stateful apps." Use it for the report pane only, behind a boundary so it can be swapped for Vercel `json-render` / Google A2UI as that frontier settles.

The frontier capability — *the model generating its own UI* — is unsettled (json-render ~13k★, A2UI, OpenUI/Thesys C1). So keep the generative layer swappable; don't bet the whole frontend on any one engine.

---

## OpenUI spike (this branch)

A working prototype lives at **`/report-preview`** (`src/app/report-preview/`):
`Renderer` from `@openuidev/react-lang` renders a representative deep-research
report (`openui-report.fixture.ts`, hand-written `openui-lang`) with a
"Replay streaming" toggle that demos shell-first progressive rendering. No agent
change — it proves the rendering pipeline on our stack.

- Deps added (web): `@openuidev/react-ui@0.11.8`, `@openuidev/react-lang@0.2.6`,
  `@openuidev/react-headless@0.8.2`, `zustand@^4.5.5`. React 19 ✓, zod 3.25 ✓.
- Syntax was verified against the library's own generated grammar
  (`openuiLibrary.prompt()`), not docs prose — e.g. `Table` is **column-oriented**
  (`Table([Col(label, dataArray, type?)])`), which the public docs example got wrong.
- **Productionizing** (next step, separate work): have the agent's report step emit
  `openui-lang` (inject `openuiLibrary.prompt()` as the system message), feed the
  streamed AI text into `<Renderer>`, and add the documented streaming-stability
  utilities (`useStableText`, `truncateAtOpenString`, `chartDataRefsResolved`,
  `sanitizeIdentifiers`, `buildProgressiveRoot`). Pin versions (0.11.x churn).

---

## assistant-ui spine migration — scope

Goal: adopt assistant-ui as the chat/agent runtime while keeping the BFF proxy,
the deep-agent workspace (plan/artifacts), and the subagent streaming we shipped.

### Two paths

**Path A — `useExternalStoreRuntime` bridge (recommended, incremental).**
Keep the current `@langchain/langgraph-sdk/react` `useStream` exactly as-is;
add an adapter that converts `stream.messages` → `ThreadMessageLike[]` and wire
`onNew`/`onCancel` to `stream.submit`/`stream.stop`. Mount
`<AssistantRuntimeProvider>` + assistant-ui `<Thread>` primitives. Lowest risk:
the BFF, subagent `getSubagent()` wiring, `streamSubgraphs`, and the workspace
panels all keep working; we swap only the transcript/composer presentation.

**Path B — `@assistant-ui/react-langgraph` (`useLangGraphRuntime`, deeper).**
Replace the Stream provider with assistant-ui's native LangGraph runtime. More
out-of-the-box (interrupts, branching, checkpoint forks) but it owns the stream
lifecycle, so it supersedes `providers/Stream.tsx` and changes how subagents and
`stream.values` (todos/files) are read. Bigger blast radius; do only after Path A.

### File-by-file impact (Path A)

| Area | File(s) | Change |
|---|---|---|
| Deps | `apps/web/package.json` | add `@assistant-ui/react` (+ `@assistant-ui/react-markdown`); optionally `@assistant-ui/react-langgraph` for Path B |
| Runtime bridge | new `providers/AssistantRuntime.tsx` | `useExternalStoreRuntime` adapter: `toThreadMessages(stream.messages)`, `onNew → stream.submit({ streamMode, streamSubgraphs })`, `onCancel → stream.stop()` |
| Provider wiring | `providers/Stream.tsx` | unchanged (keeps `subagents`/`getSubagent`); just nest the new runtime provider under it |
| Transcript shell | `components/thread/index.tsx` | replace the hand-rolled message list + composer + scroll with assistant-ui `<Thread>` / `<Composer>` primitives |
| Message render | `messages/ai.tsx`, `human.tsx` | map to assistant-ui `AssistantMessage`/`UserMessage` slots (markdown via `@assistant-ui/react-markdown`) |
| Tool UI | `messages/tool-calls.tsx`, `tool-call-views.tsx` | move into assistant-ui tool-UI slots (`ToolFallback` + per-tool components) |
| Subagent cards | `messages/subagent-card.tsx` | keep the component; mount it from a tool-UI slot, still fed by `getSubagent(tc.id)` (our live-streaming work is reused as-is) |
| Workspace | `components/thread/workspace/*` | unchanged — still reads `stream.values.todos` / `.files` |
| Interrupts | `components/thread/agent-inbox/*` | Path A: keep current handling; Path B: replace with assistant-ui native interrupts |
| Branching | `messages/shared.tsx` (BranchSwitcher) | optional: swap for assistant-ui `MessageBranch` |

### Effort & risk

- **Path A: ~2–3 days.** Mostly the runtime adapter + re-slotting message/tool
  rendering. The subagent streaming, workspace panels, and BFF are untouched.
- **Path B: ~1 week+,** and it owns the stream lifecycle — defer until A proves out.
- Risks: (1) assistant-ui is seed-stage and ships fast — **pin versions**,
  budget upgrade reconciliation; (2) the `ThreadMessageLike` conversion must
  handle our deepagents message shapes (AI/tool/`task` tool calls, reasoning);
  (3) confirm the workspace right-panel composes with assistant-ui's thread
  layout (it should — assistant-ui is headless).
- Escape hatch / insurance: because assistant-ui is headless and `ExternalStoreRuntime`
  keeps message state in our store, we can back out to the current `useStream`
  rendering without losing the backend or workspace.

### Suggested sequencing

1. Path A behind a route flag (e.g. `/chat-aui`) alongside the current thread, so
   both run against the same `useStream` — compare side by side.
2. Port the tool-UI + subagent-card slots; confirm live subagent streaming still works.
3. Cut over the default route; keep the old `Thread` until parity is confirmed.
4. (Later) evaluate Path B for native interrupts/branching, and graft the OpenUI
   report pane + AI Elements Canvas graph as separate layers.
