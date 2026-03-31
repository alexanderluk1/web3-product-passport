import type { NextFunction, Request, Response } from "express";
import { passportService, passportListingService } from "../services/passport.service";
import type {
  PrepareMintPassportRequestBody,
  PrepareTransferRequestBody,
  RecordTransferRequestBody,
  PrepareSetStatusRequestBody,
  RecordSetStatusRequestBody,
  PrepareUpdateMetadataRequestBody,
  RecordUpdateMetadataRequestBody,
  PrepareListPassportRequestBody,
  RecordListPassportRequestBody,
  RequestDelistRequestBody,
  PrepareSellPassportRequestBody,
  RecordSellPassportRequestBody,
  PrepareConfirmReceiptRequestBody,
  RecordConfirmReceiptRequestBody,
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

// Marketplace controllers
export async function prepareSetStatusHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareSetStatusRequestBody;

    if (!body.passportObjectAddress || !body.newStatus) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress and newStatus are required.",
      });
    }

    const result = await passportListingService.prepareSetStatus({
      callerWalletAddress: req.user.walletAddress,
      callerRole: req.user.role,
      body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] prepare set status failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare set status.",
    });
  }
}

export async function recordSetStatusHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordSetStatusRequestBody;

    if (!body.txHash || !body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash and passportObjectAddress are required",
      });
    }

    const result = await passportListingService.recordSetStatus({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record set status failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to record set status.",
    });
  }
}

export async function prepareUpdateMetadataHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareUpdateMetadataRequestBody;

    const result = await passportListingService.prepareUpdateMetadata({
      callerWalletAddress: req.user.walletAddress,
      callerRole: req.user.role,
      body,
      imageFile: req.file,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] prepare update metadata failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare update metadata status.",
    });
  }
}

export async function recordUpdateMetadataHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordUpdateMetadataRequestBody;

    if (!body.txHash || !body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash and passportObjectAddress are required",
      });
    }

    const result = await passportListingService.recordUpdateMetadata({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record update metadata failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to record update metadata.",
    });
  }
}

// Set status to Storing and start of listing process on chain (initiated by owner)
// Will lead to status Storing, after admin receives product it would be changed to Verifying, then listing
export async function prepareListPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareListPassportRequestBody;

    if (!body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress is required.",
      });
    }

    const result = await passportListingService.prepareListPassport({
      callerWalletAddress: req.user.walletAddress,
      body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] prepare list passport failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare list passport status.",
    });
  }
}

export async function recordListPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordListPassportRequestBody;

    if (!body.txHash || !body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash and passportObjectAddress are required",
      });
    }

    const result = await passportListingService.recordListPassport({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record list passport failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list passport metadata.",
    });
  }
}

// Starts delisting process (sends delist request to admins, can only be done at status Shipping and Listing)
// Doesn't start anything on chain will be logged by backend, admins will then after approving the request call set_status for it
export async function requestDelistHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RequestDelistRequestBody;

    if (!body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress is required.",
      });
    }

    const result = await passportListingService.requestDelist({
      callerWalletAddress: req.user.walletAddress,
      body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] request delist failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to submit delist request.",
    });
  }
}

// Transfer to buyer and change status to Sold for listed products
export async function prepareSellPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareSellPassportRequestBody;

    if (!body.passportObjectAddress || !body.buyerAddress) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress and buyerAddress are required.",
      });
    }

    const result = await passportListingService.prepareSellPassport({
      callerWalletAddress: req.user.walletAddress,
      body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] prepare sell passport failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare sell passport.",
    });
  }
}

// Records that the transfer to buyer was successful
export async function recordSellPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordSellPassportRequestBody;

    if (!body.txHash || !body.passportObjectAddress || !body.buyerAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash, passportObjectAddress and buyerAddress are required.",
      });
    }

    const result = await passportListingService.recordSellPassport({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record sell passport failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to record sell passport.",
    });
  }
}

// User calls this function to complete the delisting process by confirming the receipt which would trigger the own chain update
export async function prepareConfirmReceiptHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareConfirmReceiptRequestBody;

    if (!body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress is required.",
      });
    }

    const result = await passportListingService.prepareConfirmReceipt({
      callerWalletAddress: req.user.walletAddress,
      body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] prepare confirm receipt failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare confirm receipt.",
    });
  }
}

// Records that the transaction to confirm receipt and return passport status to active went through
export async function recordConfirmReceiptHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordConfirmReceiptRequestBody;

    if (!body.txHash || !body.passportObjectAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash and passportObjectAddress are required.",
      });
    }

    const result = await passportListingService.recordConfirmReceipt({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record confirm receipt failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to record confirm receipt.",
    });
  }
}