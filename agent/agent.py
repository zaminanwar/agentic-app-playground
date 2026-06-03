"""Deep research agent: a Gemini (via Vertex AI) deep agent that plans, searches
the web through subagents, and writes a cited report.

This module exports `agent`, a compiled LangGraph graph built with
`deepagents.create_deep_agent`. Deep Agents is a "batteries-included" harness on
top of LangChain's `create_agent`: same tool-calling loop, plus built-in
planning (`write_todos`), a virtual filesystem (`read_file`/`write_file`/...),
and subagent delegation (`task`). The orchestrator here breaks a question into
steps, delegates focused web searches to a `research-agent`, drafts a report to
the virtual filesystem, has a `critique-agent` review it, then returns the
finished report.

The self-hosted production Agent Server (based on the `langchain/langgraph-api`
image; see agent/Dockerfile) discovers this graph via langgraph.json and injects
persistence automatically: a durable Postgres-backed checkpointer + store
(DATABASE_URI) plus Redis (REDIS_URI) for the task queue. Conversations resume
across turns and survive restarts.

IMPORTANT: do NOT pass a `checkpointer=` here. The standalone server owns the
checkpointer; a hand-wired one (e.g. PostgresSaver) would conflict with the
server-managed persistence. Keep this graph checkpointer-free.

Live web search needs TAVILY_API_KEY (see .env.example). Without it the search
tool degrades gracefully — the agent still runs and explains that search is
unconfigured — so CI and the deploy stay green; add the key (Secret Manager in
deployed envs) to enable real research.

Run a quick smoke test without the server:  python agent.py
Serve it locally for the UI (dev-only):     langgraph dev   # in-memory; not prod
"""

import os

from deepagents import SubAgent, create_deep_agent
from langchain_google_genai import ChatGoogleGenerativeAI


def internet_search(query: str, max_results: int = 5, topic: str = "general") -> str:
    """Search the web for current information on a query.

    Args:
        query: The search query.
        max_results: How many results to return (default 5).
        topic: Tavily search topic — "general" or "news".

    Returns a readable digest of the top results, each with its source URL, so
    the agent can cite them. If TAVILY_API_KEY is not configured the tool returns
    an explanatory message instead of failing.
    """
    # Strip so a blank/whitespace placeholder (e.g. the value Terraform seeds
    # into Secret Manager before the real key is populated) reads as unset.
    if not os.environ.get("TAVILY_API_KEY", "").strip():
        return (
            "Web search is unavailable: TAVILY_API_KEY is not configured. "
            "Set it in the environment (Secret Manager in deployed envs) to "
            "enable live research."
        )

    # Imported lazily so module import stays hermetic (no key / no network needed
    # for tests) and TavilySearch — which validates the key at construction —
    # is only built when search is actually requested.
    from langchain_tavily import TavilySearch

    search = TavilySearch(max_results=max_results, topic=topic)
    response = search.invoke({"query": query})

    # langchain-tavily returns {"error": ...} on failure (bad key, rate limit,
    # network) rather than raising — surface it so the agent doesn't mistake a
    # failed search for "nothing found".
    if isinstance(response, dict) and response.get("error"):
        return f"Web search failed: {response['error']}"

    results = response.get("results", []) if isinstance(response, dict) else []
    if not results:
        return f"No results found for query: {query!r}"

    lines = [f"Search results for {query!r}:\n"]
    for i, r in enumerate(results, 1):
        title = r.get("title", "(untitled)")
        url = r.get("url", "")
        content = (r.get("content") or "").strip()
        lines.append(f"{i}. {title}\n   Source: {url}\n   {content}\n")
    return "\n".join(lines)


# Gemini through Vertex AI — authenticates with your GCP credentials, so traffic
# and billing stay inside your Google org.
#
# We use the google-genai client (vertexai=True) rather than the older
# langchain-google-vertexai / ChatVertexAI: it talks to Vertex over REST, while
# ChatVertexAI uses gRPC whose native layer segfaults inside LangGraph's async
# server worker on Windows.
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    vertexai=True,
    project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
    location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
)


# --- Subagents ---------------------------------------------------------------
# Subagents run in isolated context windows and are invoked by the orchestrator
# via the built-in `task` tool. They inherit the main model and the filesystem
# tools; we scope each one's extra tools and instructions tightly.

research_subagent: SubAgent = {
    "name": "research-agent",
    "description": (
        "Researches a SINGLE focused subtopic or question by searching the web. "
        "Give it one clear, self-contained research question. Returns concise "
        "findings with source URLs. Call it multiple times (in parallel) to "
        "cover different subtopics of a larger question."
    ),
    "system_prompt": (
        "You are a focused research assistant. You are given ONE research "
        "question. Use the `internet_search` tool (more than once if needed, "
        "varying the query) to gather evidence from several independent "
        "sources. Then reply with a tight summary of what you found: the key "
        "facts, any disagreement between sources, and a list of the source "
        "URLs you relied on. Do not pad the answer — only report what the "
        "sources actually support."
    ),
    "tools": [internet_search],
}

critique_subagent: SubAgent = {
    "name": "critique-agent",
    "description": (
        "Critiques the draft report for completeness, accuracy, balance, and "
        "citations. Use after a draft has been written to `final_report.md`."
    ),
    "system_prompt": (
        "You are a meticulous editor. Read the draft at `final_report.md` with "
        "the `read_file` tool. Critique it against the user's original "
        "question: Are all parts of the question answered? Are claims backed by "
        "cited sources? Is anything missing, unbalanced, or unsupported? Reply "
        "with a concise, numbered list of concrete, actionable improvements. Do "
        "not rewrite the report yourself."
    ),
}


