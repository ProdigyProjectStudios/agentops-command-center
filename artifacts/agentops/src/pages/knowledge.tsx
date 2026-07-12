import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, FileText, Loader2, Search, Sparkles, Zap } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import {
  useListKnowledge,
  type KnowledgeDocument,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { IllNoKnowledge } from "@/components/illustrations";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PAGE } from "@/lib/copy";
import { cn } from "@/lib/utils";

type SearchHit = {
  chunkId: number;
  documentId: number;
  title: string;
  category: string;
  snippet: string;
  score: number;
};

type SearchResponse = {
  status: string;
  mode: "vector" | "keyword_fallback" | "empty";
  results: SearchHit[];
  embeddingMode?: string;
  reason?: string;
};

type EmbedState = "idle" | "loading" | "done" | "error";

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

  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [embedStates, setEmbedStates] = useState<Record<number, EmbedState>>({});

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setSearchResult(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch("/api/knowledge/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: q, limit: 5 }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SearchResponse;
        setSearchResult(data);
      } catch {
        setSearchResult({ status: "error", mode: "empty", results: [] });
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleEmbed = useCallback(
    async (docId: number) => {
      setEmbedStates((prev) => ({ ...prev, [docId]: "loading" }));
      try {
        const res = await fetch(`/api/knowledge/${docId}/embed`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setEmbedStates((prev) => ({ ...prev, [docId]: "done" }));
        if (query.trim().length >= 2) {
          const sr = await fetch("/api/knowledge/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: query.trim(), limit: 5 }),
          });
          if (sr.ok) setSearchResult((await sr.json()) as SearchResponse);
        }
      } catch {
        setEmbedStates((prev) => ({ ...prev, [docId]: "error" }));
      }
    },
    [query],
  );

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
          <h2
            className="text-2xl font-semibold tracking-tight"
            data-testid="text-page-title"
          >
            {PAGE.knowledge.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {PAGE.knowledge.subtitle}
          </p>
        </div>

        {error && (
          <ErrorState
            title="Couldn't load the knowledge base"
            description={
              error instanceof Error
                ? error.message
                : "The knowledge API didn't respond."
            }
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
                  placeholder="Search knowledge base…"
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
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.22,
                      ease: "easeOut",
                      delay: Math.min(idx, 10) * 0.03,
                    }}
                    data-testid={`doc-card-${doc.id}`}
                    className={cn(
                      "rounded-md border transition-colors hover-elevate cursor-pointer",
                      selected?.id === doc.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-card-border bg-card",
                    )}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(doc.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedId(doc.id)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="size-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {doc.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span className="px-1.5 py-px rounded bg-muted">
                              {doc.category}
                            </span>
                            <span>updated {formatRelative(doc.updatedAt)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                            {doc.summary}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="px-3 pb-3 -mt-1">
                      <EmbedButton
                        docId={doc.id}
                        state={embedStates[doc.id] ?? "idle"}
                        onEmbed={handleEmbed}
                      />
                    </div>
                  </motion.div>
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
                <DocumentView
                  doc={selected}
                  query={query}
                  searchResult={searchResult}
                  isSearching={isSearching}
                />
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="Pick a document"
                  description="Choose a document on the left to see its contents and run a real vector search."
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

function EmbedButton({
  docId,
  state,
  onEmbed,
}: {
  docId: number;
  state: EmbedState;
  onEmbed: (id: number) => void;
}) {
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-6 text-[11px] px-2 gap-1",
          state === "done" && "border-emerald-500/40 text-emerald-400",
          state === "error" && "border-red-500/40 text-red-400",
        )}
        disabled={state === "loading"}
        onClick={() => onEmbed(docId)}
        data-testid={`btn-embed-${docId}`}
      >
        {state === "loading" ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Zap className="size-3" />
        )}
        {state === "idle" && "Generate embeddings"}
        {state === "loading" && "Embedding…"}
        {state === "done" && "Re-embed"}
        {state === "error" && "Retry embed"}
      </Button>
    </div>
  );
}

function modeBadge(mode: string, embeddingMode?: string) {
  if (mode === "vector") {
    const isLive = embeddingMode === "live";
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] h-5 px-1.5",
          isLive
            ? "border-emerald-500/40 text-emerald-400"
            : "border-amber-500/40 text-amber-400",
        )}
      >
        {isLive ? "pgvector · live" : "pgvector · demo"}
      </Badge>
    );
  }
  if (mode === "keyword_fallback") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-5 px-1.5 border-amber-500/40 text-amber-400"
      >
        keyword fallback
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] h-5 px-1.5 border-muted-foreground/30 text-muted-foreground"
    >
      no results
    </Badge>
  );
}

function DocumentView({
  doc,
  query,
  searchResult,
  isSearching,
}: {
  doc: KnowledgeDocument;
  query: string;
  searchResult: SearchResponse | null;
  isSearching: boolean;
}) {
  return (
    <>
      <Card className="p-6 bg-card border-card-border">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              {doc.category}
            </div>
            <h3
              className="text-xl font-semibold"
              data-testid="text-doc-title"
            >
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
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Sparkles className="size-4 text-primary shrink-0" />
          <h4 className="text-sm font-semibold">Retrieved Context</h4>
          {searchResult && modeBadge(searchResult.mode, searchResult.embeddingMode)}
          {isSearching && (
            <Loader2 className="size-3 text-muted-foreground animate-spin ml-auto" />
          )}
        </div>

        <AnimatePresence mode="wait">
          {!query.trim() || query.trim().length < 2 ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground"
            >
              Type at least 2 characters in the search box to run a real pgvector similarity search.
            </motion.p>
          ) : isSearching && !searchResult ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </motion.div>
          ) : searchResult && searchResult.results.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-xs text-muted-foreground">
                No matching chunks found.{" "}
                {searchResult.mode === "empty" && (
                  <span>
                    Use the <strong>Generate embeddings</strong> button on a document
                    to populate the vector index first.
                  </span>
                )}
              </p>
            </motion.div>
          ) : searchResult ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {searchResult.results.map((hit, idx) => (
                <div
                  key={hit.chunkId}
                  className="border border-border rounded p-3 bg-background/40"
                  data-testid={`chunk-${idx}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {hit.title}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        chunk {hit.chunkId}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-mono px-1 rounded",
                          hit.score > 0.7
                            ? "bg-emerald-500/15 text-emerald-400"
                            : hit.score > 0.4
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {hit.score.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/90">{hit.snippet}</p>
                </div>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>
    </>
  );
}
