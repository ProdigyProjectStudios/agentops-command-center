import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { knowledgeDocumentsTable } from "./knowledge-documents";

export const memoryChunksTable = pgTable("memory_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => knowledgeDocumentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  tokens: integer("tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMemoryChunkSchema = createInsertSchema(
  memoryChunksTable,
).omit({ id: true, createdAt: true });
export type InsertMemoryChunk = z.infer<typeof insertMemoryChunkSchema>;
export type MemoryChunk = typeof memoryChunksTable.$inferSelect;
