import {
  db,
  knowledgeDocumentsTable,
  memoryChunksTable,
} from "@workspace/db";
import { ilike, inArray, or, type SQL } from "drizzle-orm";
import type { RecordedToolCall } from "../../orchestration/types";

export interface MemoryHit {
  documentId: number;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

export interface MemorySearchResult {
  hits: MemoryHit[];
  toolCall: RecordedToolCall;
  tokens: string[];
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "are", "was",
  "have", "has", "will", "would", "our", "your", "their", "you", "they", "them",
  "what", "when", "where", "which", "but", "not", "need", "needs", "please",
  "want", "about", "also", "each", "more", "most", "some", "such", "than",
  "then", "there", "these", "those", "very", "just", "only", "over", "under",
]);

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    ),
  ).slice(0, 12);
}

/**
 * Pluggable searcher interface so we can swap the keyword-only implementation
 * for a vector / pgvector / hybrid search later without touching node code.
 */
export interface KeywordSearcher {
  search(
    query: string,
    opts?: { limit?: number },
  ): Promise<MemorySearchResult>;
}

function score(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    s += lower.split(t).length - 1;
  }
  return s;
}

function emptyResult(
  query: string,
  tokens: string[],
  durationMs: number,
): MemorySearchResult {
  return {
    hits: [],
    tokens,
    toolCall: {
      toolName: "memory_search",
      status: "success",
      input: { query, tokens, strategy: "ilike-keyword" },
      output: { hits: [] },
      outputSummary: tokens.length
        ? `No knowledge-base matches for [${tokens.slice(0, 4).join(", ")}].`
        : "No tokens extracted from query.",
      durationMs,
    },
  };
}

export const keywordSearcher: KeywordSearcher = {
  async search(query, opts) {
    const limit = opts?.limit ?? 5;
    const startedAt = Date.now();
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return emptyResult(query, tokens, Date.now() - startedAt);
    }

    const docConds: SQL[] = [];
    for (const t of tokens) {
      const pat = `%${t}%`;
      docConds.push(ilike(knowledgeDocumentsTable.title, pat));
      docConds.push(ilike(knowledgeDocumentsTable.summary, pat));
      docConds.push(ilike(knowledgeDocumentsTable.content, pat));
    }
    const docMatches = await db
      .select({
        id: knowledgeDocumentsTable.id,
        title: knowledgeDocumentsTable.title,
        category: knowledgeDocumentsTable.category,
        summary: knowledgeDocumentsTable.summary,
        content: knowledgeDocumentsTable.content,
      })
      .from(knowledgeDocumentsTable)
      .where(or(...docConds))
      .limit(50);

    const chunkConds: SQL[] = tokens.map((t) =>
      ilike(memoryChunksTable.content, `%${t}%`),
    );
    const chunkMatches = chunkConds.length
      ? await db
          .select({
            documentId: memoryChunksTable.documentId,
            content: memoryChunksTable.content,
          })
          .from(memoryChunksTable)
          .where(or(...chunkConds))
          .limit(50)
      : [];

    const scored = new Map<number, MemoryHit>();
    for (const d of docMatches) {
      const docScore = score(`${d.title} ${d.summary} ${d.content}`, tokens);
      const snippet = (d.summary || d.content).slice(0, 240);
      scored.set(d.id, {
        documentId: d.id,
        title: d.title,
        category: d.category,
        snippet,
        score: docScore,
      });
    }
    // Backfill any docs that ONLY matched via chunk content (so chunk-only
    // hits aren't silently dropped).
    const missingDocIds = Array.from(
      new Set(
        chunkMatches
          .map((c) => c.documentId)
          .filter((id) => !scored.has(id)),
      ),
    );
    if (missingDocIds.length > 0) {
      const extraDocs = await db
        .select({
          id: knowledgeDocumentsTable.id,
          title: knowledgeDocumentsTable.title,
          category: knowledgeDocumentsTable.category,
          summary: knowledgeDocumentsTable.summary,
          content: knowledgeDocumentsTable.content,
        })
        .from(knowledgeDocumentsTable)
        .where(inArray(knowledgeDocumentsTable.id, missingDocIds));
      for (const d of extraDocs) {
        scored.set(d.id, {
          documentId: d.id,
          title: d.title,
          category: d.category,
          snippet: (d.summary || d.content).slice(0, 240),
          score: 0,
        });
      }
    }

    for (const c of chunkMatches) {
      const s = score(c.content, tokens);
      const existing = scored.get(c.documentId);
      if (existing) {
        existing.score += s;
        if (!existing.snippet) existing.snippet = c.content.slice(0, 240);
      }
    }

    const hits = Array.from(scored.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    const durationMs = Date.now() - startedAt;
    return {
      hits,
      tokens,
      toolCall: {
        toolName: "memory_search",
        status: "success",
        input: { query, tokens, strategy: "ilike-keyword" },
        output: {
          hits: hits.map((h) => ({
            documentId: h.documentId,
            title: h.title,
            category: h.category,
            score: h.score,
          })),
        },
        outputSummary: hits.length
          ? `Matched ${hits.length} document(s) on keywords [${tokens.slice(0, 4).join(", ")}].`
          : `No keyword matches for [${tokens.slice(0, 4).join(", ")}].`,
        durationMs,
      },
    };
  },
};
