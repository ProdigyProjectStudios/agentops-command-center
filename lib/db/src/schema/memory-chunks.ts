import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  vector,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { knowledgeDocumentsTable } from "./knowledge-documents";

// Phase 1C: vector(1536) is sized for OpenAI text-embedding-3-small.
// Nullable on purpose — existing chunks remain valid until a backfill
// embedding job (run by the Python worker) populates this column. The
// keyword search path stays the source of truth in the Node engine
// until the production graph is migrated to the Python worker.
export const memoryChunksTable = pgTable("memory_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => knowledgeDocumentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  tokens: integer("tokens").notNull().default(0),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMemoryChunkSchema = createInsertSchema(
  memoryChunksTable,
).omit({ id: true, createdAt: true });
export type InsertMemoryChunk = z.infer<typeof insertMemoryChunkSchema>;
export type MemoryChunk = typeof memoryChunksTable.$inferSelect;
