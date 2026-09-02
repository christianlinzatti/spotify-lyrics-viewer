import express from "express";
import SpotifyWebApi from "spotify-web-api-node";
import config from "./config";
import { ITokenExpiryPair } from "./dto";
import { randomString } from "./utils";
import { isStoredTokenValid } from "./utils/spotify";

export const subRoute = "/api/spotify";

const parseHeader = (header: string | string[] | undefined): string => {
  if (!header) return "";
  const raw = Array.isArray(header) ? header[0] : header;
  return raw.split(",")[0].trim();
};

const getRedirectUri = (req: any): string => {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }

  const rawHost = parseHeader(req.headers["x-forwarded-host"]) || parseHeader(req.headers.host);
  const rawProtocol = parseHeader(req.headers["x-forwarded-proto"]) || "https";

  if (!rawHost) {
    return "https://spotify-lyrics-viewer-sooty.vercel.app/api/spotify/authentication-callback";
  }

  return `${rawProtocol}://${rawHost}/api/spotify/authentication-callback`;
};

const millisecondsOffsetFromNow = (offsetInSeconds: number): number =>
  Date.now() + offsetInSeconds * 1000;

/**
 * Validiert die Origin-URL, um Open-Redirect-Schwachstellen zu verhindern.
 */
const sanitizeOrigin = (req: any): string => {
  const referer = req.headers.referer;
  const fallback = process.env.CLIENT_URL || "/";

  if (!referer) return fallback;

  try {
    const refererUrl = new URL(referer);
    const host = parseHeader(req.headers["x-forwarded-host"]) || parseHeader(req.headers.host);

    if (host && refererUrl.host === host) {
      return referer;
    }
    if (process.env.CLIENT_URL) {
      const clientUrl = new URL(process.env.CLIENT_URL);
      if (refererUrl.origin === clientUrl.origin) {
        return referer;
      }
    }
  } catch {
    // Ungültiges URL-Format
  }

  return fallback;
};

const clearSpotifySession = (req: any): void => {
  if (!req.session) return;
  delete req.session.access_token;
  delete req.session.refresh_token;
  delete req.session.expires_at;
  delete req.session.authentication_state;
  delete req.session.authentication_origin;
  delete req.session.redirected_uri;
};

const router = express.Router();
const Config = config;

async function refreshSpotifyToken(req: any): Promise<ITokenExpiryPair> {
  if (!req.session || !req.session.refresh_token) {
    throw new Error("No active session or refresh token available");
  }

  const spotifyApi = new SpotifyWebApi({
    clientId: Config.spotify.client_id,
    clientSecret: Config.spotify.client_secret,
    redirectUri: getRedirectUri(req)
  });

  spotifyApi.setAccessToken(req.session.access_token || "");
  spotifyApi.setRefreshToken(req.session.refresh_token);

  try {
    const refreshResponse = await spotifyApi.refreshAccessToken();
    const expiresAt = millisecondsOffsetFromNow(refreshResponse.body.expires_in);

    req.session.access_token = refreshResponse.body.access_token;
    req.session.expires_at = expiresAt;

    const responseBody = refreshResponse.body as { refresh_token?: string };
    if (responseBody.refresh_token) {
      req.session.refresh_token = responseBody.refresh_token;
    }

    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => (err ? reject(err) : resolve()));
    });

    return {
      accessToken: req.session.access_token,
      expiresAt: req.session.expires_at
    };
  } catch (error) {
    clearSpotifySession(req);
    throw error;
  }
}

router.get("/authenticate", async (req: any, res: any) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session middleware is not initialized" });
  }

  if (!Config.spotify?.client_id) {
    return res.status(500).json({ error: "Spotify Client ID missing" });
  }

  const rawScopes = Config.spotify?.permission_scope;
  let scopes: string[] = ["user-read-currently-playing", "user-read-playback-state"];

  if (Array.isArray(rawScopes)) {
    scopes = rawScopes;
  } else if (typeof rawScopes === "string" && rawScopes.trim() !== "") {
    scopes = rawScopes.split(" ").filter(Boolean);
  }

  try {
    const redirectUri = getRedirectUri(req);
    const spotifyApi = new SpotifyWebApi({
      clientId: Config.spotify.client_id,
      redirectUri
    });

    const state = randomString(16);
    const origin = sanitizeOrigin(req);

    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);

    req.session.authentication_state = state;
    req.session.authentication_origin = origin;
    req.session.redirected_uri = redirectUri;

    req.session.save((err: any) => {
      if (err) {
        console.error("Failed to save session before redirect:", err);
        return res.status(500).json({ error: "Failed to initialize authentication session" });
      }
      return res.redirect(authorizeURL);
    });
  } catch (error) {
    console.error("Failed to generate authorization URL:", error);
    return res.status(500).json({ error: "Failed to initiate authentication" });
  }
});

