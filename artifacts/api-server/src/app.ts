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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Proxy /api-python/* → FastAPI service on port 8008.
// Express strips the /api-python prefix so req.url inside this handler
// is the bare path FastAPI expects (e.g. /healthz, /intake, /workflow/1).
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

app.use("/api", router);

export default app;
