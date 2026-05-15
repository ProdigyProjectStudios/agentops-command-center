// Centralized voice & microcopy for AgentOps. Keep tone: precise, calm, executive.

export const PRODUCT = {
  name: "AgentOps Command Center",
  shortName: "AgentOps",
  tagline: "Multi-agent enterprise operations, on the record.",
  pillars: [
    "Multi-agent triage",
    "Human-in-the-loop approvals",
    "Shared memory",
    "Tool execution",
    "Traceable audit log",
    "Portfolio visibility",
  ],
} as const;

export const PAGE = {
  dashboard: {
    eyebrow: "Operations",
    title: "Command Center",
    subtitle:
      "A live cockpit for every operational request crossing your portfolio — triaged, reviewed, and routed by a coordinated agent crew.",
  },
  workflows: {
    title: "Workflows",
    subtitle:
      "Every operational request the agent crew has triaged, reviewed, and recommended on.",
  },
  approvals: {
    title: "Approval Queue",
    subtitle:
      "Decisions the agents have escalated to a human, with the evidence and recommendation attached.",
  },
  knowledge: {
    title: "Knowledge Base",
    subtitle:
      "Policy documents and SOPs the agents ground their reasoning in.",
  },
  toolCalls: {
    title: "Tool Call Ledger",
    subtitle:
      "Forensic log of every external API call agents have issued — input, output, latency, status.",
  },
  agents: {
    title: "Agent Directory",
    subtitle: "The specialist agents on rotation, with live health and recent activity.",
  },
  newRequest: {
    title: "New Operational Request",
    subtitle:
      "File a request for the agent crew to triage, analyze, and route for approval.",
  },
  overview: {
    title: "Why AgentOps",
    subtitle:
      "A working reference implementation of a multi-agent enterprise operations platform.",
  },
} as const;
