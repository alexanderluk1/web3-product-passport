import { Request, Response } from "express";
import { adminRegistryService } from "../services/adminRegistry.service";

function logAdminRegistryError(context: string, req: Request, error: unknown) {
  console.error(`[admin-registry] ${context} failed`, {
    method: req.method,
    path: req.originalUrl,
    userWalletAddress: req.user?.walletAddress,
    error,
  });
}

export async function getRegistryStatusHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    console.info("[admin-registry] status requested", {
      method: req.method,
      path: req.originalUrl,
      userWalletAddress: req.user.walletAddress,
    });

    const result = await adminRegistryService.getRegistryStatus();
    console.info("[admin-registry] status response", {
      initialized: result.initialized,
      registryAddress:
        result.initialized ? result.registry.registryAddress : result.registryAddress,
    });

    return res.status(200).json(result);
  } catch (error) {
    logAdminRegistryError("getRegistryStatus", req, error);

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

    console.info("[admin-registry] init requested", {
      method: req.method,
      path: req.originalUrl,
      userWalletAddress: req.user.walletAddress,
    });

    const result = await adminRegistryService.initRegistry();

    if (!result.success) {
      console.warn("[admin-registry] init failed", {
        transactionHash: result.transactionHash,
        vmStatus: result.vmStatus,
      });
      const statusCode = result.error === "Registry is already initialized." ? 409 : 500;

      return res.status(statusCode).json(result);
    }

    console.info("[admin-registry] init succeeded", {
      transactionHash: result.transactionHash,
      registryAddress: result.registryAddress,
    });

    return res.status(200).json(result);
  } catch (error) {
    logAdminRegistryError("initRegistry", req, error);

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
