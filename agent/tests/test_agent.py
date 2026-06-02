"""Hermetic smoke tests for the deep research agent.

The real agent talks to Gemini through Vertex AI, which needs GCP credentials
and network access. To keep these tests fast and runnable in CI with NO creds
and NO network, we replace ``ChatGoogleGenerativeAI`` with a fake chat model
BEFORE ``agent.py`` is imported (the model is constructed at module import time).

We use LangChain's ``GenericFakeChatModel`` so the fake behaves like a real chat
model under ``create_deep_agent`` (binds tools, returns AIMessages) without
calling any backend. The fake answers directly (emits no tool calls), so the
agent loop terminates immediately without touching Vertex AI, Tavily, or the
network.
"""

from __future__ import annotations

import importlib
import sys
from collections.abc import Iterator, Sequence
from typing import Any

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import Runnable

FAKE_REPLY = "Here is your research briefing. See final_report.md for details."


@pytest.fixture
def agent_module(monkeypatch: pytest.MonkeyPatch) -> Iterator[object]:
    """Import ``agent`` with ``ChatGoogleGenerativeAI`` replaced by a fake.

    Patching happens before import, and the module is purged from
    ``sys.modules`` first so the import (and thus the model construction) runs
    against the fake. No GOOGLE_CLOUD_* env vars or credentials are required.
    """

    class FakeChat(GenericFakeChatModel):
        # Accept and ignore the Vertex-specific kwargs agent.py passes
        # (vertexai=, project=, location=, model=).
        def __init__(self, **_kwargs: object) -> None:
            super().__init__(messages=iter([AIMessage(content=FAKE_REPLY)]))

        # create_deep_agent binds the (many built-in + custom) tools to the
        # model; GenericFakeChatModel does not implement bind_tools. Our fake
        # never emits tool calls (it answers directly), so binding is a no-op
        # that returns the model itself.
        def bind_tools(
            self,
            tools: Sequence[Any],
            **kwargs: Any,
        ) -> Runnable[Any, Any]:
            return self

    monkeypatch.setattr(
        "langchain_google_genai.ChatGoogleGenerativeAI",
        FakeChat,
        raising=True,
    )
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_LOCATION", raising=False)

    sys.modules.pop("agent", None)
    module = importlib.import_module("agent")
    try:
        yield module
    finally:
        sys.modules.pop("agent", None)


def test_agent_compiles(agent_module: object) -> None:
    """The module exposes a compiled, invokable graph."""
    agent = agent_module.agent  # type: ignore[attr-defined]
    assert agent is not None
    assert hasattr(agent, "invoke")


def test_agent_invoke_returns_message(agent_module: object) -> None:
    """Invoking the agent returns at least one message with content."""
    agent = agent_module.agent  # type: ignore[attr-defined]

    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Research the James Webb telescope."}]}
    )

    assert "messages" in result
    assert len(result["messages"]) >= 1

    last = result["messages"][-1]
    assert last.content
    assert FAKE_REPLY in last.content


def test_subagents_are_configured(agent_module: object) -> None:
    """The deep agent declares the research and critique subagents."""
    subagents = (
        agent_module.research_subagent,  # type: ignore[attr-defined]
        agent_module.critique_subagent,  # type: ignore[attr-defined]
    )
    names = {sub["name"] for sub in subagents}
    assert names == {"research-agent", "critique-agent"}


def test_internet_search_degrades_without_api_key(
    agent_module: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without TAVILY_API_KEY the search tool returns a clear message, not an error."""
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    out = agent_module.internet_search("anything")  # type: ignore[attr-defined]
    assert isinstance(out, str)
    assert "TAVILY_API_KEY" in out
