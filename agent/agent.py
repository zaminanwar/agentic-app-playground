"""Minimal-but-complete agentic app: a Gemini (via Vertex AI) agent with one tool.

This module exports `agent`, a compiled LangGraph agent. The self-hosted
production Agent Server (based on the `langchain/langgraph-api` image; see
agent/Dockerfile) discovers it via langgraph.json and injects persistence
automatically: a durable Postgres-backed checkpointer + store (DATABASE_URI)
plus Redis (REDIS_URI) for the task queue. Conversations therefore resume
across turns and survive restarts.

IMPORTANT: do NOT pass a `checkpointer=` here. The standalone server owns the
checkpointer; a hand-wired one (e.g. PostgresSaver) would conflict with the
server-managed persistence. Keep this graph checkpointer-free.

Run a quick smoke test without the server:  python agent.py
Serve it locally for the UI (dev-only):     langgraph dev   # in-memory; not prod
"""

import os

from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI


def get_weather(city: str) -> str:
    """Get the current weather for a given city."""
    return f"It's always sunny in {city}!"


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

agent = create_agent(
    model=model,
    tools=[get_weather],
    system_prompt="You are a helpful, concise assistant. Use your tools when relevant.",
)


if __name__ == "__main__":
    # Single-turn smoke test (no server, no persistence needed).
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "What's the weather in San Francisco?"}]}
    )
    print(result["messages"][-1].content)
