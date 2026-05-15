import { test } from "node:test";
import assert from "node:assert/strict";
import type { ZodTypeAny } from "zod";
import type { OperationalRequest } from "@workspace/db";
import {
  opsTriageSchema,
  memoryLookupSchema,
  legalReviewSchema,
  financeReviewSchema,
  communicationsSchema,
  synthesisSchema,
} from "../orchestration/schemas";
import {
  fingerprintRequest,
  opsTriageDemo,
  memoryLookupDemo,
  legalReviewDemo,
  financeReviewDemo,
  communicationsDemo,
  synthesisDemo,
} from "../orchestration/demo-outputs";

function makeRequest(
  overrides: Partial<OperationalRequest> = {},
): OperationalRequest {
  return {
    id: 1,
    portfolioCompanyId: 1,
    title: "Hire a roofing contractor for HQ repair",
    description:
      "We need to engage a roofing contractor to repair the HQ facility roof before winter.",
    department: "Facilities",
    priority: "medium",
    requestedBy: "alex@portfolio.test",
    createdAt: new Date(),
    ...overrides,
  };
}

const cases: Array<{
  name: string;
  schema: ZodTypeAny;
  build: (r: OperationalRequest) => Record<string, unknown>;
}> = [
  {
    name: "opsTriageDemo satisfies opsTriageSchema",
    schema: opsTriageSchema,
    build: (r) => opsTriageDemo(r, fingerprintRequest(r)),
  },
  {
    name: "memoryLookupDemo satisfies memoryLookupSchema",
    schema: memoryLookupSchema,
    build: (r) => memoryLookupDemo(r, fingerprintRequest(r)),
  },
  {
    name: "legalReviewDemo satisfies legalReviewSchema",
    schema: legalReviewSchema,
    build: (r) => legalReviewDemo(r, fingerprintRequest(r)),
  },
  {
    name: "financeReviewDemo satisfies financeReviewSchema",
    schema: financeReviewSchema,
    build: (r) => financeReviewDemo(r, fingerprintRequest(r)),
  },
  {
    name: "communicationsDemo satisfies communicationsSchema",
    schema: communicationsSchema,
    build: (r) => communicationsDemo(r, fingerprintRequest(r)),
  },
  {
    name: "synthesisDemo satisfies synthesisSchema",
    schema: synthesisSchema,
    build: (r) => synthesisDemo(r, fingerprintRequest(r)),
  },
];

// Exercise multiple scenarios so we hit branches inside the demo builders
// (low-risk vs high-risk vs critical, different priorities, etc).
const scenarios: OperationalRequest[] = [
  makeRequest(),
  makeRequest({
    title: "Approve marketing campaign budget",
    description: "Quarterly ad spend across paid social.",
    department: "Marketing",
    priority: "high",
  }),
  makeRequest({
    title: "Lay off underperforming sales team",
    description: "Initiate layoff and termination process for 12 employees.",
    department: "People",
    priority: "urgent",
  }),
  makeRequest({
    title: "Renew SaaS license",
    description: "Renew our software license for the analytics tool.",
    department: "Engineering",
    priority: "low",
  }),
];

for (const c of cases) {
  test(c.name, () => {
    for (const req of scenarios) {
      const demo = c.build(req);
      const result = c.schema.safeParse(demo);
      assert.ok(
        result.success,
        `Demo output for "${req.title}" did not satisfy schema: ${
          result.success ? "" : JSON.stringify(result.error.issues, null, 2)
        }`,
      );
    }
  });
}
