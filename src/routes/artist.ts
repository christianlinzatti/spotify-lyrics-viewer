import axios from "axios";
import { Router } from "express";
import NodeCache from "node-cache";
import SpotifyWebApi from "spotify-web-api-node";
import Config from "../config";

export const subRoute = "/api/artist";

// --- Interfaces ---

export interface AlbumInfo {
  name: string;
  url?: string;
  image?: string;
  playcount?: number;
}

export interface ArtistInfo {
  name: string;
  url?: string;
  image: string;
  bio?: string;
  tags?: string[];
  listeners?: string;
  playcount?: string;
  topTracks?: Array<{
    name: string;
    playcount?: string;
    url?: string;
  }>;
  topAlbums?: AlbumInfo[];
  similarArtists?: Array<{
    name: string;
    url?: string;
    image: string;
  }>;
}

// Minimal-Typen für Last.fm API
interface LastFmImage {
  "#text": string;
  size: string;
}

interface LastFmTag {
  name: string;
  url: string;
}

const router = Router();

// --- Caches & Clients ---

// Cache für komplette Künstler-Infos (1 Stunde)
const artistCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
// Eigener Cache für aufgelöste Bilder (24 Stunden), um Spotify API-Calls zu minimieren
const imageCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// Vorkonfigurierter Axios Client für Last.fm (DRY)
const lastFmClient = axios.create({
  baseURL: "https://ws.audioscrobbler.com/2.0/",
  timeout: 5000
});

// Spotify Singleton & Token Refresh Promise (verhindert Race Conditions)
let spotifyApiInstance: SpotifyWebApi | null = null;
let spotifyTokenExpiresAt = 0;
let tokenRefreshPromise: Promise<void> | null = null;

async function getSpotifyClient(): Promise<SpotifyWebApi | null> {
  if (!Config.spotify?.client_id || !Config.spotify?.client_secret) {
    return null;
  }

  if (!spotifyApiInstance) {
    spotifyApiInstance = new SpotifyWebApi({
      clientId: Config.spotify.client_id,
      clientSecret: Config.spotify.client_secret
    });
  }

  const now = Date.now();
  // Token vor Ablauf (60s Puffer) erneuern
  if (now >= spotifyTokenExpiresAt - 60000) {
    // Falls bereits eine Token-Anfrage läuft, warten wir auf dieselbe
    if (!tokenRefreshPromise) {
      tokenRefreshPromise = spotifyApiInstance
        .clientCredentialsGrant()
        .then((grant) => {
          spotifyApiInstance?.setAccessToken(grant.body.access_token);
          spotifyTokenExpiresAt = Date.now() + grant.body.expires_in * 1000;
        })
        .catch((err) => {
          console.error("Failed to refresh Spotify client credentials token:", err);
        })
        .finally(() => {
          tokenRefreshPromise = null;
        });
    }
    await tokenRefreshPromise;
  }

  return spotifyApiInstance;
}

// --- Hilfsfunktionen ---

/**
 * Durchsucht Spotify nach einem Künstlerbild mit Cache-Support
 */
async function fetchSpotifyArtistImage(artistName: string): Promise<string | undefined> {
  const cacheKey = `spotify_img_${artistName.toLowerCase()}`;
  const cachedImg = imageCache.get<string>(cacheKey);
  if (cachedImg !== undefined) return cachedImg;

  try {
    const spotifyApi = await getSpotifyClient();
    if (!spotifyApi) return undefined;

    const searchResult = await spotifyApi.searchArtists(artistName, { limit: 5 });
    const artists = searchResult.body.artists?.items;

    if (!artists || artists.length === 0) return undefined;

    const exactMatch = artists.find(
      (a) => a.name.toLowerCase() === artistName.toLowerCase() && a.images && a.images.length > 0
    );

    const imageUrl = exactMatch ? exactMatch.images[0].url : artists.find((a) => a.images?.length > 0)?.images[0].url;

    if (imageUrl) {
      imageCache.set(cacheKey, imageUrl);
      return imageUrl;
    }
  } catch (error) {
    console.error(`Spotify image search error for ${artistName}:`, error);
  }

  return undefined;
}

