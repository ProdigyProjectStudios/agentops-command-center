import http from "http";
import net from "net";
import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { migrateProof } from "./lib/proof-store";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
// Provision additive proof tables before accepting requests.
await migrateProof(pool);

// ---------------------------------------------------------------------------
// WebSocket upgrade proxy — /api-python/* → FastAPI on port 8008
//
// http.request() inside app.ts cannot negotiate a 101 Switching Protocols
// response.  WebSocket upgrades must be tunnelled at the raw TCP level here
// before Express sees them.  This handles Twilio Media Streams connecting to
// /api-python/voice/ws (and any future WS endpoints under /api-python/).
// ---------------------------------------------------------------------------
server.on("upgrade", (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
  if (!req.url?.startsWith("/api-python/")) {
    socket.destroy();
    return;
  }

  // Strip /api-python prefix — FastAPI registers routes without it
  const targetPath = req.url.slice("/api-python".length) || "/";

  logger.info({ url: req.url, targetPath }, "WS upgrade: proxying to api-python");

  const proxyReq = http.request({
    hostname: "localhost",
    port: 8008,
    path: targetPath,
    method: req.method ?? "GET",
    headers: req.headers,
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket: net.Socket) => {
    // Build the 101 response to send back to Twilio
    const statusLine = `HTTP/1.1 101 Switching Protocols\r\n`;
    const headers = Object.entries(proxyRes.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\r\n");

    socket.write(`${statusLine}${headers}\r\n\r\n`);
    if (head?.length) proxySocket.unshift(head);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    socket.on("error", (err) => {
      logger.warn({ err }, "WS client socket error");
      proxySocket.destroy();
    });
    proxySocket.on("error", (err) => {
      logger.warn({ err }, "WS proxy socket error");
      socket.destroy();
    });
    socket.on("close", () => proxySocket.destroy());
    proxySocket.on("close", () => socket.destroy());
  });

  proxyReq.on("error", (err) => {
    logger.warn({ err }, "WS upgrade proxy error");
    socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    socket.destroy();
  });

  proxyReq.end();
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
