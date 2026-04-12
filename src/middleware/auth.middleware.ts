import { NextFunction, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequest } from "../types/auth";

export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authorizationHeader = req.header("authorization");

  if (!authorizationHeader) {
    res.status(401).json({ error: "Authorization header is required" });
    return;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Authorization header must use Bearer token" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    req.user = {
      sub: payload.sub,
      email: payload.email,
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
