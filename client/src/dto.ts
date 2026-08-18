export interface IFoundLyrics {
  artist: string;
  title: string;
  plainLyrics?: string;
  syncedLyrics?: string | null;
  attribution?: string;
}

export interface ITokenExpiryPair {
  accessToken: string;
  expiresAt: number;
}