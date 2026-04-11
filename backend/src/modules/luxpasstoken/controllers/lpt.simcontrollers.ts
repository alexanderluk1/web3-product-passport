import type { Request, Response } from "express";
import { simulateLptEntryFunction } from "../services/lpt.simservices";

export async function simulateLptHandler(req: Request, res: Response) {
  try {
    const body = req.body as {
      sender?: unknown;
      function?: unknown;
      functionArguments?: unknown;
    };

    if (!body || typeof body !== "object") {
      return res.status(400).json({ success: false, error: "JSON body required." });
    }

    if (!Array.isArray(body.functionArguments)) {
      return res.status(400).json({
        success: false,
        error: "functionArguments must be an array.",
      });
    }

    const simulation = await simulateLptEntryFunction({
      sender: String(body.sender ?? ""),
      function: String(body.function ?? ""),
      functionArguments: body.functionArguments,
    });

    return res.status(200).json({ success: true, simulation });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Simulation failed.",
    });
  }
}
