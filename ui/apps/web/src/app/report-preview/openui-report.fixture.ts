// Spike fixture: a representative deep-research report expressed in `openui-lang`.
//
// In production the agent's report-drafting step would EMIT this text (the model
// is both analyst and UI designer); here we hard-code a realistic example so the
// OpenUI <Renderer> can be evaluated against this app's stack WITHOUT changing
// the agent. Syntax verified against @openuidev/react-ui@0.11.8's generated
// grammar (openuiLibrary.prompt()) — note Table is column-oriented:
// Table([Col(label, dataArray, type?)]).
export const SAMPLE_REPORT = `root = Stack([header, summary, kpis, adoptionCard, sourcesCard, takeaway, explore])

header = CardHeader("State of AI Agents — 2026", "Deep research synthesis · 7 sources · generated live")

summary = MarkDownRenderer("## Executive summary\\n\\nAutonomous agents crossed from demo to deployment in 2026. Enterprise adoption is led by **engineering** and **customer support**, and multi-agent orchestration — a planner delegating to specialist subagents — is now the dominant architecture. Token costs fell roughly **60% YoY** while success rates on agentic benchmarks rose sharply, shifting the competitive frontier from raw model capability toward **UI, observability, and tool integration**.", "card")

kpi1 = Card([CardHeader("$42B", "Agent tooling market"), TextContent("+128% YoY", "small")], "sunk")
kpi2 = Card([CardHeader("78%", "Enterprises piloting agents"), TextContent("of the Fortune 500", "small")], "sunk")
kpi3 = Card([CardHeader("3.4x", "Productivity on scoped tasks"), TextContent("median, eng teams", "small")], "sunk")
kpis = Stack([kpi1, kpi2, kpi3], "row", "m", "stretch", "start", true)

adoptionCard = Card([CardHeader("Enterprise adoption by function"), adoptionChart])
adoptionChart = BarChart(funcs, [s2025, s2026], "grouped", "Function", "% adopting")
funcs = ["Eng", "Support", "Sales", "Ops", "Legal"]
s2025 = Series("2025", [41, 33, 19, 22, 8])
s2026 = Series("2026", [72, 65, 38, 44, 17])

sourcesCard = Card([CardHeader("Sources reviewed"), sourcesTable])
sourcesTable = Table([Col("Source", srcNames), Col("Key finding", srcFindings), Col("Confidence", srcConf)])
srcNames = ["LangChain — State of Agents", "a16z — Enterprise AI", "Stanford HAI — AI Index", "McKinsey — Agentic AI", "Sequoia — AI 2026", "Gartner — Agent Platforms", "ARR survey (n=480)"]
srcFindings = ["Multi-agent + tool-use is the default pattern", "Eng & support lead deployment", "Benchmark success up ~2x YoY", "ROI strongest on scoped, repetitive tasks", "Orchestration > single-model quality", "UI/observability now the differentiator", "Token cost down ~60% YoY"]
srcConf = ["High", "High", "High", "Medium", "Medium", "Medium", "High"]

takeaway = Callout("success", "Bottom line", "Multi-agent orchestration with tool use is the 2026 default. The differentiator is now the interface and observability layer — exactly what a generative report like this one demonstrates.")

b1 = Button("Break the adoption numbers down by region")
b2 = Button("What agent architectures are these teams using?")
b3 = Button("Show the token-cost trend over time")
explore = Card([CardHeader("Explore further"), Buttons([b1, b2, b3])], "sunk")
`;
