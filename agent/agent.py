"""RFP compliance agent: a Gemini (via Vertex AI) deep agent that ingests a
customer RFP (a digital PDF) and shreds it into a structured, traceable
compliance matrix.

This module exports `agent`, a compiled LangGraph graph built with
`deepagents.create_deep_agent`. Deep Agents is a "batteries-included" harness on
top of LangChain's `create_agent`: same tool-calling loop, plus built-in
planning (`write_todos`), a virtual filesystem (`read_file`/`write_file`/...),
and subagent delegation (`task`).

The pipeline (Phase 1 — "the shred"; capability-based compliance is Phase 2):
  1. `ingest_rfp` downloads the PDF from GCS, extracts per-page text, and writes
     two artifacts to the virtual filesystem:
       - `source/rfp_pages.json`            {page_number: text}
       - `source/requirement_candidates.json`  deterministic modal-verb hits
         (a recall floor so no "shall"/"must" sentence is silently dropped).
  2. `structure-agent`    → `outline.json`           (section hierarchy)
  3. `requirements-agent` → `requirements.json`      (traceable requirements)
  4. `domain-agent`       → `compliance_matrix.json` (+ domain, empty compliance)
  5. `critique-agent` checks recall + traceability; the orchestrator fixes gaps.

The editable compliance matrix the UI renders lives at `compliance_matrix.json`
in the `files` state channel; user edits are written back to the same channel.

The self-hosted production Agent Server (based on the `langchain/langgraph-api`
image; see agent/Dockerfile) discovers this graph via langgraph.json and injects
persistence automatically: a durable Postgres-backed checkpointer + store
(DATABASE_URI) plus Redis (REDIS_URI) for the task queue. Conversations and the
matrix resume across turns and survive restarts.

IMPORTANT: do NOT pass a `checkpointer=` here. The standalone server owns the
checkpointer; a hand-wired one would conflict with the server-managed persistence.

PDF ingestion needs the agent to reach GCS: RFP_BUCKET (the upload bucket) and
GCP credentials (ADC on Cloud Run). Without them `ingest_rfp` degrades to a
clear message instead of raising, so CI and the deploy stay green.

Run a quick smoke test without the server:  python agent.py gs://bucket/file.pdf
Serve it locally for the UI (dev-only):     langgraph dev   # in-memory; not prod
"""

import io
import json
import os
import re
import sys

from deepagents import SubAgent, create_deep_agent
from deepagents.backends import StateBackend
from langchain_google_genai import ChatGoogleGenerativeAI

from taxonomy import DOMAIN_IDS, taxonomy_for_prompt

# --- Deterministic requirement detection -------------------------------------
# Compliance work lives or dies on recall: a missed "shall" can sink a bid. So
# before any LLM sees the document we run a deterministic pass for the modal
# verbs that signal an obligation, and materialize the hits as a recall floor
# the requirements subagent must account for. Precision is intentionally loose
# (the subagent prunes false positives); recall is what matters here.
_MODAL_PATTERNS = [
    r"\bshall\b",
    r"\bmust\b",
    r"\bwill be required to\b",
    r"\bis required to\b",
    r"\bare required to\b",
    r"\bis responsible for\b",
    r"\bare responsible for\b",
    r"\bat a minimum\b",
]
_MODAL_RE = re.compile("|".join(_MODAL_PATTERNS), re.IGNORECASE)
# Rough sentence splitter: break on ., ;, : or newline boundaries. RFP prose is
# messy, so we keep this permissive and let the LLM tidy boundaries downstream.
_SENTENCE_RE = re.compile(r"[^.;:\n]*[.;:\n]")


def find_requirement_candidates(text: str) -> list[dict[str, str]]:
    """Return the modal-verb sentences in `text` as candidate requirements.

    Each item is ``{"sentence": <trimmed text>, "modal_verb": <first hit>}``.
    Pure and dependency-free so it is cheap to unit-test and gives the
    requirements subagent a deterministic recall checklist.
    """
    candidates: list[dict[str, str]] = []
    for raw in _SENTENCE_RE.findall(text):
        sentence = " ".join(raw.split()).strip(" .;:")
        if not sentence:
            continue
        match = _MODAL_RE.search(sentence)
        if match:
            candidates.append({"sentence": sentence, "modal_verb": match.group(0).lower()})
    return candidates


