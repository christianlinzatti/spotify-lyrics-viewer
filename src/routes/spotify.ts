import express from "express";
import SpotifyWebApi from "spotify-web-api-node";
import config from "../config";
import { ITokenExpiryPair } from "../dto";
import "../types/express"; // TypeScript Session-Augmentation
import { randomString } from "../utils";
import { isStoredTokenValid } from "../utils/spotify";

export const subRoute = "/api/spotify";

const router = express.Router();
const Config = config;

// --- HILFSFUNKTIONEN ---

const millisecondsOffsetFromNow = (offsetInSeconds: number): number =>
  Date.now() + offsetInSeconds * 1000;

/**
 * Ermittelt die absolute Redirect-URI für den Spotify OAuth-Flow.
 */
const getRedirectUri = (req: express.Request): string => {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }

  const rawHost = req.headers["x-forwarded-host"] || req.headers.host;
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;

  const rawProto = req.headers["x-forwarded-proto"] || "https";
  const protocol = Array.isArray(rawProto) ? rawProto[0] : rawProto;

  if (!host) {
    console.error("CRITICAL: Unable to determine host for redirect URI");
    return "https://spotify-lyrics-viewer-sooty.vercel.app/api/spotify/authentication-callback";
  }

  return `${protocol}://${host}/api/spotify/authentication-callback`;
};

/**
 * Validiert die Referer-URL zur Vermeidung von Open-Redirect-Schwachstellen.
 */
const sanitizeOrigin = (req: express.Request): string => {
  const referer = req.headers.referer;
  const fallback = process.env.CLIENT_URL || "/";

  if (!referer) return fallback;

  try {
    const refererUrl = new URL(referer);
    const rawHost = req.headers["x-forwarded-host"] || req.headers.host;
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;

    if (host && refererUrl.host === host) return referer;

    if (process.env.CLIENT_URL) {
      const clientUrl = new URL(process.env.CLIENT_URL);
      if (refererUrl.origin === clientUrl.origin) return referer;
    }
  } catch {
    // Falls Ungültiges URL-Format vorliegt
  }

  return fallback;
};

/**
 * Hilfsfunktion zum Löschen von Spotify-Tokens aus der Session.
 */
const clearSpotifySession = (req: express.Request): void => {
  if (!req.session) return;
  delete req.session.access_token;
  delete req.session.refresh_token;
  delete req.session.expires_at;
  delete req.session.authentication_state;
  delete req.session.authentication_origin;
  delete req.session.redirected_uri;
};

/**
 * Speichert die Express-Session explizit ab (Promise-basiert).
 */
const saveSession = (req: express.Request): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
};

/**
 * Erneuert das Access Token über die Spotify API.
 */
async function refreshSpotifyToken(req: express.Request): Promise<ITokenExpiryPair> {
  if (!req.session || !req.session.access_token || !req.session.refresh_token) {
    throw new Error("No active session or refresh token available");
  }

  const spotifyApi = new SpotifyWebApi({
    clientId: Config.spotify.client_id,
    clientSecret: Config.spotify.client_secret,
    redirectUri: getRedirectUri(req)
  });

  spotifyApi.setAccessToken(req.session.access_token);
  spotifyApi.setRefreshToken(req.session.refresh_token);

  try {
    const refreshResponse = await spotifyApi.refreshAccessToken();
    const expiresAt = millisecondsOffsetFromNow(refreshResponse.body.expires_in);

    req.session.access_token = refreshResponse.body.access_token;
    req.session.expires_at = expiresAt;

    const responseBody = refreshResponse.body as typeof refreshResponse.body & { refresh_token?: string };
    if (responseBody.refresh_token) {
      req.session.refresh_token = responseBody.refresh_token;
    }

    await saveSession(req);

    return {
      accessToken: req.session.access_token,
      expiresAt: req.session.expires_at
    };
  } catch (error) {
    clearSpotifySession(req);
    await saveSession(req);
    throw error;
  }
}

// --- ROUTEN DEFINIREN ---

router.get("/authenticate", async (req, res) => {
  if (!req.session) {
    console.error("Express session middleware is missing or not configured correctly.");
    return res.status(500).json({ error: "Session middleware is not initialized" });
  }

  if (!Config.spotify?.client_id) {
    console.error("Config.spotify.client_id is missing. Check Environment Variables!");
    return res.status(500).json({ error: "Spotify Client ID is not configured on server" });
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

    await saveSession(req);
    return res.redirect(authorizeURL);
  } catch (error) {
    console.error("Failed to generate Spotify authorization URL:", error);
    return res.status(500).json({ error: "Failed to initiate Spotify authentication" });
  }
});

router.get("/authentication-callback", async (req, res) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session middleware is missing" });
  }

  const requestOrigin = req.session.authentication_origin || process.env.CLIENT_URL || "/";
  const { subdirectory } = Config.client || {};
  const { code, state, error } = req.query;

  const redirectUri = req.session.redirected_uri || getRedirectUri(req);
  const savedState = req.session.authentication_state;

  delete req.session.authentication_state;
  delete req.session.authentication_origin;
  delete req.session.redirected_uri;

  if (error) {
    console.warn("Spotify authentication denied by user:", error);
    await saveSession(req);
    return res.redirect(`${requestOrigin}?error=access_denied`);
  }

  if (!state || typeof state !== "string" || state !== savedState) {
    console.error("Unexpected or mismatched state value in OAuth callback");
    await saveSession(req);
    return res.redirect(`${requestOrigin}?error=state_mismatch`);
  }

  if (!code || typeof code !== "string") {
    await saveSession(req);
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

    await saveSession(req);
    return res.redirect(targetUrl);
  } catch (err) {
    console.error("Error during authorizationCodeGrant:", err);
    await saveSession(req);
    return res.redirect(`${requestOrigin}?error=token_grant_failed`);
  }
});

router.get("/token", async (req, res) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session middleware is missing" });
  }

  if (!req.session.access_token || !req.session.refresh_token) {
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
      return res.status(401).json({ error: "Session expired, re-authentication required" });
    }
  }

  const responseData: ITokenExpiryPair = {
    accessToken: req.session.access_token,
    expiresAt: expiresAt
  };

  return res.json(responseData);
});

router.get("/refresh-token", async (req, res) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session middleware is missing" });
  }

  if (!req.session.refresh_token) {
    return res.status(401).json({ error: "No refresh token available in session" });
  }

  try {
    const responseData = await refreshSpotifyToken(req);
    return res.json(responseData);
  } catch (err) {
    console.error("Error refreshing token:", err);
    return res.status(401).json({ error: "Failed to refresh token" });
  }
});

router.post("/logout", async (req, res) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session middleware is missing" });
  }

  clearSpotifySession(req);
  await saveSession(req);

  return res.json({ success: true, message: "Logged out from Spotify" });
});

// --- EXPRESS APP INIZIALISIEREN & EXPORTIEREN (ERST NACH ALLEN ROUTEN!) ---

const app = express();

// Falls der Pfad /api/spotify in der Request-URL vorhanden ist:
app.use(subRoute, router);
// Falls Vercel den Prefix bereits abgeschnitten hat:
app.use("/", router);

export default app;