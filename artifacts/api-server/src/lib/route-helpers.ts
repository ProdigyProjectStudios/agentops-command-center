import type { Request } from "express";

export function parseIdParam(req: Request, name = "id"): number | null {
  const raw = req.params[name];
  if (typeof raw !== "string") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