def _parse_gcs_uri(uri: str, default_bucket: str) -> tuple[str, str]:
    """Split a ``gs://bucket/object`` URI (or a bare object path) into parts.

    A bare path (no ``gs://``) is resolved against ``default_bucket`` (RFP_BUCKET),
    which is how the web upload route refers to objects it just stored.
    """
    if uri.startswith("gs://"):
        bucket, _, obj = uri[len("gs://") :].partition("/")
        return bucket, obj
    return default_bucket, uri.lstrip("/")


def _extract_pages(pdf_bytes: bytes) -> dict[str, str]:
    """Extract per-page text from a digital PDF, keyed by 1-based page number.

    Page numbers are the traceability anchor carried through to every matrix row,
    so a reviewer can jump straight to the source page.
    """
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    return {str(i): (page.extract_text() or "") for i, page in enumerate(reader.pages, start=1)}


def ingest_rfp(gcs_uri: str) -> str:
    """Download an RFP PDF from Google Cloud Storage and stage it for analysis.

    Args:
        gcs_uri: Either a full ``gs://bucket/object.pdf`` URI or a bare object
            path stored in the RFP_BUCKET (what the web upload route returns).

    Writes two files to the virtual filesystem — ``source/rfp_pages.json``
    (per-page text) and ``source/requirement_candidates.json`` (deterministic
    modal-verb hits, the recall floor) — and returns a short summary. If
    RFP_BUCKET / credentials are missing, or download/parse fails, it returns an
    explanatory message instead of raising, so the run degrades gracefully.
    """
    default_bucket = os.environ.get("RFP_BUCKET", "").strip()
    if not gcs_uri or not gcs_uri.strip():
        return "ingest_rfp needs a gs:// URI or an object path; none was provided."
    bucket, obj = _parse_gcs_uri(gcs_uri.strip(), default_bucket)
    if not bucket:
        return (
            "RFP ingestion is unavailable: no bucket. Pass a full gs://bucket/object "
            "URI, or set RFP_BUCKET (Secret/env in deployed envs) and pass an object path."
        )
    if not obj:
        return f"Could not parse an object path from {gcs_uri!r}."

    try:
        from google.cloud import storage

        client = storage.Client()
        pdf_bytes = client.bucket(bucket).blob(obj).download_as_bytes()
    except Exception as exc:  # noqa: BLE001 — surface any GCS/credential failure to the agent
        return (
            f"Could not download gs://{bucket}/{obj}: {exc}. Check RFP_BUCKET, the "
            "object path, and that the agent service account can read the bucket."
        )

    try:
        pages = _extract_pages(pdf_bytes)
    except Exception as exc:  # noqa: BLE001 — malformed/scanned PDFs land here
        return (
            f"Downloaded gs://{bucket}/{obj} but could not extract text: {exc}. "
            "Phase 1 expects a digital (text-based) PDF, not a scanned image."
        )

    candidates: list[dict[str, str | int]] = []
    for page_num, text in pages.items():
        for cand in find_requirement_candidates(text):
            candidates.append({"page": int(page_num), **cand})

    # Write through StateBackend exactly like the built-in write_file tool does:
    # the `files` channel is a DeltaChannel, so updates must go through the
    # backend (CONFIG_KEY_SEND) rather than a hand-rolled Command. upload_files
    # overwrites existing paths, making re-ingestion idempotent.
    backend = StateBackend()
    backend.upload_files(
        [
            ("source/rfp_pages.json", json.dumps(pages, ensure_ascii=False).encode("utf-8")),
            (
                "source/requirement_candidates.json",
                json.dumps(candidates, ensure_ascii=False).encode("utf-8"),
            ),
        ]
    )

    nonempty = sum(1 for t in pages.values() if t.strip())
    return (
        f"Ingested gs://{bucket}/{obj}: {len(pages)} pages ({nonempty} with text). "
        f"Found {len(candidates)} candidate requirement sentences. "
        "Wrote source/rfp_pages.json and source/requirement_candidates.json. "
        "Next: build the outline, then extract requirements covering every candidate."
    )


