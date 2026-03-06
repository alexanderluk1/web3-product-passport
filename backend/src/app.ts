import express, { type Request, type Response, type NextFunction } from "express";
import { passportRouter } from "./modules/passport/passport.routes";
import authRouter from "./modules/auth/routes/auth.routes";

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

  // API Documentation
  app.get("/api", (_req, res) => {
    res.json({
      ok: true,
      service: "luxpass-backend",
      routes: [
        "GET /health",
        "GET /api",
        "GET /api/passports/:passportObjectAddr",
        // upcoming:
        	// 1.	GET /api/passports/:passportAddr → get_passport
            // 2.	GET /api/issuers/:addr/is-allowed → is_issuer
            // 3.	POST /api/passports/verify → hash compare + status check

            // Then later:
            // 4. POST /api/passports/mint (server-signed)
            // 5. POST /api/passports/:addr/status (server-signed)
            // 6. GET /api/passports/:addr/activity (events timeline)
      ],
    });
  });

  // Actual route 
  app.use("/api/passports", passportRouter)
  app.use("/auth", authRouter);

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
