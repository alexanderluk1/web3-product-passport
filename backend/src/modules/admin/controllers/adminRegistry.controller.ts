import { Request, Response } from "express";
import { adminRegistryService } from "../services/adminRegistry.service";

export async function getRegistryStatusHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const result = await adminRegistryService.getRegistryStatus();

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to retrieve registry status",
    });
  }
}

export async function initRegistryHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      })
    }

    const result = await adminRegistryService.initRegistry();

    if (!result.success) {
      const statusCode = result.error === "Registry is already initialized." ? 409 : 500;

      return res.status(statusCode).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to initialize registry"
    })
  }
}

export async function getIssuersHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const issuers = await adminRegistryService.getIssuers();
    return res.status(200).json(issuers);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to retrieve issuers",
    });
  }
}