# Gemini through Vertex AI — authenticates with your GCP credentials, so traffic
# and billing stay inside your Google org.
#
# We use the google-genai client (vertexai=True) rather than the older
# langchain-google-vertexai / ChatVertexAI: it talks to Vertex over REST, while
# ChatVertexAI uses gRPC whose native layer segfaults inside LangGraph's async
# server worker on Windows.
#
# KNOWN QUIRK (accepted): gemini-2.5-flash occasionally returns finish_reason
# MALFORMED_FUNCTION_CALL — an empty turn that ends the run early. Leave
# temperature at the model DEFAULT (do not set 0): default sampling keeps that
# failure flaky and recoverable on a re-run. For the heavier extraction pipeline
# here, gemini-2.5-pro is a sturdier (slower, pricier) alternative if flash
# proves unreliable on long documents.
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    vertexai=True,
    project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
    location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
)


# --- Subagents ---------------------------------------------------------------
# Subagents run in isolated context windows and are invoked by the orchestrator
# via the built-in `task` tool. They inherit the main model and the filesystem
# tools (read_file/write_file/edit_file/ls/glob/grep). Long RFPs blow past a
# single context, so each subagent works section-by-section off the staged files
# rather than holding the whole document at once.

structure_subagent: SubAgent = {
    "name": "structure-agent",
    "description": (
        "Builds the section hierarchy of the RFP. Reads source/rfp_pages.json and "
        "writes outline.json. Run this FIRST, after ingestion, so requirement "
        "extraction can be scoped section-by-section."
    ),
    "system_prompt": (
        "You map the structure of a customer RFP. Read `source/rfp_pages.json` "
        "(a JSON object of {page_number: text}) with `read_file`. Identify the "
        "document hierarchy: numbered sections and subsections, their titles, and "
        "nesting. Classify each node as a `header` (title only) or a `section` "
        "(has body prose). Then write `outline.json` with `write_file` as a JSON "
        'object: {"sections": [{"section_id": "C.3.1", "title": "...", '
        '"level": 1, "parent_id": "C.3" or null, "page_start": 12, '
        '"kind": "section"}]}. Use the document\'s own numbering for '
        "section_id. Be exhaustive — every numbered section must appear. For very "
        "long documents, read pages in ranges (offset/limit) and accumulate. "
        "Write only the JSON file; reply with a one-line summary."
    ),
}

requirements_subagent: SubAgent = {
    "name": "requirements-agent",
    "description": (
        "Extracts discrete, traceable requirements from the RFP. Reads "
        "source/rfp_pages.json, source/requirement_candidates.json, and "
        "outline.json; writes requirements.json. Run AFTER structure-agent."
    ),
    "system_prompt": (
        "You extract requirements from a customer RFP with strict traceability. "
        "Read `source/requirement_candidates.json` (deterministic modal-verb hits "
        "with page numbers — your RECALL FLOOR), `source/rfp_pages.json` (full "
        "text), and `outline.json` (the section hierarchy) with `read_file`.\n\n"
        "Produce one requirement per distinct obligation. EVERY candidate "
        "sentence must be represented by a requirement (or explicitly folded into "
        "one); do not drop any. Also add implicit requirements the modal-verb "
        "scan missed (e.g. obligations phrased without 'shall'). For each "
        "requirement capture the EXACT source text — never paraphrase the "
        "`verbatim` field.\n\n"
        'Write `requirements.json` with `write_file` as: {"requirements": '
        '[{"id": "REQ-001", "section_id": "C.3.1", "page": 12, '
        '"verbatim": "The contractor shall ...", "modal_verb": "shall", '
        '"summary": "one-line plain-language restatement"}]}. Number ids '
        "sequentially (REQ-001, REQ-002, ...). Map each to the best-fitting "
        "section_id from outline.json. Write only the JSON file; reply with the "
        "requirement count."
    ),
}