function generateInitialsAvatar(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=512&background=1DB954&color=ffffff&bold=true&font-size=0.33`;
}

async function resolveArtistImage(artistName: string, lastFmImages?: LastFmImage[]): Promise<string> {
  // 1. Last.fm Bild prüfen
  if (lastFmImages && lastFmImages.length > 0) {
    const largestImage = lastFmImages[lastFmImages.length - 1];
    const url = largestImage["#text"];
    if (url && !url.includes("2a96cbd8b46e442fc41c2b86b821562f")) {
      return url;
    }
  }

  // 2. Spotify API Bildsuche (gecached)
  const spotifyImage = await fetchSpotifyArtistImage(artistName);
  if (spotifyImage) return spotifyImage;

  // 3. Fallback Avatar
  return generateInitialsAvatar(artistName);
}

function cleanBioText(text: string): string {
  return text
    .replace(/<a href="https:\/\/www\.last\.fm\/[^"]+">Read more on Last\.fm<\/a>\.?/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Route Handler ---

router.get("/:artistName", async (req, res) => {
  try {
    // Express dekodiert Params bereits. Fallback bei ungültigen Zeichen.
    let artistName = req.params.artistName;
    try {
      artistName = decodeURIComponent(artistName).trim();
    } catch {
      artistName = artistName.trim();
    }

    if (!Config.lastfm.api_key) {
      return res.status(400).json({ error: "Last.fm API key not configured" });
    }

    const cacheKey = `artist_${artistName.toLowerCase()}`;
    const cachedArtist = artistCache.get<ArtistInfo>(cacheKey);
    if (cachedArtist) {
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
      return res.json(cachedArtist);
    }

    const apiKey = Config.lastfm.api_key;
    const acceptLanguage = req.headers["accept-language"] || "";
    const lang = acceptLanguage.toLowerCase().includes("de") ? "de" : "en";

    // Parallele Last.fm Requests mit zentralem Client
    const defaultParams = { api_key: apiKey, format: "json", artist: artistName };

    const [infoResult, tracksResult, similarResult, albumsResult] = await Promise.allSettled([
      lastFmClient.get("", { params: { ...defaultParams, method: "artist.getinfo", lang } }),
      lastFmClient.get("", { params: { ...defaultParams, method: "artist.gettoptracks", limit: 5 } }),
      lastFmClient.get("", { params: { ...defaultParams, method: "artist.getsimilar", limit: 6 } }),
      lastFmClient.get("", { params: { ...defaultParams, method: "artist.gettopalbums", limit: 6 } })
    ]);

    if (
      infoResult.status === "rejected" ||
      !infoResult.value.data.artist ||
      infoResult.value.data.error
    ) {
      return res.status(404).json({ error: "Artist not found" });
    }

    const artist = infoResult.value.data.artist;
    const mainArtistImage = await resolveArtistImage(artist.name || artistName, artist.image);

    const artistInfo: ArtistInfo = {
      name: artist.name || artistName,
      url: artist.url,
      image: mainArtistImage,
      listeners: artist.stats?.listeners,
      playcount: artist.stats?.playcount
    };

    if (artist.bio?.summary) {
      artistInfo.bio = cleanBioText(artist.bio.summary);
    }

    if (Array.isArray(artist.tags?.tag)) {
      artistInfo.tags = artist.tags.tag.map((t: LastFmTag) => t.name);
    }

    if (tracksResult.status === "fulfilled" && tracksResult.value.data.toptracks?.track) {
      artistInfo.topTracks = tracksResult.value.data.toptracks.track.map((track: any) => ({
        name: track.name,
        playcount: track.playcount,
        url: track.url
      }));
    }

    if (albumsResult.status === "fulfilled" && albumsResult.value.data.topalbums?.album) {
      artistInfo.topAlbums = albumsResult.value.data.topalbums.album.map((album: any) => {
        const albumImg = album.image?.[album.image.length - 1]?.["#text"];
        return {
          name: album.name,
          url: album.url,
          image: albumImg || generateInitialsAvatar(album.name),
          playcount: album.playcount
        };
      });
    }

    if (similarResult.status === "fulfilled" && similarResult.value.data.similarartists?.artist) {
      const rawSimilar = similarResult.value.data.similarartists.artist.slice(0, 6);

      artistInfo.similarArtists = await Promise.all(
        rawSimilar.map(async (similarArtist: { name: string; url?: string; image?: LastFmImage[] }) => {
          const image = await resolveArtistImage(similarArtist.name, similarArtist.image);
          return {
            name: similarArtist.name,
            url: similarArtist.url,
            image
          };
        })
      );
    }

    artistCache.set(cacheKey, artistInfo);

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
    return res.json(artistInfo);
  } catch (error) {
    console.error("Error fetching artist info:", error);
    return res.status(500).json({ error: "Failed to fetch artist information" });
  }
});

export default function handler(req: any, res: any) {
  return router(req, res, (err?: any) => {
    if (err) {
      console.error("Artist Router Error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
}