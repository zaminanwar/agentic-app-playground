"""Hermetic smoke tests for the RFP compliance agent.

The real agent talks to Gemini through Vertex AI (and GCS for ingestion), which
needs GCP credentials and network access. To keep these tests fast and runnable
in CI with NO creds and NO network, we replace ``ChatGoogleGenerativeAI`` with a
fake chat model BEFORE ``agent.py`` is imported (the model is constructed at
module import time).

We use LangChain's ``GenericFakeChatModel`` so the fake behaves like a real chat
model under ``create_deep_agent`` (binds tools, returns AIMessages) without
calling any backend. The fake answers directly (emits no tool calls), so the
agent loop terminates immediately without touching Vertex AI, GCS, or the
network.

The live ingestion path (``ingest_rfp`` writing to the virtual filesystem via
StateBackend) needs a real graph execution context + GCS and is verified in the
live smoke run / dev deploy, not here. These tests cover the agent wiring, the
deterministic recall helper, GCS-URI parsing, and graceful degradation.
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

FAKE_REPLY = "Shred complete. See compliance_matrix.json for the matrix."


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
        {"messages": [{"role": "user", "content": "Analyze the RFP at sample.pdf."}]}
    )

    assert "messages" in result
    assert len(result["messages"]) >= 1

    last = result["messages"][-1]
    assert last.content
    assert FAKE_REPLY in last.content


def test_subagents_are_configured(agent_module: object) -> None:
    """The deep agent declares the four shred subagents."""
    subagents = (
        agent_module.structure_subagent,  # type: ignore[attr-defined]
        agent_module.requirements_subagent,  # type: ignore[attr-defined]
        agent_module.domain_subagent,  # type: ignore[attr-defined]
        agent_module.critique_subagent,  # type: ignore[attr-defined]
    )
    names = {sub["name"] for sub in subagents}
    assert names == {
        "structure-agent",
        "requirements-agent",
        "domain-agent",
        "critique-agent",
    }


def test_find_requirement_candidates_catches_modal_verbs(agent_module: object) -> None:
    """The deterministic recall floor catches shall/must obligations."""
    find = agent_module.find_requirement_candidates  # type: ignore[attr-defined]
    text = (
        "Introduction to the program. "
        "The contractor shall provide 24x7 monitoring. "
        "Offerors must hold a Top Secret clearance. "
        "This sentence is purely informational and carries no obligation."
    )
    cands = find(text)
    sentences = [c["sentence"] for c in cands]
    verbs = {c["modal_verb"] for c in cands}

    assert len(cands) == 2
    assert verbs == {"shall", "must"}
    assert any("24x7 monitoring" in s for s in sentences)
    assert all("purely informational" not in s for s in sentences)


def test_find_requirement_candidates_empty_text(agent_module: object) -> None:
    """No obligations -> no candidates (and no crash on empty input)."""
    find = agent_module.find_requirement_candidates  # type: ignore[attr-defined]
    assert find("") == []
    assert find("Just some background prose with no obligations.") == []


def test_parse_gcs_uri(agent_module: object) -> None:
    """Full gs:// URIs and bare object paths both resolve correctly."""
    parse = agent_module._parse_gcs_uri  # type: ignore[attr-defined]
    assert parse("gs://my-bucket/rfp/file.pdf", "fallback") == ("my-bucket", "rfp/file.pdf")
    assert parse("rfp/file.pdf", "fallback") == ("fallback", "rfp/file.pdf")
    assert parse("/leading-slash.pdf", "fallback") == ("fallback", "leading-slash.pdf")


def test_ingest_rfp_degrades_without_bucket(
    agent_module: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A bare object path with no RFP_BUCKET returns a clear message, not an error."""
    monkeypatch.delenv("RFP_BUCKET", raising=False)
    ingest = agent_module.ingest_rfp  # type: ignore[attr-defined]

    out = ingest("file.pdf")
    assert isinstance(out, str)
    assert "RFP_BUCKET" in out


def test_ingest_rfp_handles_missing_pointer(agent_module: object) -> None:
    """An empty pointer is reported rather than raising."""
    ingest = agent_module.ingest_rfp  # type: ignore[attr-defined]
    out = ingest("")
    assert isinstance(out, str)
    assert "gs://" in out or "object path" in out
