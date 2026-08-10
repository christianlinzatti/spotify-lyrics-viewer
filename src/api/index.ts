// src/api/index.ts

// Wenn getLyrics in src/api/lyrics.ts (oder client.ts) liegt:
export * from "./lyrics";

// Falls du weitere API-Module hast (z. B. spotify.ts, genius.ts, lrclib.ts):
export * from "./genius";
export * from "./lrclib";
export * from "./spotify";
