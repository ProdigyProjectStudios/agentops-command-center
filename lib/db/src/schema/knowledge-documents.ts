import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const knowledgeDocumentsTable = pgTable("knowledge_documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull().default(""),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertKnowledgeDocumentSchema = createInsertSchema(
  knowledgeDocumentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKnowledgeDocument = z.infer<
  typeof insertKnowledgeDocumentSchema
>;
export type KnowledgeDocument = typeof knowledgeDocumentsTable.$inferSelect;