domain_subagent: SubAgent = {
    "name": "domain-agent",
    "description": (
        "Assigns each requirement to a capability domain and assembles the "
        "compliance matrix. Reads requirements.json; writes compliance_matrix.json. "
        "Run AFTER requirements-agent."
    ),
    "system_prompt": (
        "You classify RFP requirements into a FIXED capability taxonomy and "
        "assemble the compliance matrix. Read `requirements.json` with "
        "`read_file`. For each requirement, choose EXACTLY ONE domain id from "
        "this taxonomy:\n\n" + taxonomy_for_prompt() + "\n\n"
        'Then write `compliance_matrix.json` with `write_file` as: {"rows": '
        '[{"id": "REQ-001", "section_id": "C.3.1", "page": 12, '
        '"verbatim": "...", "modal_verb": "shall", "summary": "...", '
        '"domain": "cybersecurity", "compliance_status": "unreviewed", '
        '"evidence": "", "notes": ""}]}. Carry over every field from each '
        "requirement and add `domain` plus the empty compliance columns exactly "
        'as shown (compliance_status is always "unreviewed" in Phase 1; '
        "capability-based verdicts come later). The `domain` MUST be one of the "
        "listed ids. Include EVERY requirement — the row count must equal the "
        "requirement count. Write only the JSON file; reply with a one-line "
        "summary of the domain distribution."
    ),
}

critique_subagent: SubAgent = {
    "name": "critique-agent",
    "description": (
        "Quality-checks the shred for recall and traceability. Use after "
        "compliance_matrix.json is written, before replying to the user."
    ),
    "system_prompt": (
        "You are a meticulous compliance reviewer. Using `read_file`, compare "
        "`source/requirement_candidates.json` (the recall floor) against "
        "`compliance_matrix.json`. Check: (1) RECALL — is every candidate "
        "sentence reflected by at least one matrix row? List any that appear "
        "dropped. (2) TRACEABILITY — does every row have a non-empty `verbatim`, "
        "a `page`, and a `section_id`? (3) DOMAINS — is every `domain` one of the "
        "allowed ids (" + ", ".join(DOMAIN_IDS) + ")? Reply with a concise, "
        "numbered list of concrete problems to fix, or 'No issues found.' Do not "
        "edit the files yourself."
    ),
}


ORCHESTRATOR_PROMPT = """You orchestrate the analysis of a customer RFP into a \
structured, traceable compliance matrix. The user gives you a pointer to an \
uploaded RFP PDF (a gs:// URI or an object path).

Follow this process:
1. Use `write_todos` to lay out the steps below so the user can watch progress.
2. Call `ingest_rfp` with the user's PDF pointer. This stages \
`source/rfp_pages.json` and `source/requirement_candidates.json`. If ingestion \
reports it is unavailable, relay that plainly and stop — do not invent content.
3. Delegate to the `structure-agent` subagent (via `task`) to write \
`outline.json`.
4. Delegate to the `requirements-agent` subagent to write `requirements.json`, \
covering every candidate sentence with exact `verbatim` source text.
5. Delegate to the `domain-agent` subagent to assign domains and write \
`compliance_matrix.json`.
6. Delegate to the `critique-agent` subagent to check recall and traceability. \
If it finds gaps, re-run the relevant subagent to fix them, then re-check.
7. Reply to the user with a short summary: pages ingested, requirements \
extracted, the domain distribution, and any caveats. The full editable matrix \
lives in `compliance_matrix.json` for the UI — do NOT paste the whole matrix \
into your reply.

Be rigorous about traceability: every requirement must carry its exact source \
text, page, and section. Never fabricate requirements or pad the matrix."""


agent = create_deep_agent(
    model=model,
    tools=[ingest_rfp],
    system_prompt=ORCHESTRATOR_PROMPT,
    subagents=[
        structure_subagent,
        requirements_subagent,
        domain_subagent,
        critique_subagent,
    ],
)


if __name__ == "__main__":
    # Single-turn smoke test (no server, no persistence needed). Needs GCP creds
    # for Gemini + GCS, RFP_BUCKET set, and a sample PDF in the bucket. Pass the
    # PDF pointer as the first arg.
    pointer = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
    result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": f"Analyze the RFP at {pointer} and build the compliance matrix.",
                }
            ]
        }
    )
    print(result["messages"][-1].content)
