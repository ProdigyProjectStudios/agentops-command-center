import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, FileText, Search, Sparkles } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import {
  useListKnowledge,
  type KnowledgeDocument,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { IllNoKnowledge } from "@/components/illustrations";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PAGE } from "@/lib/copy";
import { cn } from "@/lib/utils";

// Read `?doc=<id>` from the URL so deep-links from elsewhere (e.g. the
// Retrieved Memory section on a workflow detail page) auto-select the document.
function useDocQueryParam(): number | null {
  const [docId, setDocId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("doc");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  useEffect(() => {
    const onChange = () => {
      const v = new URLSearchParams(window.location.search).get("doc");
      const n = v ? Number(v) : NaN;
      setDocId(Number.isFinite(n) ? n : null);
    };
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return docId;
}

export default function KnowledgePage() {
  const { data, isLoading, error, refetch } = useListKnowledge();
  const [query, setQuery] = useState("");
  const initialDocId = useDocQueryParam();
  const [selectedId, setSelectedId] = useState<number | null>(initialDocId);
  // When the URL `?doc=` lands after data loads, auto-select and scroll to it.
  useEffect(() => {
    if (initialDocId == null || !data) return;
    if ((data ?? []).some((d) => d.id === initialDocId)) {
      setSelectedId(initialDocId);
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-testid="doc-card-${initialDocId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [initialDocId, data]);

  const filtered = useMemo(() => {
    const docs = data ?? [];
    if (!query.trim()) return docs;
    const q = query.toLowerCase();
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q),
    );
  }, [data, query]);

  const selected =
    (data ?? []).find((d) => d.id === selectedId) ?? filtered[0] ?? null;

  return (
    <PageTransition>
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          {PAGE.knowledge.title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{PAGE.knowledge.subtitle}</p>
      </div>

      {error && (
        <ErrorState
          title="Couldn't load the knowledge base"
          description={error instanceof Error ? error.message : "The knowledge API didn't respond."}
          onRetry={() => refetch()}
          testId="error-knowledge"
        />
      )}

      {!error && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="pl-9"
              data-testid="input-knowledge-search"
            />
          </div>

          {isLoading && (
            <LoadingState
              icon={BookOpen}
              title="Loading knowledge base"
              description="Pulling SOPs and policy docs the agents ground in…"
              variant="bare"
              testId="loading-knowledge"
            >
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </LoadingState>
          )}

          <div className="space-y-2">
            {filtered.map((doc, idx) => (
              <motion.button
                key={doc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut", delay: Math.min(idx, 10) * 0.03 }}
                onClick={() => setSelectedId(doc.id)}
                data-testid={`doc-card-${doc.id}`}
                className={cn(
                  "w-full text-left p-3 rounded-md border transition-colors hover-elevate",
                  selected?.id === doc.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-card-border bg-card",
                )}
              >
                <div className="flex items-start gap-2">
                  <FileText className="size-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{doc.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span className="px-1.5 py-px rounded bg-muted">{doc.category}</span>
                      <span>updated {formatRelative(doc.updatedAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {doc.summary}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
            {!isLoading && filtered.length === 0 && (
              <EmptyState
                illustration={<IllNoKnowledge />}
                title="No matches"
                description={
                  query
                    ? `Nothing in the knowledge base matches "${query}".`
                    : "The knowledge base is empty."
                }
                tone="muted"
                testId="empty-knowledge"
              />
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <DocumentView doc={selected} query={query} />
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Pick a document"
              description="Choose a document on the left to see its contents and a simulated retrieval preview."
              tone="muted"
              testId="empty-knowledge-detail"
            />
          )}
        </div>
      </div>
      )}
    </div>
    </PageTransition>
  );
}

function DocumentView({ doc, query }: { doc: KnowledgeDocument; query: string }) {
  const chunks = useMemo(() => splitIntoChunks(doc.content), [doc.content]);
  const ranked = useMemo(() => rankChunks(chunks, query), [chunks, query]);

  return (
    <>
      <Card className="p-6 bg-card border-card-border">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              {doc.category}
            </div>
            <h3 className="text-xl font-semibold" data-testid="text-doc-title">
              {doc.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{doc.summary}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            updated {formatRelative(doc.updatedAt)}
          </div>
        </div>
        <div
          className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground/90"
          data-testid="text-doc-content"
        >
          {doc.content}
        </div>
      </Card>

      <Card className="p-6 bg-gradient-to-br from-primary/5 to-card border-primary/30">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h4 className="text-sm font-semibold">Retrieved Context Preview</h4>
          <span className="text-[11px] text-muted-foreground">
            {query ? `top chunks for "${query}"` : "top chunks (showing first matches)"}
          </span>
        </div>
        <div className="space-y-2">
          {ranked.slice(0, 3).map((chunk, idx) => (
            <div
              key={idx}
              className="border border-border rounded p-3 bg-background/40"
              data-testid={`chunk-${idx}`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                chunk {idx + 1} · score {chunk.score.toFixed(2)}
              </div>
              <p className="text-xs text-foreground/90">
                {highlightText(chunk.text, query)}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function splitIntoChunks(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function rankChunks(chunks: string[], query: string): { text: string; score: number }[] {
  const q = query.trim().toLowerCase();
  const scored = chunks.map((text, idx) => {
    if (!q) return { text, score: 1 - idx * 0.1 };
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of q.split(/\s+/)) {
      if (!term) continue;
      const matches = (lower.match(new RegExp(escapeRegex(term), "g")) ?? []).length;
      score += matches * 0.5;
    }
    return { text, score };
  });
  return scored.sort((a, b) => b.score - a.score);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(q)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-primary/30 text-primary-foreground px-0.5 rounded">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
