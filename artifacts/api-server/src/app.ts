import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import http from "http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// ---------------------------------------------------------------------------
// Proxy /api-python/* → FastAPI on port 8008
//
// MUST be registered BEFORE express.json() / express.urlencoded() because
// those body-parser middlewares consume the readable stream.  Once consumed,
// req.pipe(proxyReq) forwards an empty body — FastAPI hangs waiting for
// form/JSON bytes that never arrive.  Placing the proxy here ensures the
// raw Node.js stream is still intact when we pipe it downstream.
//
// WebSocket upgrades for /api-python/* (e.g. /voice/ws) are handled in
// index.ts via server.on('upgrade', ...) — http.request() alone cannot
// negotiate a 101 Switching Protocols handshake.
// ---------------------------------------------------------------------------
app.use("/api-python", (req, res) => {
  const proxyReq = http.request(
    {
      hostname: "localhost",
      port: 8008,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    },
  );
  req.pipe(proxyReq, { end: true });
  proxyReq.on("error", (err) => {
    logger.warn({ err }, "Python API proxy error");
    if (!res.headersSent) {
      res.status(502).json({ error: "Python API unavailable", detail: err.message });
    }
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
