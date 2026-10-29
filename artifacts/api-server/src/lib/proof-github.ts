import { timingSafeEqual } from "node:crypto";
import type { ProofRun } from "@workspace/api-zod";
import { ProofError, ProofStore } from "./proof-store";

export function integrationAuthorized(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}

// Fixed provider and server-owned repository. Never accept a destination or token from the packet.
export class GithubProofHandoff {
  constructor(
    private store: ProofStore,
    private config: { repository: string; token: string },
    private request: typeof fetch = fetch,
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !config.token)
      throw new Error("Configure a dedicated GitHub demo repository and token");
  }
  private async call(path: string, body?: object) {
    const response = await this.request(
      `https://api.github.com/repos/${this.config.repository}/issues${path}`,
      {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) throw new Error("GitHub handoff unavailable");
    const issue = (await response.json()) as {
      number: number;
      html_url: string;
      body: string;
    };
    if (
      !Number.isSafeInteger(issue.number) ||
      issue.number < 1 ||
      issue.html_url !==
        `https://github.com/${this.config.repository}/issues/${issue.number}`
    )
      throw new Error("Invalid GitHub receipt");
    return issue;
  }
  async send(owner: string, id: string) {
    const run = await this.store.mutate(id, owner, (current) => {
      if (
        current.status !== "completed" ||
        current.review?.decision !== "approve"
      )
        throw new ProofError(
          409,
          "Complete approval and sandbox verification first.",
        );
      if (current.githubHandoff)
        throw new ProofError(
          409,
          "A handoff already exists. Verify the recorded issue; an uncertain delivery must be reconciled manually before another attempt.",
        );
      current.githubHandoff = {
        status: "sending",
        repository: this.config.repository,
        issueNumber: null,
        url: null,
        verifiedAt: null,
      };
    });
    const marker = `AgentOps run: ${run.id}\nFingerprint: ${run.analysis.fingerprint}`;
    try {
      // Minimal evidence only; source bodies, quotes, operator notes and credentials are excluded.
      const issue = await this.call("", {
        title: `[AgentOps synthetic proof] ${run.id}`,
        body: `${marker}\n\nWorkflow: ${run.input.workflow}\nPolicy checks: ${run.analysis.findings.length}\nSandbox receipt: ${run.receipt!.id}\n\nSynthetic demonstration handoff. No healthcare or financial action requested.`,
      });
      await this.store.mutate(id, owner, (current) => {
        current.githubHandoff = {
          status: "unverified",
          repository: this.config.repository,
          issueNumber: issue.number,
          url: issue.html_url,
          verifiedAt: null,
        };
      });
      return await this.verify(owner, id);
    } catch {
      await this.store.mutate(id, owner, (current) => {
        current.githubHandoff!.status = "unverified";
      });
      throw new ProofError(
        502,
        "GitHub delivery could not be verified. No automatic resend: inspect the demo repository to reconcile an uncertain result.",
      );
    }
  }
  async verify(owner: string, id: string): Promise<ProofRun> {
    const run = await this.store.get(owner, id),
      handoff = run.githubHandoff;
    if (!handoff?.issueNumber || handoff.repository !== this.config.repository)
      throw new ProofError(
        409,
        "No issue ID is available for verification. Reconcile the demo repository manually.",
      );
    try {
      const issue = await this.call(`/${handoff.issueNumber}`);
      if (
        issue.number !== handoff.issueNumber ||
        !issue.body?.includes(
          `AgentOps run: ${id}\nFingerprint: ${run.analysis.fingerprint}`,
        )
      )
        throw new Error("Evidence mismatch");
      return await this.store.mutate(id, owner, (current) => {
        current.githubHandoff!.status = "verified";
        current.githubHandoff!.verifiedAt = new Date().toISOString();
      });
    } catch {
      throw new ProofError(
        502,
        "The GitHub issue could not be independently verified.",
      );
    }
  }
}
