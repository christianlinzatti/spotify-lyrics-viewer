import axios from "axios";
import { Router } from "express";
import Config from "../config";

export const subRoute = "/api/artist";

interface ArtistInfo {
  name: string;
  url?: string;
  image?: string;
  bio?: string;
  listeners?: string;
  playcount?: string;
  topTracks?: Array<{
    name: string;
    playcount?: string;
    url?: string;
  }>;
  similarArtists?: Array<{
    name: string;
    url?: string;
    image?: string;
  }>;
}

const router = Router();

/**
 * Fetch artist information from Last.fm
 * GET /api/artist/:artistName
 */
router.get("/:artistName", async (req, res) => {
  try {
    const { artistName } = req.params;

    if (!Config.lastfm.api_key) {
      return res.status(400).json({
        error: "Last.fm API key not configured"
      });
    }

    const artistInfo: ArtistInfo = {
      name: artistName
    };

    // Fetch artist info from Last.fm
    const artistResponse = await axios.get("http://ws.audioscrobbler.com/2.0/", {
      params: {
        method: "artist.getinfo",
        artist: artistName,
        api_key: Config.lastfm.api_key,
        format: "json"
      },
      timeout: 5000
    });

    if (artistResponse.data.artist) {
      const artist = artistResponse.data.artist;
      artistInfo.url = artist.url;
      artistInfo.bio = artist.bio?.summary?.replace(/<[^>]*>/g, ""); // Remove HTML tags
      artistInfo.listeners = artist.stats?.listeners;
      artistInfo.playcount = artist.stats?.playcount;

      // Get image from Last.fm
      if (artist.image && artist.image.length > 0) {
        const largestImage = artist.image[artist.image.length - 1];
        if (largestImage["#text"]) {
          artistInfo.image = largestImage["#text"];
        }
      }
    }

    // Fetch top tracks
    try {
      const tracksResponse = await axios.get("http://ws.audioscrobbler.com/2.0/", {
        params: {
          method: "artist.gettoptracks",
          artist: artistName,
          limit: 5,
          api_key: Config.lastfm.api_key,
          format: "json"
        },
        timeout: 5000
      });

      if (tracksResponse.data.toptracks?.track) {
        artistInfo.topTracks = tracksResponse.data.toptracks.track.map((track: any) => ({
          name: track.name,
          playcount: track.playcount,
          url: track.url
        }));
      }
    } catch (error) {
      console.error("Error fetching top tracks:", error);
    }

    // Fetch similar artists
    try {
      const similarResponse = await axios.get("http://ws.audioscrobbler.com/2.0/", {
        params: {
          method: "artist.getsimilar",
          artist: artistName,
          limit: 6,
          api_key: Config.lastfm.api_key,
          format: "json"
        },
        timeout: 5000
      });

      if (similarResponse.data.similarartists?.artist) {
        artistInfo.similarArtists = similarResponse.data.similarartists.artist.map(
          (similarArtist: any) => {
            let image = "";
            if (similarArtist.image && similarArtist.image.length > 0) {
              const largestImage = similarArtist.image[similarArtist.image.length - 1];
              if (largestImage["#text"]) {
                image = largestImage["#text"];
              }
            }
            return {
              name: similarArtist.name,
              url: similarArtist.url,
              image
            };
          }
        );
      }
    } catch (error) {
      console.error("Error fetching similar artists:", error);
    }

    res.json(artistInfo);
  } catch (error) {
    console.error("Error fetching artist info:", error);
    res.status(500).json({
      error: "Failed to fetch artist information"
    });
  }
});

export default router;
