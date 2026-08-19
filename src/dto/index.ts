import { Lyric } from "lrc-kit";

export interface ITokenExpiryPair {
  accessToken: string;
  expiresAt: number;
}

export interface IFoundLyrics {
  title: string;
  artist: string;
  plainLyrics: string | null;
  syncedLyrics: Lyric[] | null;
  attribution: string;
}