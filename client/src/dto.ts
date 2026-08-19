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

export interface IArtistImage {
  url: string;
  height?: number;
  width?: number;
}

export interface IArtistInfo {
  id?: string;
  name: string;
  genres?: string[];
  images?: IArtistImage[];
  bio?: string;
}