import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Grid,
  Link,
  styled,
  Typography,
  useTheme
} from "@mui/material";
import React, { useEffect, useState } from "react";

// Native MUI v5 Styled Component für Hover-Effekte & Custom Styling
const HoverCard = styled(Card)(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "column",
  transition: "all 0.3s ease",
  "&:hover": {
    transform: "translateY(-8px)",
    boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
  },
}));

interface ArtistData {
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

interface ArtistInfoProps {
  artistName?: string;
}

const ArtistInfo: React.FC<ArtistInfoProps> = ({ artistName }) => {
  const theme = useTheme();
  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName) return;

    const fetchArtistInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/artist/${encodeURIComponent(artistName)}`);
        if (!response.ok) {
          throw new Error("Failed to fetch artist information");
        }
        const data = await response.json();
        setArtistData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error fetching artist info");
      } finally {
        setLoading(false);
      }
    };

    fetchArtistInfo();
  }, [artistName]);

  if (!artistName) return null;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !artistData) {
    return (
      <Typography color="error" textAlign="center" sx={{ py: 2 }}>
        {error || "Could not load artist information"}
      </Typography>
    );
  }

  const formatNumber = (num?: string) => {
    if (!num) return "N/A";
    const n = parseInt(num, 10);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  };

  return (
    <Box sx={{ my: 3 }}>
      {/* Biography Section */}
      {artistData.bio && (
        <Card
          sx={{
            background:
              theme.palette.mode === "dark"
                ? "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)"
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            borderRadius: 4, // entspricht 2 * spacing(1) = 16px (MUI Theme-Standard)
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              About {artistData.name}
            </Typography>
            <Typography variant="body2" paragraph sx={{ opacity: 0.95 }}>
              {artistData.bio.substring(0, 300)}
              {artistData.bio.length > 300 ? "..." : ""}
            </Typography>
            {artistData.url && (
              <Link
                href={artistData.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "white", fontWeight: 600 }}
              >
                Read more on Last.fm →
              </Link>
            )}
            <Box sx={{ mt: 2 }}>
              {artistData.listeners && (
                <Chip
                  label={`${formatNumber(artistData.listeners)} Listeners`}
                  sx={{
                    mr: 1,
                    mt: 1,
                    backgroundColor: "rgba(255,255,255,0.2)",
                    color: "white",
                  }}
                />
              )}
              {artistData.playcount && (
                <Chip
                  label={`${formatNumber(artistData.playcount)} Plays`}
                  sx={{
                    mr: 1,
                    mt: 1,
                    backgroundColor: "rgba(255,255,255,0.2)",
                    color: "white",
                  }}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Top Tracks Section */}
      {artistData.topTracks && artistData.topTracks.length > 0 && (
        <>
          <Typography
            variant="h6"
            sx={{
              mt: 3,
              mb: 2,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            🎵 Top Tracks
          </Typography>
          <Grid container spacing={2}>
            {artistData.topTracks.map((track, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <HoverCard>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      {index + 1}. {track.name}
                    </Typography>
                    {track.playcount && (
                      <Typography variant="caption" color="text.secondary">
                        {formatNumber(track.playcount)} plays
                      </Typography>
                    )}
                  </CardContent>
                  {track.url && (
                    <Box sx={{ px: 2, pb: 2 }}>
                      <Link
                        href={track.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="caption"
                      >
                        View on Last.fm
                      </Link>
                    </Box>
                  )}
                </HoverCard>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Similar Artists Section */}
      {artistData.similarArtists && artistData.similarArtists.length > 0 && (
        <>
          <Typography
            variant="h6"
            sx={{
              mt: 3,
              mb: 2,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            👥 Similar Artists
          </Typography>
          <Grid container spacing={2}>
            {artistData.similarArtists.map((artist, index) => (
              <Grid item xs={6} sm={4} md={2} key={index}>
                <HoverCard sx={{ borderRadius: 4 }}>
                  {artist.image && (
                    <CardMedia
                      component="img"
                      image={artist.image}
                      title={artist.name}
                      sx={{ height: 200, objectFit: "cover" }}
                    />
                  )}
                  <CardContent sx={{ flexGrow: 1, p: 1.5 }}>
                    <Link
                      href={artist.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="none"
                    >
                      <Typography
                        variant="body2"
                        sx={{ textAlign: "center", fontWeight: 600, mt: 1 }}
                      >
                        {artist.name}
                      </Typography>
                    </Link>
                  </CardContent>
                </HoverCard>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
};

export default ArtistInfo;