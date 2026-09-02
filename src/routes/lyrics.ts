import express from "express";
import NodeCache from "node-cache"; // Falls es weiterhin meckert: import * as NodeCache from "node-cache";
import { getLyrics as getLyricsFromGenius } from "../api/genius";
import { getLyrics as getLyricsFromLrcLib } from "../api/lrclib";
import config from "../config";
import { IFoundLyrics } from "../dto";

export const subRoute = "/api/lyrics";
const router = express.Router();

// Falls TS meckert, dass NodeCache keine Konstruktor-Funktion ist:
const CacheConstructor = typeof NodeCache === "function" ? NodeCache : (NodeCache as any).default || NodeCache;
const lyricsCache = new CacheConstructor({ stdTTL: 86400, checkperiod: 3600 });

function cleanTrackTitle(title: string): string {
  return title
    .replace(/-\s*.*remastered.*/i, "")
    .replace(/-\s*live.*/i, "")
    .replace(/\(feat\..*?\)/gi, "")
    .replace(/\[.*?\]/g, "")
    .trim();
}

router.get("/", async (req: any, res: any) => {
  try {
    const artistsQuery = req.query.artists;
    const titleQuery = req.query.title;
    const albumNameQuery = req.query.albumName;
    const durationQuery = req.query.duration;

    if (!artistsQuery || !titleQuery || !albumNameQuery || !durationQuery) {
      return res.status(400).json({
        error: "Please provide 'artists', 'title', 'albumName', and 'duration'"
      });
    }

    const title = Array.isArray(titleQuery) ? String(titleQuery[0]) : String(titleQuery);
    const albumName = Array.isArray(albumNameQuery) ? String(albumNameQuery[0]) : String(albumNameQuery);
    const durationStr = Array.isArray(durationQuery) ? String(durationQuery[0]) : String(durationQuery);

    let artistArray: string[] = [];
    if (Array.isArray(artistsQuery)) {
      artistArray = artistsQuery.map(a => String(a));
    } else {
      artistArray = [String(artistsQuery)];
    }

    const durationNum = Number(durationStr);

    if (isNaN(durationNum)) {
      return res.status(400).json({ error: "'duration' must be a valid number" });
    }

    const cleanedTitle = cleanTrackTitle(title);
    const mainArtist = artistArray[0] || "";

    const cacheKey = `lyrics_${mainArtist.toLowerCase()}_${cleanedTitle.toLowerCase()}`;
    const cachedLyrics = lyricsCache.get(cacheKey) as IFoundLyrics | undefined;

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

    return res.json(lyricsResult);

  } catch (error) {
    console.error("Error in /api/lyrics:", error);
    return res.status(500).json({ error: "Internal server error while fetching lyrics" });
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