import axios from "axios";
import { Router } from "express";
import NodeCache from "node-cache";
import SpotifyWebApi from "spotify-web-api-node";
import Config from "../config";

export const subRoute = "/api/artist";

interface AlbumInfo {
  name: string;
  url?: string;
  image?: string;
  playcount?: number;
}

interface ArtistInfo {
  name: string;
  url?: string;
  image: string; // Immer garantiert ein String
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

const router = Router();
const LASTFM_URL = "https://ws.audioscrobbler.com/2.0/";

// In-Memory Cache für 1 Stunde (TTL)
const artistCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Wiederverwendbarer Spotify Client mit Token-Management
let spotifyApiInstance: SpotifyWebApi | null = null;
let spotifyTokenExpiresAt = 0;

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
  if (now >= spotifyTokenExpiresAt - 60000) {
    try {
      const grant = await spotifyApiInstance.clientCredentialsGrant();
      spotifyApiInstance.setAccessToken(grant.body.access_token);
      spotifyTokenExpiresAt = now + grant.body.expires_in * 1000;
    } catch (err) {
      console.error("Failed to refresh Spotify client credentials token:", err);
      return null;
    }
  }

  return spotifyApiInstance;
}

/**
 * Durchsucht Spotify nach einem Künstlerbild (prüft bis zu 5 Treffer)
 */
async function fetchSpotifyArtistImage(artistName: string): Promise<string | undefined> {
  try {
    const spotifyApi = await getSpotifyClient();
    if (!spotifyApi) return undefined;

    const searchResult = await spotifyApi.searchArtists(artistName, { limit: 5 });
    const artists = searchResult.body.artists?.items;

    if (!artists || artists.length === 0) return undefined;

    // 1. Priorität: Exakte Namensübereinstimmung mit Bild
    const exactMatch = artists.find(
      (a) => a.name.toLowerCase() === artistName.toLowerCase() && a.images && a.images.length > 0
    );
    if (exactMatch) return exactMatch.images[0].url;

    // 2. Priorität: Erster Treffer mit gültigem Bild
    const firstWithImage = artists.find((a) => a.images && a.images.length > 0);
    if (firstWithImage) return firstWithImage.images[0].url;
  } catch (error) {
    console.error(`Spotify image search error for ${artistName}:`, error);
  }

  return undefined;
}

/**
 * Generiert ein garantiertes Fallback-Bild basierend auf den Initialen des Künstlers
 */
function generateInitialsAvatar(artistName: string): string {
  const encodedName = encodeURIComponent(artistName);
  return `https://ui-avatars.com/api/?name=${encodedName}&size=512&background=1DB954&color=ffffff&bold=true&font-size=0.33`;
}

/**
 * Ermittelt das beste Bild aus Last.fm, Spotify oder dem Avatar-Generator
 */
async function resolveArtistImage(artistName: string, lastFmImages?: any[]): Promise<string> {
  // 1. Last.fm Bild prüfen
  if (lastFmImages && lastFmImages.length > 0) {
    const largestImage = lastFmImages[lastFmImages.length - 1];
    if (
      largestImage["#text"] &&
      !largestImage["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f") // Generischer Last.fm-Star
    ) {
      return largestImage["#text"];
    }
  }

  // 2. Spotify API Bildsuche
  const spotifyImage = await fetchSpotifyArtistImage(artistName);
  if (spotifyImage) {
    return spotifyImage;
  }

  // 3. Garantiertes Avatar-Bild
  return generateInitialsAvatar(artistName);
}

