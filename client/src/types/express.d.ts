import "express";

declare module "express-serve-static-core" {
  interface Request {
    session?: {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      authentication_state?: string;
      authentication_origin?: string;
      redirected_uri?: string;
      [key: string]: any;
    };
  }
}