import express, { type Request, type Response, type NextFunction } from "express";
import { passportRouter } from "./modules/passport/routes/passport.routes";
import authRouter from "./modules/auth/routes/auth.routes";
import adminRegistryRouter from "./modules/admin/routes/adminRegistry.routes";
import issuerRegistryRoutes from "./modules/issuerRegistry/routes/issuerRegistry.routes"
import { lptRouter } from "./modules/luxpasstoken/routes/lpt.routes";
import { escrowRouter } from "./modules/passport/routes/escrow.routes";

/**
 * Create and configure the Express app.
 * Keep this file free of `listen()` so it's easy to test.
 */
export function createApp() {
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // ---- Middleware ----
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestOrigin = req.headers.origin;
    const isAllowedOrigin = !requestOrigin || allowedOrigins.includes(requestOrigin);

    if (!isAllowedOrigin) {
      return res.status(403).json({ ok: false, error: "CORS origin not allowed" });
    }

    if (requestOrigin) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return next();
  });

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
          
          // marketplace routes
          "POST /api/passports/status/prepare", // (Requires ADMIN/ISSUER)
          "POST /api/passports/status/record", // handles the on-chain ADMIN set status requests from the other parts of listing like receive, delist/approve and verify
          "POST /api/passports/metadata/prepare", //(Requires ADMIN/ISSUER, Multipart/Form-Data)
          "POST /api/passports/metadata/record",
          
          // Listing Process
          "POST /api/passports/list/passport-prepare", // (Sets status to STORING)
          "POST /api/passports/list/passport-record",
          "POST /api/passports/list/no-passport-record",// (Submit listing request without passport, sets database listing to pending)
          
          // Admin Verification & Receiving
          "POST /api/passports/receive/no-passport", // (Requires ADMIN, database status to status -> verifying)
          "POST /api/passports/receive/passport", //(Requires ADMIN, on-chain status -> verifying, database listing status -> verifying)
          "POST /api/passports/verify/no-passport",// (Requires ADMIN, prepares transaction for mint_list)
          "POST /api/passports/verify/no-passport-record",// (Requires ADMIN, records mint_list sets database listing status -> listed)
          "POST /api/passports/verify/passport",// (Requires ADMIN, on-chain status -> listing, sets database listing status -> listed)
          
          // Delisting & Reeceiving of product
          "POST /api/passports/delist/request", //(Submits DelistRequest with shipping info, listing set to request_return
          "POST /api/passports/delist/approve",// (Requires ADMIN, status -> returning, after transaction handling by recordSetStatus, sets listing status to returning)
          "POST /api/passports/receipt/prepare",// (Buyer confirms receipt of product, onchain transaction status -> active)
          "POST /api/passports/receipt/record",// (The transaction is confirmed, listing status -> returned, de-listing status -> closed)
          
          // Data Retrieval from database of the listings
          "POST /api/passports/listings/address/:passportObjectAddress",
          "POST /api/passports/listings/status/:status",
          "POST /api/passports/de-listings/address/:passportObjectAddress",
          "POST /api/passports/de-listings/status/:status"
      ],
    });
  });

  // Actual route 
  app.use("/api/passports", passportRouter);
  app.use("/api/tokens", lptRouter)
  app.use("/auth", authRouter);
  app.use("/admin", adminRegistryRouter);
  app.use("/admin", issuerRegistryRoutes);
  app.use("/api/escrow", escrowRouter);

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
