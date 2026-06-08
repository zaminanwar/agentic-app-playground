/**
 * Display metadata for the fixed capability-domain taxonomy.
 *
 * The ids here MUST stay in sync with agent/taxonomy.py (the agent assigns one
 * of these ids to every requirement). This module adds UI-only labels and badge
 * colors; the agent never sees it.
 */

import type { ComplianceStatus } from "./rfp-types";

export interface DomainMeta {
  id: string;
  label: string;
  /** Tailwind classes for the domain badge. */
  badge: string;
}

export const DOMAINS: DomainMeta[] = [
  { id: "cybersecurity", label: "Cybersecurity", badge: "bg-red-50 text-red-700 border-red-200" },
  { id: "cloud-infrastructure", label: "Cloud & Infra", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "software-engineering", label: "Software Eng", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  { id: "data-analytics", label: "Data & Analytics", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "networking", label: "Networking", badge: "bg-teal-50 text-teal-700 border-teal-200" },
  { id: "program-management", label: "Program Mgmt", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "staffing-personnel", label: "Staffing", badge: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "operations-support", label: "Operations", badge: "bg-lime-50 text-lime-700 border-lime-200" },
  { id: "compliance-regulatory", label: "Compliance", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "contracts-administration", label: "Contracts", badge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { id: "general", label: "General", badge: "bg-gray-100 text-gray-600 border-gray-200" },
];

const DOMAIN_BY_ID = new Map(DOMAINS.map((d) => [d.id, d]));

export function domainMeta(id: string): DomainMeta {
  return DOMAIN_BY_ID.get(id) ?? { id, label: id, badge: "bg-gray-100 text-gray-600 border-gray-200" };
}

export const DOMAIN_IDS: string[] = DOMAINS.map((d) => d.id);

/** Badge color + label for a compliance status. */
export const STATUS_META: Record<ComplianceStatus, { label: string; badge: string }> = {
  unreviewed: { label: "Unreviewed", badge: "bg-gray-100 text-gray-600 border-gray-200" },
  compliant: { label: "Compliant", badge: "bg-green-50 text-green-700 border-green-200" },
  partial: { label: "Partial", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  "non-compliant": { label: "Non-compliant", badge: "bg-red-50 text-red-700 border-red-200" },
  "not-applicable": { label: "N/A", badge: "bg-slate-100 text-slate-500 border-slate-200" },
};
