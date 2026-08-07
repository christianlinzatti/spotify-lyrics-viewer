import config from "../config";

export const getArtistInfo = async (artistName: string) => {
  try {
    const response = await fetch(
      `${config.api.root}/api/artist/${encodeURIComponent(artistName)}`
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching artist info:", error);
    return null;
  }
};
