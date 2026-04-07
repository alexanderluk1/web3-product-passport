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
  PrepareConfirmReceiptRequestBody,
  RecordConfirmReceiptRequestBody,
  UpdateNoPassportListingRequestBody,
  PrepareMintListPassportRequestBody,
  RecordMintListRequestBody,
  getListingByPassportAddressBody,
  getListingsByStatus,
  getDelistingsByStatus,
} from "../types/passport.types";
import { STATUS_LISTING, STATUS_VERIFYING } from "../../../chains/luxpass/constants";

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

export async function receivePassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareSetStatusRequestBody;

    if (!body.passportObjectAddress ) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress required.",
      });
    }

    body.newStatus = STATUS_VERIFYING

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
          : "Failed to prepare set status to verifying.",
    });
  }
}

export async function verifyPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as PrepareSetStatusRequestBody;

    if (!body.passportObjectAddress ) {
      return res.status(400).json({
        success: false,
        error: "passportObjectAddress required.",
      });
    }

    body.newStatus = STATUS_LISTING

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
          : "Failed to prepare set status to listing.",
    });
  }
}

export async function requestListingNoPassport(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const result = await passportListingService.submitListingRequest({
      callerWalletAddress: req.user.walletAddress,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] listing request (no-passport) failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to submit listing request (no-passport).",
    });
  }
}

export async function receiveNoPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as UpdateNoPassportListingRequestBody;

    if (!body.tempObjectAddress || !body.status) {
      return res.status(400).json({
        success: false,
        error: "tempObjectAddress and status are required.",
      });
    }

    if (body.status !== "verifying"){
      return res.status(400).json({
        success: false,
        error: "Invalid status. Only 'verifying' is allowed.",
      });
    }

    const result = await passportListingService.updateNoPassportListingStatus({
      callerRole: req.user.role,
      body: body,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] listing request (no-passport) failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to submit listing request (no-passport).",
    });
  }
}

// Verify no passport handler
export async function prepareMintListPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const result = await passportListingService.prepareMintListPassport({
      adminWalletAddress: req.user.walletAddress,
      body: req.body as PrepareMintListPassportRequestBody,
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

export async function recordMintListPassportHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const body = req.body as RecordMintListRequestBody;

    if (!body.txHash || !body.passportObjectAddress || !body.tempPassportObjectAddress || !body.ownerAddress) {
      return res.status(400).json({
        success: false,
        error: "txHash, passportObjectAddress, tempPassportObjectAddress and ownerAddress are required",
      });
    }

    const result = await passportListingService.recordMintListPassport({ body });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record mint listed passport failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to record mint_list metadata.",
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

// Admin approves delist request and begins processing the delist by setting the passport status to Returning on chain, record set_status will handle the database update
// Would return set_status payload for admin to sign and send transaction, recordSetStatusHandler would handle the database updating
export async function approveDelistHandler(req: Request, res: Response) {
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

    const result = await passportListingService.markDelistProcessed({
      callerRole: req.user.role,
      passportObjectAddress: body.passportObjectAddress,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[passport] record delist processed failed:", error);
    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to submit delist update.",
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

export async function getListingByPassportAddressHandler(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }
  
      const body = req.body as getListingByPassportAddressBody;
  
      if (!body.passportObjectAddress) {
        return res.status(400).json({
          success: false,
          error: "passportObjectAddress is required.",
        });
      }
  
      const result = await passportListingService.getListingByPassportAddress({
        passportObjectAddress: body.passportObjectAddress,
      });
  
      if (!result.success) {
        return res.status(400).json(result);
      }
  
      return res.status(200).json(result);
    } catch (error) {
      console.error("[passport] get listing request by passport address failed:", error);
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get listing request by passport address.",
      });
    }
  }

export async function getListingByStatusHandler(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }
  
      const body = req.body as getListingsByStatus;
  
      if (!body.status) {
        return res.status(400).json({
          success: false,
          error: "status is required.",
        });
      }
  
      const result = await passportListingService.getListingsByStatus({
        status: body.status,
      });
  
      if (!result.success) {
        return res.status(400).json(result);
      }
  
      return res.status(200).json(result);
    } catch (error) {
      console.error("[passport] get listing request by status failed:", error);
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get listing request by status.",
      });
    }
  }

export async function getDelistingByPassportAddressHandler(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }
  
      const body = req.body as getListingByPassportAddressBody;
  
      if (!body.passportObjectAddress) {
        return res.status(400).json({
          success: false,
          error: "passportObjectAddress is required.",
        });
      }
  
      const result = await passportListingService.getDeListingRequestByPassportAddress({
        passportObjectAddress: body.passportObjectAddress,
      });
  
      if (!result.success) {
        return res.status(400).json(result);
      }
  
      return res.status(200).json(result);
    } catch (error) {
      console.error("[passport] get de-listing request by passport address failed:", error);
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get de-listing request by passport address.",
      });
    }
  }

export async function getDelistingsByStatusHandler(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }
  
      const body = req.body as getDelistingsByStatus;
  
      if (!body.status) {
        return res.status(400).json({
          success: false,
          error: "status is required.",
        });
      }
  
      const result = await passportListingService.getDeListingsByStatus({
        status: body.status,
      });
  
      if (!result.success) {
        return res.status(400).json(result);
      }
  
      return res.status(200).json(result);
    } catch (error) {
      console.error("[passport] get de-listing request by status failed:", error);
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get de-listing request by status.",
      });
    }
}