import express, { type Request, type Response, type NextFunction } from "express";

/**
 * Create and configure the Express app.
 * Keep this file free of `listen()` so it's easy to test.
 */
export function createApp() {
  const app = express();

  // ---- Middleware ----
  app.use(express.json({ limit: "1mb" }));

  // Simple request logger (replace with pino later if you want)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  });

  // ---- Routes ----
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // API base (we'll mount real routers here soon)
  app.get("/api", (_req, res) => {
    res.json({
      ok: true,
      service: "luxpass-backend",
      routes: [
        "GET /health",
        "GET /api",
        // upcoming:
        // "GET /api/passports/:passportObjectAddr",
        // "GET /api/issuers/:address/is-allowed",
      ],
    });
  });

  // ---- 404 ----
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  // ---- Error handler ----
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[app] unhandled error:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  });

  return app;
}