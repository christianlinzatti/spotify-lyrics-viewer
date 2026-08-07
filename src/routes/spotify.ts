import express from "express";
import SpotifyWebApi from "spotify-web-api-node";
import { URLSearchParams } from "url";
import { default as Config, default as config } from "../config";
import { ITokenExpiryPair } from "../dto";
import { randomString } from "../utils";
import { isStoredTokenValid } from "../utils/spotify";

export const subRoute = "/api/spotify";

// Bevorzuge immer die explizit konfigurierte REDIRECT_URI
const getRedirectUri = (req: express.Request) => {
  if (process.env.SPOTIFY_REDIRECT_URI) {
    return process.env.SPOTIFY_REDIRECT_URI;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers.host;
  return `${protocol}://${host}${subRoute}/authentication-callback`;
};

const millisecondsOffsetFromNow = (offset: number) => new Date().getTime() + offset * 1000;

const router = express.Router();

router.get("/authenticate", (req, res) => {
  if (req.session === null) throw new Error("Session has not been set");

  const redirectUri = getRedirectUri(req);
  const spotifyApi = new SpotifyWebApi({
    clientId: Config.spotify.client_id,
    redirectUri
  });
  const state = randomString(16);

  // Fallback auf CLIENT_URL, falls kein Referer vorhanden ist
  const origin = req.headers.referer || process.env.CLIENT_URL || "/";

  const authorizeURL = spotifyApi.createAuthorizeURL(
    Config.spotify.permission_scope.split(" "),
    state
  );

  req.session.authentication_state = state;
  req.session.authentication_origin = origin;
  req.session.redirected_uri = redirectUri;
  req.session.expires_at = undefined;
  req.session.access_token = undefined;
  req.session.refresh_token = undefined;

  // Redirect ausführen (ohne res.end())
  res.redirect(authorizeURL);
});

router.get("/authentication-callback", async (req, res) => {
  if (req.session === null) throw new Error("Session has not been set");

  // Fallback sicherstellen, damit keine 'undefined'-Pfade entstehen
  const requestOrigin = req.session.authentication_origin || process.env.CLIENT_URL || "/";
  const { subdirectory } = config.client;

  const { code, state } = req.query;

  // State-Validierung
  if (state === undefined || state !== req.session.authentication_state) {
    console.error("Unexpected state value");
    return res.redirect(`${requestOrigin}${subdirectory || ""}`);
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

    const responseData: ITokenExpiryPair = {
      access_token: req.session.access_token,
      expires_at: req.session.expires_at
    };

    const baseUrl = requestOrigin.endsWith("/") ? requestOrigin.slice(0, -1) : requestOrigin;
    const sub = subdirectory ? (subdirectory.startsWith("/") ? subdirectory : `/${subdirectory}`) : "";
    const redirectUrl = `${baseUrl}${sub}?${new URLSearchParams(responseData as any)}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error during authorizationCodeGrant:", error);
    res.redirect(`${requestOrigin}${subdirectory || ""}`);
  }
});

router.get("/token", (req, res) => {
  if (req.session === null) throw new Error("Session has not been set");

  if (!isStoredTokenValid(req)) {
    return res.status(401).send("No token available");
  }

  const responseData: ITokenExpiryPair = {
    access_token: req.session.access_token,
    expires_at: req.session.expires_at
  };
  res.json(responseData);
});

router.get("/refresh-token", async (req, res) => {
  if (req.session === null) throw new Error("Session has not been set");

  if (!isStoredTokenValid(req)) {
    return res.status(401).send("No token available");
  }

  try {
    const spotifyApi = new SpotifyWebApi({
      clientId: Config.spotify.client_id,
      clientSecret: Config.spotify.client_secret,
      redirectUri: getRedirectUri(req)
    });

    spotifyApi.setAccessToken(req.session.access_token);
    spotifyApi.setRefreshToken(req.session.refresh_token);

    const refreshResponse = await spotifyApi.refreshAccessToken();
    req.session.expires_at = millisecondsOffsetFromNow(refreshResponse.body.expires_in);
    req.session.access_token = refreshResponse.body.access_token;

    const responseData: ITokenExpiryPair = {
      access_token: req.session.access_token,
      expires_at: req.session.expires_at
    };
    res.json(responseData);
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).send("Failed to refresh token");
  }
});

export default router;
