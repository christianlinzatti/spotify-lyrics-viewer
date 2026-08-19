import express from "express";
import SpotifyWebApi from "spotify-web-api-node";
import config from "../config";
import { ITokenExpiryPair } from "../dto";
import "../types/express"; // 👈 ZWINGT TypeScript dazu, die Typen zu laden!
import { randomString } from "../utils";
import { isStoredTokenValid } from "../utils/spotify";

export const subRoute = "/api/spotify";

const getRedirectUri = (req: express.Request): string => {
  // 1. Priorität: Explizit gesetzte Umgebungsvariable
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }

  // 2. Fallback: Automatische Erkennung der Vercel Domain
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "https";

  if (!host) {
    console.error("CRITICAL: Unable to determine host for redirect URI");
    return "https://spotify-lyrics-viewer-sooty.vercel.app/api/spotify/authentication-callback";
  }

  return `${protocol}://${host}/api/spotify/authentication-callback`;
};

const millisecondsOffsetFromNow = (offsetInSeconds: number): number =>
  Date.now() + offsetInSeconds * 1000;

const router = express.Router();

// Redundanten Config-Import bereinigt
const Config = config;

/**
 * Hilfsfunktion zum Erneuern des Access-Tokens
 */
async function refreshSpotifyToken(req: express.Request): Promise<ITokenExpiryPair> {
  // 1. Session & Token Guard Clause
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

  const refreshResponse = await spotifyApi.refreshAccessToken();
  const expiresAt = millisecondsOffsetFromNow(refreshResponse.body.expires_in);

  req.session.access_token = refreshResponse.body.access_token;
  req.session.expires_at = expiresAt;

  // Type-Assertion für optionales refresh_token aus der API-Response
  const responseBody = refreshResponse.body as typeof refreshResponse.body & { refresh_token?: string };
  if (responseBody.refresh_token) {
    req.session.refresh_token = responseBody.refresh_token;
  }

  // Rückgabe im camelCase-Format (gemäß deinem ITokenExpiryPair Interface)
  return {
    accessToken: req.session.access_token,
    expiresAt: req.session.expires_at
  };
}

/**
 * GET /api/spotify/authenticate
 * Startet den OAuth 2.0 Auth-Code-Flow
 */
router.get("/authenticate", (req, res) => {
  // 1. Sichere Session-Prüfung ohne unhandled Exception
  if (!req.session) {
    console.error("Express session middleware is missing or not configured correctly.");
    return res.status(500).json({ error: "Session middleware is not initialized" });
  }

  // 2. Prüfung der Spotify Client ID
  if (!Config.spotify?.client_id) {
    console.error("Config.spotify.client_id is missing. Check your Vercel Environment Variables!");
    return res.status(500).json({ error: "Spotify Client ID is not configured on server" });
  }

  // 3. Sicheres Parsing der Permission Scopes (verhindert .split() Crash)
  const rawScopes = Config.spotify?.permission_scope;
  let scopes: string[] = [
    "user-read-currently-playing",
    "user-read-playback-state"
  ]; // Defensiver Fallback

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
    const origin = req.headers.referer || process.env.CLIENT_URL || "/";

    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);

    req.session.authentication_state = state;
    req.session.authentication_origin = origin;
    req.session.redirected_uri = redirectUri;

    return res.redirect(authorizeURL);
  } catch (error) {
    console.error("Failed to generate Spotify authorization URL:", error);
    return res.status(500).json({ error: "Failed to initiate Spotify authentication" });
  }
});

/**
 * GET /api/spotify/authentication-callback
 * Empfängt den Auth-Code von Spotify
 */
router.get("/authentication-callback", async (req, res) => {
  if (!req.session) throw new Error("Session has not been set");

  const requestOrigin = req.session.authentication_origin || process.env.CLIENT_URL || "/";
  const { subdirectory } = Config.client;
  const { code, state, error } = req.query;

  // Fall 1: User hat in Spotify auf "Abbrechen" geklickt
  if (error) {
    console.warn("Spotify authentication denied by user:", error);
    return res.redirect(`${requestOrigin}${subdirectory || ""}?error=access_denied`);
  }

  // Fall 2: State-Validierung
  if (!state || state !== req.session.authentication_state) {
    console.error("Unexpected state value in OAuth callback");
    return res.redirect(`${requestOrigin}${subdirectory || ""}?error=state_mismatch`);
  }

  req.session.authentication_state = undefined;
  req.session.authentication_origin = undefined;

  const redirectUri = req.session.redirected_uri || getRedirectUri(req);
  req.session.redirected_uri = undefined;

  try {
    const spotifyApi = new SpotifyWebApi({
      clientId: Config.spotify.client_id,
      clientSecret: Config.spotify.client_secret,
      redirectUri
    });

    const authorizationResponse = await spotifyApi.authorizationCodeGrant(code as string);

    req.session.expires_at = millisecondsOffsetFromNow(authorizationResponse.body.expires_in);
    req.session.access_token = authorizationResponse.body.access_token;
    req.session.refresh_token = authorizationResponse.body.refresh_token;

    // Ziel-URL ohne Tokens in den Query-Parametern aufbauen (Sicherer!)
    const baseUrl = requestOrigin.endsWith("/") ? requestOrigin.slice(0, -1) : requestOrigin;
    const sub = subdirectory ? (subdirectory.startsWith("/") ? subdirectory : `/${subdirectory}`) : "";
    const redirectUrl = `${baseUrl}${sub}`;

    res.redirect(redirectUrl);
  } catch (err) {
    console.error("Error during authorizationCodeGrant:", err);
    res.redirect(`${requestOrigin}${subdirectory || ""}?error=token_grant_failed`);
  }
});

/**
 * GET /api/spotify/token
 * Liefert das aktuelle Token. Veranlasst einen Auto-Refresh, falls es bald abläuft.
 */
router.get("/token", async (req, res) => {
  if (!req.session) throw new Error("Session has not been set");

  if (!req.session.access_token || !req.session.refresh_token) {
    return res.status(401).json({ error: "No Spotify session available" });
  }

  const now = Date.now();
  // Nutzt 0 als Fallback, damit expiresAt garantiert vom Typ 'number' ist
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

  // Hier 'expiresAt' statt 'req.session.expires_at' verwenden:
  const responseData: ITokenExpiryPair = {
    accessToken: req.session.access_token,
    expiresAt: expiresAt
  };

  return res.json(responseData);
});

/**
 * GET /api/spotify/refresh-token
 * Manuelles Erneuern des Access-Tokens via Refresh-Token
 */
router.get("/refresh-token", async (req, res) => {
  if (!req.session) throw new Error("Session has not been set");

  if (!req.session.refresh_token) {
    return res.status(401).json({ error: "No refresh token available in session" });
  }

  try {
    const responseData = await refreshSpotifyToken(req);
    return res.json(responseData);
  } catch (err) {
    console.error("Error refreshing token:", err);
    return res.status(500).json({ error: "Failed to refresh token" });
  }
});

/**
 * POST /api/spotify/logout
 * Entfernt die Spotify-Tokens aus der aktuellen Session
 */
router.post("/logout", (req, res) => {
  if (!req.session) throw new Error("Session has not been set");

  req.session.access_token = undefined;
  req.session.refresh_token = undefined;
  req.session.expires_at = undefined;

  return res.json({ success: true, message: "Logged out from Spotify" });
});

export default router;