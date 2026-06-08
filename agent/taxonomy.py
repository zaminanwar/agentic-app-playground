"""Fixed capability-domain taxonomy for classifying RFP requirements.

The `domain-agent` subagent assigns every extracted requirement to exactly one
of these domains. Keeping the taxonomy here (rather than inferring it per-RFP)
gives consistent, comparable domains across documents and lets proposal teams
route requirements to the same SME groups every time. Edit this list to match
your organization's disciplines — the agent reads it at import time.

Each domain has a stable `id` (what gets stored on every matrix row), a human
`name`, and a short `description` that disambiguates it for the classifier.
"""

from __future__ import annotations

from typing import TypedDict


class Domain(TypedDict):
    id: str
    name: str
    description: str


DOMAINS: list[Domain] = [
    {
        "id": "cybersecurity",
        "name": "Cybersecurity & Information Assurance",
        "description": (
            "Security controls, RMF/ATO, encryption, IAM, vulnerability and "
            "incident response, NIST 800-53/171, zero trust, audit logging."
        ),
    },
    {
        "id": "cloud-infrastructure",
        "name": "Cloud & Infrastructure",
        "description": (
            "Cloud platforms (AWS/Azure/GCP), IaC, containers/Kubernetes, "
            "compute, storage, hosting, environments, disaster recovery."
        ),
    },
    {
        "id": "software-engineering",
        "name": "Software Engineering & Development",
        "description": (
            "Application development, APIs, microservices, DevSecOps/CI-CD, "
            "agile delivery, modernization, and code quality."
        ),
    },
    {
        "id": "data-analytics",
        "name": "Data & Analytics",
        "description": (
            "Data engineering, pipelines, data warehouses/lakes, BI, dashboards, "
            "machine learning/AI, and data governance."
        ),
    },
    {
        "id": "networking",
        "name": "Networking & Telecommunications",
        "description": (
            "LAN/WAN, SD-WAN, routing/switching, VPN, voice/UC, bandwidth, "
            "and network performance or availability."
        ),
    },
    {
        "id": "program-management",
        "name": "Program & Project Management",
        "description": (
            "PMO, schedule/cost/scope, EVM, risk and quality management, "
            "reporting, governance, and meetings/deliverables cadence."
        ),
    },
    {
        "id": "staffing-personnel",
        "name": "Staffing & Personnel",
        "description": (
            "Key personnel, labor categories, qualifications, certifications, "
            "clearances, staffing plans, and surge capacity."
        ),
    },
    {
        "id": "operations-support",
        "name": "Operations & Sustainment",
        "description": (
            "Help desk/service desk, O&M, SLAs, ITIL, monitoring, maintenance, "
            "and ongoing user support."
        ),
    },
    {
        "id": "compliance-regulatory",
        "name": "Compliance & Regulatory",
        "description": (
            "Statutes, regulations, Section 508/accessibility, privacy, FedRAMP, "
            "certifications, and policy adherence not covered by cybersecurity."
        ),
    },
    {
        "id": "contracts-administration",
        "name": "Contracts & Administration",
        "description": (
            "Terms and conditions, pricing/invoicing, deliverable acceptance, "
            "transition in/out, and administrative submissions."
        ),
    },
    {
        "id": "general",
        "name": "General / Unclassified",
        "description": (
            "Use ONLY when a requirement genuinely fits no other domain "
            "(e.g. boilerplate or cross-cutting instructions)."
        ),
    },
]

# Stable set of valid ids — used by the recall/QA checks and the prompt.
DOMAIN_IDS: list[str] = [d["id"] for d in DOMAINS]


def taxonomy_for_prompt() -> str:
    """Render the taxonomy as a compact bullet list for a subagent prompt."""
    return "\n".join(f"- {d['id']}: {d['name']} — {d['description']}" for d in DOMAINS)
