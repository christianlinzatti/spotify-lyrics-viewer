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

const getRedirectUri = (req: express.Request): string => {
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
const sanitizeOrigin = (req: express.Request): string => {
  const referer = req.headers.referer;
  const fallback = process.env.CLIENT_URL || "/";

  if (!referer) return fallback;

  try {
    const refererUrl = new URL(referer);
    const host = parseHeader(req.headers["x-forwarded-host"]) || parseHeader(req.headers.host);

    // Erlaube nur Referer von derselben Domain oder einer explizit definierten CLIENT_URL
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
    // Ungültige URL-Formatierung -> Fallback nutzen
  }

  return fallback;
};

const clearSpotifySession = (req: express.Request): void => {
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

async function refreshSpotifyToken(req: express.Request): Promise<ITokenExpiryPair> {
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

    // Sicherstellen, dass die Session im Storage gespeichert wird
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    return {
      accessToken: req.session.access_token,
      expiresAt: req.session.expires_at
    };
  } catch (error) {
    // Falls Token ungültig/widerrufen wurde, verfallene Session-Daten löschen
    clearSpotifySession(req);
    throw error;
  }
}

router.get("/authenticate", async (req, res) => {
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

    // Session explizit speichern, bevor der Redirect durchgeführt wird
    req.session.save((err) => {
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

router.get("/authentication-callback", async (req, res) => {
  if (!req.session) {
    return res.status(500).json({ error: "Session missing" });
  }

  // 1. Werte VOR dem Löschen in Variablen sichern
  const savedState = req.session.authentication_state;
  const requestOrigin = req.session.authentication_origin || process.env.CLIENT_URL || "/";
  const redirectUri = req.session.redirected_uri || getRedirectUri(req);

  // 2. Jetzt die Session aufräumen
  delete req.session.authentication_state;
  delete req.session.authentication_origin;
  delete req.session.redirected_uri;

  const { subdirectory } = Config.client || {};
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${requestOrigin}?error=access_denied`);
  }

  // 3. Gegen den gesicherten savedState prüfen
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

    req.session.save((err) => {
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

router.get("/token", async (req, res) => {
  if (!req.session || !req.session.access_token || !req.session.refresh_token) {
    return res.status(401).json({ error: "No Spotify session available" });
  }

  const now = Date.now();
  const expiresAt = req.session.expires_at || 0;
  const isExpiringSoon = expiresAt - now < 60000; // Unter 60s Restlaufzeit

  if (isExpiringSoon || !isStoredTokenValid(req)) {
    try {
      const refreshedData = await refreshSpotifyToken(req);
      return res.json(refreshedData);
    } catch (err) {
      return res.status(401).json({ error: "Session expired or invalid" });
    }
  }

  // Einheitliche Key-Namen (camelCase wie in refreshSpotifyToken)
  return res.json({
    accessToken: req.session.access_token,
    expiresAt: req.session.expires_at
  });
});

router.get("/refresh-token", async (req, res) => {
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

router.post("/logout", (req, res) => {
  clearSpotifySession(req);
  if (req.session) {
    req.session.save(() => {
      res.json({ success: true, message: "Logged out from Spotify" });
    });
  } else {
    res.json({ success: true, message: "Logged out from Spotify" });
  }
});

export default router;