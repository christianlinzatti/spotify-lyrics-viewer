import "express-session";

declare module "express-session" {
  interface SessionData {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    authentication_state?: string;
    authentication_origin?: string;
    redirected_uri?: string;
  }
}