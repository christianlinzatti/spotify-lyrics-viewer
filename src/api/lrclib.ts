import axios from "axios";
import { Lrc, Lyric } from "lrc-kit";
import { IFoundLyrics } from "../dto";

const LRCLIB_BASE_URL = "https://lrclib.net";
const LRCLIB_USER_AGENT =
  "Spotify Lyrics Viewer (https://github.com/brentvollebregt/spotify-lyrics-viewer)";

export async function getLyrics(
  artists: string[],
  title: string,
  albumName: string,
  durationMs: number
): Promise<IFoundLyrics | null> {
  const parameters = {
    artist_name: artists[0],
    track_name: title,
    album_name: albumName,
    duration: (durationMs / 1000).toString()
  };

  const requestUrl = `https://lrclib.net/api/get?${new URLSearchParams(parameters)}`;

  try {
    let response = await axios.get<LrcLibGetResponse>(requestUrl, {
      headers: { "User-Agent": LRCLIB_USER_AGENT },
      validateStatus: status => status === 200 || status === 404
    });

    let data = response.data;

    // Fallback auf /api/search, falls /api/get 404 liefert
    if (response.status === 404) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${artists[0]} ${title}`)}`;
      const searchRes = await axios.get<LrcLibGetResponse[]>(searchUrl, {
        headers: { "User-Agent": LRCLIB_USER_AGENT }
      });

      if (!searchRes.data || searchRes.data.length === 0) {
        return null;
      }
      data = searchRes.data[0]; // Ersten Treffer verwenden
    }

    if (!data.syncedLyrics && !data.plainLyrics) {
      return null;
    }

    let syncedLyrics: Lyric[] | null = null;
    if (data.syncedLyrics) {
      try {
        const lrc = Lrc.parse(data.syncedLyrics);
        if (lrc.lyrics.length > 0) syncedLyrics = lrc.lyrics;
      } catch (e) {
        console.error("LRC Parse Error", e);
      }
    }

    return {
      artist: data.artistName,
      title: data.trackName,
      plainLyrics: data.plainLyrics || null,
      syncedLyrics: syncedLyrics,
      attribution: LRCLIB_BASE_URL
    };
  } catch (e) {
    console.warn(`Failed to fetch from LRCLIB:`, e);
    return null;
  }
}

export interface LrcLibGetResponse {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  lang: string;
  isrc: string;
  spotifyId: string;
  releaseDate: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}
