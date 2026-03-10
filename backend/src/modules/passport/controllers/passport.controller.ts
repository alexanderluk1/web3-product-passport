import type { NextFunction, Request, Response } from "express";
import { passportService } from "../services/passport.service";
import type {
  PrepareMintPassportRequestBody,
  PrepareTransferRequestBody,
  RecordTransferRequestBody,
} from "../types/passport.types";

function normalizeByteVectorLike(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as ArrayLike<number>);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeByteVectorLike(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const isNumericKeyMap =
      entries.length > 0 &&
      entries.every(
        ([key, entryValue]) => /^\d+$/.test(key) && typeof entryValue === "number"
      );

    if (isNumericKeyMap) {
      return entries
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, entryValue]) => Number(entryValue));
    }
  }

  return value;
}

export async function prepareMintPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const result = await passportService.prepareMintPassport({
      issuerWalletAddress: req.user.walletAddress,
      body: req.body as PrepareMintPassportRequestBody,
      imageFile: req.file,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    const normalizedPayload = {
      ...result.payload,
      functionArguments: result.payload.functionArguments.map((arg) =>
        normalizeByteVectorLike(arg)
      ),
    };

    return res.status(200).json({
      ...result,
      payload: normalizedPayload,
    });
  } catch (error) {
    console.error("[passport] prepare mint failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare mint passport payload",
    });
  }
}

export async function prepareTransferPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareTransferRequestBody;

    if (!body.passportObjectAddress || !body.newOwnerAddress) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress and newOwnerAddress are required.",
      });
    }

    const result = await passportService.prepareTransferPassport({
      callerWalletAddress: req.user.walletAddress,
      body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] prepare transfer failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare transfer payload.",
    });
  }
}

export async function recordTransferPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordTransferRequestBody;

    if (!body.txHash || !body.passportObjectAddress || !body.newOwnerAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash, passportObjectAddress, and newOwnerAddress are required.",
      });
    }

    const result = await passportService.recordTransferPassport({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record transfer failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to record transfer.",
    });
  }
}

export async function getPassportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const passportObjectAddr = req.params.passportObjectAddr;
    const data = await passportService.getPassport(passportObjectAddr);
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return next(err);
  }
}

// GET /api/passports/by-product/:productId
export async function getPassportByProductIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const productId = req.params.productId;
    const product = await passportService.getProductById(productId);
    return res.status(200).json({ ok: true, product });
  } catch (e) {
    if (e instanceof Error) {
      const message = e.message.toLowerCase();
      const isNotFound =
        message.includes("e_product_not_found") ||
        message.includes("product_not_found") ||
        message.includes("abort code: 21") ||
        message.includes("abort_code: 21");

      if (isNotFound) {
        return res.status(404).json({
          ok: false,
          error: "Product not found.",
        });
      }
    }

    return next(e);
  }
}

export async function getPassportProvenanceByProductIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const productId = req.params.productId;
    const provenance = await passportService.getProductProvenance(productId);
    return res.status(200).json({ ok: true, provenance });
  } catch (e) {
    if (e instanceof Error) {
      const message = e.message.toLowerCase();
      const isNotFound =
        message.includes("e_product_not_found") ||
        message.includes("product_not_found") ||
        message.includes("abort code: 21") ||
        message.includes("abort_code: 21");

      if (isNotFound) {
        return res.status(404).json({
          ok: false,
          error: "Product not found.",
        });
      }
    }

    return next(e);
  }
}

export async function getIssuerProductsHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const result = await passportService.getIssuerProducts(req.user.walletAddress);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to retrieve issuer products.",
    });
  }
}

export async function getOwnedPassportsHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const result = await passportService.getOwnedPassports(req.user.walletAddress);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to retrieve owned passports.",
    });
  }
}
