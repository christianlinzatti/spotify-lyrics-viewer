import express, { Request, Response } from "express";
import NodeCache from "node-cache";
import { getLyrics as getLyricsFromGenius } from "../api/genius";
import { getLyrics as getLyricsFromLrcLib } from "../api/lrclib";
import config from "../config";
import { IFoundLyrics } from "../dto";

export const subRoute = "/api/lyrics";
const router = express.Router();

const lyricsCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

interface LyricsQuery {
  artists?: string | string[];
  title?: string;
  albumName?: string;
  duration?: string;
}

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

    const cacheKey = `lyrics_${mainArtist.toLowerCase()}_${cleanedTitle.toLowerCase()}`;
    const cachedLyrics = lyricsCache.get<IFoundLyrics>(cacheKey);

    if (cachedLyrics) {
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
      return res.json(cachedLyrics);
    }

    let lyricsResult: IFoundLyrics | null = null;

    // 1. LRCLIB Versuch
    try {
      lyricsResult = await getLyricsFromLrcLib(
        artistArray,
        cleanedTitle,
        albumName,
        durationNum
      );
    } catch (err) {
      console.warn("LRCLIB fetch failed, trying fallback...", err);
    }

    // 2. Genius Fallback
    if (!lyricsResult && config.genius?.access_token) {
      try {
        lyricsResult = await getLyricsFromGenius(
          artistArray,
          cleanedTitle,
          albumName,
          durationNum,
          config.genius.access_token
        );
      } catch (err) {
        console.warn("Genius fetch failed:", err);
      }
    }

    if (!lyricsResult) {
      return res.status(404).json({ error: "Unable to find lyrics" });
    }

    lyricsCache.set(cacheKey, lyricsResult);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");

    // Gibt direkt IFoundLyrics zurück (inkl. plainLyrics & syncedLyrics)
    return res.json(lyricsResult);

  } catch (error) {
    console.error("Error in /api/lyrics:", error);
    return res.status(500).json({ error: "Internal server error while fetching lyrics" });
  }
});

export default router;