router.get("/authentication-callback", async (req: any, res: any) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session missing" });
  }

  const savedState = req.session.authentication_state;
  const requestOrigin = req.session.authentication_origin || process.env.CLIENT_URL || "/";
  const redirectUri = req.session.redirected_uri || getRedirectUri(req);

  delete req.session.authentication_state;
  delete req.session.authentication_origin;
  delete req.session.redirected_uri;

  const { subdirectory } = Config.client || {};
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${requestOrigin}?error=access_denied`);
  }

  if (!state || typeof state !== "string" || state !== savedState) {
    return res.redirect(`${requestOrigin}?error=state_mismatch`);
  }

  if (!code || typeof code !== "string") {
    return res.redirect(`${requestOrigin}?error=invalid_code`);
  }

  try {
    const spotifyApi = new SpotifyWebApi({
      clientId: Config.spotify.client_id,
      clientSecret: Config.spotify.client_secret,
      redirectUri
    });

    const authorizationResponse = await spotifyApi.authorizationCodeGrant(code);

    req.session.expires_at = millisecondsOffsetFromNow(authorizationResponse.body.expires_in);
    req.session.access_token = authorizationResponse.body.access_token;
    req.session.refresh_token = authorizationResponse.body.refresh_token;

    let targetUrl: string;
    try {
      const baseUrl = requestOrigin.startsWith("http")
        ? new URL(requestOrigin)
        : new URL(requestOrigin, `${req.protocol}://${req.get("host")}`);

      if (subdirectory) {
        baseUrl.pathname = [baseUrl.pathname, subdirectory]
          .join("/")
          .replace(/\/+/g, "/");
      }
      targetUrl = baseUrl.toString();
    } catch {
      targetUrl = requestOrigin;
    }

    req.session.save((err: any) => {
      if (err) {
        console.error("Failed to save session in callback:", err);
        return res.redirect(`${requestOrigin}?error=session_save_failed`);
      }
      return res.redirect(targetUrl);
    });
  } catch (err) {
    console.error("Error during authorizationCodeGrant:", err);
    return res.redirect(`${requestOrigin}?error=token_grant_failed`);
  }
});

router.get("/token", async (req: any, res: any) => {
  if (!req.session || !req.session.access_token || !req.session.refresh_token) {
    return res.status(401).json({ error: "No Spotify session available" });
  }

  const now = Date.now();
  const expiresAt = req.session.expires_at || 0;
  const isExpiringSoon = expiresAt - now < 60000;

  if (isExpiringSoon || !isStoredTokenValid(req)) {
    try {
      const refreshedData = await refreshSpotifyToken(req);
      return res.json(refreshedData);
    } catch (err) {
      return res.status(401).json({ error: "Session expired or invalid" });
    }
  }

  return res.json({
    accessToken: req.session.access_token,
    expiresAt: req.session.expires_at
  });
});

router.get("/refresh-token", async (req: any, res: any) => {
  if (!req.session || !req.session.refresh_token) {
    return res.status(401).json({ error: "No refresh token available" });
  }

  try {
    const responseData = await refreshSpotifyToken(req);
    return res.json(responseData);
  } catch (err) {
    return res.status(401).json({ error: "Failed to refresh token" });
  }
});

router.post("/logout", (req: any, res: any) => {
  clearSpotifySession(req);
  if (req.session) {
    req.session.save((err: any) => {
      res.json({ success: true, message: "Logged out from Spotify" });
    });
  } else {
    res.json({ success: true, message: "Logged out from Spotify" });
  }
});

export default function handler(req: any, res: any) {
  return router(req, res, (err?: any) => {
    if (err) {
      console.error("Index Router Error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
}