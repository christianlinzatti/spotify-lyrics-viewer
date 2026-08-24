import "express-session";

declare module "express" {
  interface Request {
    session: import("express-session").Session &
      Partial<import("express-session").SessionData> & {
        access_token?: string;
        refresh_token?: string;
        expires_at?: number;
        authentication_state?: string;
        authentication_origin?: string;
        redirected_uri?: string;
      };
  }
}