function cleanBioText(text: string): string {
  return text
    .replace(/<a href="https:\/\/www.last.fm\/[^"]+">Read more on Last.fm<\/a>\.?/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * GET /api/artist/:artistName
 */
router.get("/:artistName", async (req, res) => {
  try {
    const rawArtistName = req.params.artistName;
    const artistName = decodeURIComponent(rawArtistName).trim();

    if (!Config.lastfm.api_key) {
      return res.status(400).json({ error: "Last.fm API key not configured" });
    }

    // Cache-Check
    const cacheKey = `artist_${artistName.toLowerCase()}`;
    const cachedArtist = artistCache.get<ArtistInfo>(cacheKey);
    if (cachedArtist) {
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
      return res.json(cachedArtist);
    }

    const apiKey = Config.lastfm.api_key;
    const acceptLanguage = req.headers["accept-language"] || "";
    const lang = acceptLanguage.toLowerCase().includes("de") ? "de" : "en";

    // Parallele Anfragen an Last.fm
    const [infoResult, tracksResult, similarResult, albumsResult] = await Promise.allSettled([
      axios.get(LASTFM_URL, {
        params: { method: "artist.getinfo", artist: artistName, api_key: apiKey, lang, format: "json" },
        timeout: 5000
      }),
      axios.get(LASTFM_URL, {
        params: { method: "artist.gettoptracks", artist: artistName, limit: 5, api_key: apiKey, format: "json" },
        timeout: 5000
      }),
      axios.get(LASTFM_URL, {
        params: { method: "artist.getsimilar", artist: artistName, limit: 6, api_key: apiKey, format: "json" },
        timeout: 5000
      }),
      axios.get(LASTFM_URL, {
        params: { method: "artist.gettopalbums", artist: artistName, limit: 6, api_key: apiKey, format: "json" },
        timeout: 5000
      })
    ]);

    if (
      infoResult.status === "rejected" ||
      !infoResult.value.data.artist ||
      infoResult.value.data.error
    ) {
      return res.status(404).json({ error: "Artist not found" });
    }

    const artist = infoResult.value.data.artist;

    // Bild für Hauptkünstler auflösen
    const mainArtistImage = await resolveArtistImage(artist.name || artistName, artist.image);

    const artistInfo: ArtistInfo = {
      name: artist.name || artistName,
      url: artist.url,
      image: mainArtistImage,
      listeners: artist.stats?.listeners,
      playcount: artist.stats?.playcount
    };

    // Bio säubern
    if (artist.bio?.summary) {
      artistInfo.bio = cleanBioText(artist.bio.summary);
    }

    // Genres / Tags
    if (artist.tags?.tag && Array.isArray(artist.tags.tag)) {
      artistInfo.tags = artist.tags.tag.map((t: any) => t.name);
    }

    // Top Tracks
    if (tracksResult.status === "fulfilled" && tracksResult.value.data.toptracks?.track) {
      artistInfo.topTracks = tracksResult.value.data.toptracks.track.map((track: any) => ({
        name: track.name,
        playcount: track.playcount,
        url: track.url
      }));
    }

    // Top Alben
    if (albumsResult.status === "fulfilled" && albumsResult.value.data.topalbums?.album) {
      artistInfo.topAlbums = albumsResult.value.data.topalbums.album.map((album: any) => {
        let albumImg = "";
        if (album.image && album.image.length > 0) {
          albumImg = album.image[album.image.length - 1]["#text"] || "";
        }
        return {
          name: album.name,
          url: album.url,
          image: albumImg || generateInitialsAvatar(album.name),
          playcount: album.playcount
        };
      });
    }

    // Ähnliche Künstler (Parallele Bild-Auflösung für jeden ähnlichen Künstler)
    if (similarResult.status === "fulfilled" && similarResult.value.data.similarartists?.artist) {
      const rawSimilar = similarResult.value.data.similarartists.artist.slice(0, 6);

      artistInfo.similarArtists = await Promise.all(
        rawSimilar.map(async (similarArtist: any) => {
          const image = await resolveArtistImage(similarArtist.name, similarArtist.image);
          return {
            name: similarArtist.name,
            url: similarArtist.url,
            image
          };
        })
      );
    }

    // In Cache schreiben
    artistCache.set(cacheKey, artistInfo);

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
    return res.json(artistInfo);
  } catch (error) {
    console.error("Error fetching artist info:", error);
    return res.status(500).json({
      error: "Failed to fetch artist information"
    });
  }
});

export default router;
