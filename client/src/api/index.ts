import { IFoundLyrics, ITokenExpiryPair } from "../../../src/dto";
import Config from "../config";

getLyrics(artists, title, albumName, duration)
  .then(data => {
    if (data) {
      // Wenn die API direkt IFoundLyrics zurückgibt:
      const lyricsObj = "lyrics" in data ? (data as any).lyrics : data;
      setLyrics({ lyrics: lyricsObj });
    } else {
      setLyrics({ lyrics: null });
    }
  })
  .catch(() => setLyrics({ lyrics: null }));

export function spotifyGetCurrentToken(): Promise<ITokenExpiryPair | null> {
  return fetch(`${Config.api.root}/api/spotify/token`, {
    credentials: "include"
  }).then(r => {
    if (r.status === 200) {
      return r.json();
    } else {
      return null;
    }
  });
}

export function spotifyRefreshToken(): Promise<ITokenExpiryPair | null> {
  return fetch(`${Config.api.root}/api/spotify/refresh-token`, {
    credentials: "include"
  }).then(r => {
    if (r.status === 200) {
      return r.json();
    } else {
      return null;
    }
  });
}

export function deleteSession(): Promise<Response> {
  return fetch(`${Config.api.root}/api/session`, {
    credentials: "include",
    method: "DELETE"
  });
}
