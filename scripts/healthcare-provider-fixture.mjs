// CI-only HTTP provider contract fixture. Never deploy this as an AI provider.
import http from "node:http";
if (process.env.NODE_ENV !== "test")
  throw new Error("The provider fixture is test-only.");
http
  .createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1e6) throw new Error("Request too large");
      }
      const request = JSON.parse(body);
      const context = JSON.parse(
        request.messages.find((m) => m.role === "user").content,
      );
      if (!context.healthcareTask || !context.sourceDocuments?.length)
        throw new Error("Expected full healthcare evidence");
      if (
        context.sourceDocuments.some((d) =>
          d.text.includes("TEST_PROVIDER_FAILURE"),
        )
      ) {
        res.writeHead(503).end("Test provider unavailable");
        return;
      }
      const notes = context.findings.map((f) => ({
        findingId: f.id,
        citationIds: f.citationIds,
        explanation: `CI provider fixture, not real AI: inspect the supplied ${f.label.toLowerCase()} evidence and its policy criterion.`,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "fixture-completion",
          object: "chat.completion",
          model: request.model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({ notes }),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 150,
            total_tokens: 250,
          },
        }),
      );
    } catch {
      res.writeHead(400).end("Invalid test fixture request");
    }
  })
  .listen(8091, "127.0.0.1");