# Concise `openui-lang` guide for the report-designer subagent. `openui-lang` is
# a declarative UI DSL (from @openuidev/react-ui); the web app renders the file
# written below through OpenUI's <Renderer>, turning the report into an
# interactive dashboard instead of a wall of markdown. Keep this in sync with the
# frontend library version (@openuidev/react-ui pinned in ui/apps/web).
REPORT_UI_GUIDE = """\
`openui-lang` rules:
- Output ONLY openui-lang. No prose, no code fences.
- One statement per line: `identifier = Expression`. Identifiers are camelCase.
- Define `root = Stack([...])` FIRST (so the shell renders), then define each part below it.
- Strings use double quotes; numbers are bare; arrays use [].

Use ONLY these components (? marks optional args):
- Stack(children[], direction?, gap?, align?, justify?, wrap?) — flex layout.
  direction "row"|"column"; gap "none"|"xs"|"s"|"m"|"l"|"xl".
- Card(children[], variant?) — styled box. variant "card"|"sunk"|"clear".
  Cards in a "row" Stack share the row width.
- CardHeader(title, subtitle?) — heading.
- TextContent(text, size?) — text, markdown ok. size "small"|"default"|"large"|"large-heavy".
- MarkDownRenderer(markdown, variant?) — render a markdown block.
- Callout(variant, title, description) — highlighted note.
  variant "info"|"warning"|"success"|"error"|"neutral".
- Table(columns[]) — COLUMN-oriented. Each column is Col(label, dataArray, type?).
  type "string"|"number".
- Series(name, numbers[]).
- BarChart(labels[], series[], variant?, xLabel?, yLabel?) — variant "grouped"|"stacked".
- LineChart(labels[], series[], variant?, xLabel?, yLabel?) — variant "linear"|"natural"|"step".
- Button(label) — clicking sends the label to the assistant (use for follow-ups).
  Buttons(buttons[]) groups several.

Example:
root = Stack([header, summary, kpis, trendCard, sourcesCard, takeaway, explore])
header = CardHeader("State of X — 2026", "Synthesis of 5 sources")
summary = MarkDownRenderer("## Executive summary\\n\\nKey finding in **bold**...", "card")
kpi1 = Card([CardHeader("42%", "Adoption"), TextContent("+12% YoY", "small")], "sunk")
kpi2 = Card([CardHeader("$3.1B", "Market")], "sunk")
kpis = Stack([kpi1, kpi2], "row", "m", "stretch", "start", true)
labels = ["2024", "2025", "2026"]
s1 = Series("Adoption", [18, 30, 42])
trendCard = Card([CardHeader("Adoption over time"), LineChart(labels, [s1], "natural")])
srcNames = ["Source A", "Source B"]
srcConf = ["High", "Medium"]
srcTable = Table([Col("Source", srcNames), Col("Confidence", srcConf)])
sourcesCard = Card([CardHeader("Sources"), srcTable])
takeaway = Callout("success", "Bottom line", "One-sentence takeaway.")
b1 = Button("Break this down by region")
explore = Card([CardHeader("Explore further"), Buttons([b1])], "sunk")
"""


report_designer_subagent: SubAgent = {
    "name": "report-designer",
    "description": (
        "Designs an interactive dashboard version of the finished report, "
        "written as openui-lang to `final_report.ui`. Use as the LAST step, "
        "after `final_report.md` is complete and has been reviewed."
    ),
    "system_prompt": (
        "You are a data-visualization report designer. Read the finished report "
        "at `final_report.md` with `read_file`, then re-express it as an "
        "interactive, data-rich dashboard in openui-lang and write that "
        "openui-lang to `final_report.ui` with `write_file`.\n\n"
        "Lead with a title (CardHeader) and a short executive summary "
        "(MarkDownRenderer). Then add KPI cards for the most important numbers, a "
        "chart if the report has comparable figures (use realistic values drawn "
        "from the report), a Table of sources with a confidence column, a Callout "
        "with the bottom line, and 2-3 Buttons of natural follow-up questions. "
        "Use ONLY facts and figures actually present in the report — never invent "
        "data. Write only the openui-lang to the file.\n\n" + REPORT_UI_GUIDE
    ),
}


ORCHESTRATOR_PROMPT = """You are an expert research orchestrator. Your job is to \
answer the user's question with a thorough, well-sourced report.

Follow this process:
1. Use `write_todos` to break the question into concrete research steps.
2. Delegate each focused subtopic to the `research-agent` subagent via the \
`task` tool. Prefer several narrow questions over one broad one, and run \
independent searches in parallel where possible.
3. Synthesize the findings and write a clear, well-structured report to \
`final_report.md` using `write_file`. Use Markdown headings, and include a \
"## Sources" section listing the URLs you relied on.
4. Ask the `critique-agent` subagent to review `final_report.md`. Address its \
feedback by revising the file (run more research if it found gaps).
5. When the report is solid, delegate to the `report-designer` subagent via the \
`task` tool to produce an interactive dashboard version at `final_report.ui`.
6. Reply to the user with the final report contents (the Markdown from \
`final_report.md`).

Be rigorous: only state what the sources support, and always cite them. If web \
search is unavailable, say so plainly rather than inventing facts."""


agent = create_deep_agent(
    model=model,
    tools=[internet_search],
    system_prompt=ORCHESTRATOR_PROMPT,
    subagents=[research_subagent, critique_subagent, report_designer_subagent],
)


if __name__ == "__main__":
    # Single-turn smoke test (no server, no persistence needed). Needs GCP creds
    # for Gemini, and TAVILY_API_KEY for live search to actually run. The
    # orchestrator returns the finished report as its final message.
    result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Give me a short briefing on the current state of "
                    "the James Webb Space Telescope's major discoveries.",
                }
            ]
        }
    )
    print(result["messages"][-1].content)
