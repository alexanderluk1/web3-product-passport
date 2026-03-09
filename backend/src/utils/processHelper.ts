export function validateRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  return value.trim();
}


export function validateImageFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
  if (!file) {
    throw new Error("Image file is required.");
  }

  const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!allowedMimeTypes.has(file.mimetype)) {
    throw new Error("Unsupported image type. Please upload JPG, PNG, or WEBP.");
  }

  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Image file is too large. Maximum size is 5MB.");
  }
}

export function parseMaterials(materials: string | string[]): string[] {
  if (Array.isArray(materials)) {
    return materials.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof materials !== "string") {
    return [];
  }

  // Supports either:
  // 1) JSON string: ["Leather","Canvas"]
  // 2) Comma-separated string: Leather, Canvas
  try {
    const parsed = JSON.parse(materials);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // ignore JSON parse failure and fall back to CSV split
  }

  return materials
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}