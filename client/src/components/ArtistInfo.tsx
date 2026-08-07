import {
  Box,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Grid,
  Typography,
  Chip,
  Divider,
  Link,
  useTheme,
  useMediaQuery
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import React, { useEffect, useState } from "react";

const useStyles = makeStyles((theme) => ({
  root: {
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(3)
  },
  bioCard: {
    background: theme.palette.type === "dark"
      ? "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)"
      : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    borderRadius: theme.spacing(2),
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
  },
  bioContent: {
    padding: theme.spacing(3)
  },
  statsChip: {
    marginRight: theme.spacing(1),
    marginTop: theme.spacing(1),
    backgroundColor: "rgba(255,255,255,0.2)",
    color: "white"
  },
  sectionTitle: {
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(2),
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1)
  },
  trackCard: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    transition: "all 0.3s ease",
    "&:hover": {
      transform: "translateY(-8px)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.15)"
    }
  },
  trackContent: {
    flexGrow: 1
  },
  artistCard: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    transition: "all 0.3s ease",
    "&:hover": {
      transform: "translateY(-8px)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.15)"
    },
    borderRadius: theme.spacing(2)
  },
  artistImage: {
    height: 200,
    objectFit: "cover"
  },
  artistName: {
    textAlign: "center",
    fontWeight: 600,
    marginTop: theme.spacing(1)
  },
  playcount: {
    color: theme.palette.text.secondary,
    fontSize: "0.85rem"
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing(4)
  },
  error: {
    color: theme.palette.error.main,
    textAlign: "center",
    padding: theme.spacing(2)
  }
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
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
      <Box className={classes.loading}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !artistData) {
    return (
      <Typography className={classes.error}>
        {error || "Could not load artist information"}
      </Typography>
    );
  }

  const formatNumber = (num?: string) => {
    if (!num) return "N/A";
    const n = parseInt(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  };

  return (
    <Box className={classes.root}>
      {/* Biography Section */}
      {artistData.bio && (
        <Card className={classes.bioCard}>
          <CardContent className={classes.bioContent}>
            <Typography variant="h5" gutterBottom>
              About {artistData.name}
            </Typography>
            <Typography variant="body2" paragraph style={{ opacity: 0.95 }}>
              {artistData.bio.substring(0, 300)}
              {artistData.bio.length > 300 ? "..." : ""}
            </Typography>
            {artistData.url && (
              <Link
                href={artistData.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "white", fontWeight: 600 }}
              >
                Read more on Last.fm →
              </Link>
            )}
            <Box style={{ marginTop: "1rem" }}>
              {artistData.listeners && (
                <Chip
                  label={`${formatNumber(artistData.listeners)} Listeners`}
                  className={classes.statsChip}
                />
              )}
              {artistData.playcount && (
                <Chip
                  label={`${formatNumber(artistData.playcount)} Plays`}
                  className={classes.statsChip}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Top Tracks Section */}
      {artistData.topTracks && artistData.topTracks.length > 0 && (
        <>
          <Typography variant="h6" className={classes.sectionTitle}>
            🎵 Top Tracks
          </Typography>
          <Grid container spacing={2}>
            {artistData.topTracks.map((track, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card className={classes.trackCard}>
                  <CardContent className={classes.trackContent}>
                    <Typography variant="subtitle2" gutterBottom>
                      {index + 1}. {track.name}
                    </Typography>
                    {track.playcount && (
                      <Typography className={classes.playcount}>
                        {formatNumber(track.playcount)} plays
                      </Typography>
                    )}
                  </CardContent>
                  {track.url && (
                    <Box style={{ padding: "0 16px 16px" }}>
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
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Similar Artists Section */}
      {artistData.similarArtists && artistData.similarArtists.length > 0 && (
        <>
          <Typography variant="h6" className={classes.sectionTitle}>
            👥 Similar Artists
          </Typography>
          <Grid container spacing={2}>
            {artistData.similarArtists.map((artist, index) => (
              <Grid item xs={6} sm={4} md={2} key={index}>
                <Card className={classes.artistCard}>
                  {artist.image && (
                    <CardMedia
                      image={artist.image}
                      title={artist.name}
                      className={classes.artistImage}
                    />
                  )}
                  <CardContent style={{ flexGrow: 1, padding: "12px" }}>
                    <Link
                      href={artist.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="none"
                      style={{ textDecoration: "none" }}
                    >
                      <Typography className={classes.artistName} variant="body2">
                        {artist.name}
                      </Typography>
                    </Link>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
};

export default ArtistInfo;
