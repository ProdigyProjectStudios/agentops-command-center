import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const proofRunsTable = pgTable(
  "proof_runs",
  {
    id: text("id").primaryKey(),
    ownerHash: text("owner_hash").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("proof_runs_owner_idx").on(t.ownerHash)],
);
export const proofReceiptsTable = pgTable("proof_receipts", {
  runId: text("run_id")
    .primaryKey()
    .references(() => proofRunsTable.id),
  snapshot: jsonb("snapshot").notNull(),
});
export const proofSharesTable = pgTable("proof_shares", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => proofRunsTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
