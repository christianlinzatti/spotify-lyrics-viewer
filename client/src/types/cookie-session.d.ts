import "cookie-session";

declare global {
  namespace CookieSessionInterfaces {
    interface CookieSessionObject {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      authentication_state?: string;
      authentication_origin?: string;
      redirected_uri?: string;
    }
  }
}