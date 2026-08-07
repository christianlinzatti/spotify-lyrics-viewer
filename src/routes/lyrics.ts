import express, { Request, Response } from "express";
import NodeCache from "node-cache";
import { getLyrics as getLyricsFromGenius } from "../api/genius";
import { getLyrics as getLyricsFromLrcLib } from "../api/lrclib";
import config from "../config";

export const subRoute = "/api/lyrics";

const router = express.Router();

// Cache für Songtexte (TTL: 24 Stunden)
const lyricsCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

interface LyricsQuery {
  artists?: string | string[];
  title?: string;
  albumName?: string;
  duration?: string;
}

export interface LyricsResponse {
  lyrics: string;
  synced: boolean;
  source: "lrclib" | "genius";
}

/**
 * Entfernt Störbegriffe aus Songtiteln für eine höhere Trefferquote
 * z. B. "Song Title - Remastered 2020" -> "Song Title"
 */
function cleanTrackTitle(title: string): string {
  return title
    .replace(/-\s*.*remastered.*/i, "")
    .replace(/-\s*live.*/i, "")
    .replace(/\(feat\..*?\)/gi, "")
    .replace(/\[.*?\]/g, "")
    .trim();
}

router.get("/", async (req: Request<{}, {}, {}, LyricsQuery>, res: Response) => {
  try {
    const { artists, title, albumName, duration } = req.query;

    // 1. Validierung der Query-Parameter
    if (!artists || !title || !albumName || !duration) {
      return res.status(400).json({
        error: "Please provide 'artists', 'title', 'albumName', and 'duration'"
      });
    }

    const artistArray = typeof artists === "string" ? [artists] : artists;
    const durationNum = Number(duration);

    if (isNaN(durationNum)) {
      return res.status(400).json({ error: "'duration' must be a valid number" });
    }

    const cleanedTitle = cleanTrackTitle(title);
    const mainArtist = artistArray[0] || "";

    // 2. Cache Check (Key: Interpret + Titel)
    const cacheKey = `lyrics_${mainArtist.toLowerCase()}_${cleanedTitle.toLowerCase()}`;
    const cachedLyrics = lyricsCache.get<LyricsResponse>(cacheKey);

    if (cachedLyrics) {
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
      return res.json(cachedLyrics);
    }

    let lyricsResult: LyricsResponse | null = null;

    // 3. Versuch 1: LRCLIB (Liefert synchrone oder normale Lyrics)
    try {
      const lrclibData = await getLyricsFromLrcLib(
        artistArray,
        cleanedTitle,
        albumName,
        durationNum
      );

      if (lrclibData) {
        // Prüfen, ob synchrone (.lrc) oder normale Lyrics vorliegen
        const isSynced = typeof lrclibData === "string" && /^\[\d{2}:\d{2}\.\d{2}\]/m.test(lrclibData);
        lyricsResult = {
          lyrics: lrclibData,
          synced: isSynced,
          source: "lrclib"
        };
      }
    } catch (err) {
      console.warn("LRCLIB fetch failed, trying fallback...", err);
    }

    // 4. Versuch 2: Genius API Fallback (falls LRCLIB nichts findet)
    if (!lyricsResult && config.genius?.access_token) {
      try {
        const geniusData = await getLyricsFromGenius(
          artistArray,
          cleanedTitle,
          albumName,
          durationNum,
          config.genius.access_token
        );

        if (geniusData) {
          lyricsResult = {
            lyrics: geniusData,
            synced: false,
            source: "genius"
          };
        }
      } catch (err) {
        console.warn("Genius fetch failed:", err);
      }
    }

    // 5. Ergebnis auswerten
    if (!lyricsResult) {
      return res.status(404).json({ error: "Unable to find lyrics" });
    }

    // In Cache schreiben & Antwort senden
    lyricsCache.set(cacheKey, lyricsResult);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
    return res.json(lyricsResult);

  } catch (error) {
    console.error("Error in /api/lyrics:", error);
    return res.status(500).json({ error: "Internal server error while fetching lyrics" });
  }
});

export default router;
