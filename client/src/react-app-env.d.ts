declare module 'lrc-kit' {
  export interface Lyric {
    timestamp: number;
    content: string;
    [key: string]: any;
  }

  export function parse(text: string): Lyric[];
  export function stringify(lyrics: Lyric[]): string;
}
