import { Request } from "express";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user?: AccessTokenPayload;
};
