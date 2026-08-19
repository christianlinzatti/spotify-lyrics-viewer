import config from "../config";
import type { IArtistInfo } from "../dto"; // 👈 Sauberer Import

export const getArtistInfo = async (
  artistName: string
): Promise<IArtistInfo | null> => {
  const trimmedName = artistName.trim();
  if (!trimmedName) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `${config.api.root}/api/artist/${encodeURIComponent(trimmedName)}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });

    clearTimeout(timeoutId);

    if (response.status === 404) return null;
    if (!response.ok) return null;

    const data: IArtistInfo = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error("Error fetching artist info:", error);
    return null;
  }
};
