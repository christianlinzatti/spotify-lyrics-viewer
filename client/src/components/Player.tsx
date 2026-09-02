import PauseCircleFilledIcon from "@mui/icons-material/PauseCircleFilled";
import PlayCircleFilledIcon from "@mui/icons-material/PlayCircleFilled";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import { AppBar, Box, Container, IconButton, Slider, Typography } from "@mui/material";
import React from "react";
import SpotifyWebApi from "spotify-web-api-js";
import useSmoothProgress from "../hooks/useSmoothProgress";
import SpotifyLogoRoundImage from "../img/spotify-logo-round.png";
import { CurrentlyPlayingState } from "../types/currentlyPlayingState";
import { IToken } from "../types/token";
import { formatMilliseconds, responseError } from "../utils";

const placeholder1PxImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mO8+x8AAr8B3gzOjaQAAAAASUVORK5CYII=";

interface PlayerProps {
  currentlyPlayingSong: CurrentlyPlayingState;
  token: IToken | null;
}

const Player: React.FC<PlayerProps> = ({ currentlyPlayingSong, token }) => {
  let albumArt = currentlyPlayingSong.currentlyPlayingObject?.item?.album.images[0]?.url;
  let title = currentlyPlayingSong.currentlyPlayingObject?.item?.name ?? "---";
  let artist =
    currentlyPlayingSong.currentlyPlayingObject?.item?.artists.map(a => a.name).join(", ") ?? "---";
  let durationMs = currentlyPlayingSong.currentlyPlayingObject?.item?.duration_ms ?? 0;
  const progressMs = currentlyPlayingSong.currentlyPlayingObject?.progress_ms ?? 0;
  const isPlaying = currentlyPlayingSong.currentlyPlayingObject?.is_playing ?? false;

  if (currentlyPlayingSong?.currentlyPlayingObject?.currently_playing_type === "ad") {
    albumArt = SpotifyLogoRoundImage;
    title = "Advertisement";
    artist = "Spotify";
    durationMs = Math.max(progressMs, 30 * 1000);
  }

  const {
    onUserFinishedSliding,
    onUserSlide,
    progress: smoothedProgressMs
  } = useSmoothProgress(progressMs, durationMs, isPlaying, token);

  const onSkipPrevious = () => {
    if (token) {
      const spotifyApi = new SpotifyWebApi();
      spotifyApi.setAccessToken(token.value);
      spotifyApi.skipToPrevious().catch(e => responseError("Failed to Skip to Previous Song", e));
    }
  };

  const onSkipNext = () => {
    if (token) {
      const spotifyApi = new SpotifyWebApi();
      spotifyApi.setAccessToken(token.value);
      spotifyApi.skipToNext().catch(e => {
        responseError("Failed to Skip to Next Song", e);
      });
    }
  };

  const onPlayPauseToggle = () => {
    if (token) {
      const spotifyApi = new SpotifyWebApi();
      spotifyApi.setAccessToken(token.value);
      if (isPlaying) {
        spotifyApi.pause().catch(e => responseError("Failed to Pause", e));
      } else {
        spotifyApi.play().catch(e => responseError("Failed to Play", e));
      }
    }
  };

  return (
    <AppBar
      position="static"
      color="primary"
      sx={{
        backgroundColor: "background.paper",
        top: "auto",
        bottom: 0,
        py: 0.75
      }}
    >
      <Container maxWidth="md">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "auto auto", sm: "auto auto 1fr" },
            gridColumnGap: 16,
            alignItems: "center"
          }}
        >
          {/* Song Info */}
          <Box
            sx={{
              display: "inline-grid",
              gridTemplateColumns: "auto 1fr",
              gridTemplateRows: "1fr 1fr",
              gridColumnGap: "5px",
              maxWidth: 250,
              alignItems: "center"
            }}
          >
            <Box
              sx={{
                gridColumn: "1 / 2",
                gridRow: "1 / 3",
                display: "flex",
                alignItems: "center"
              }}
            >
              <Box
                component="img"
                src={albumArt ?? placeholder1PxImage}
                alt="Album art for current song"
                sx={{ height: 40, width: 40, borderRadius: 1 }}
              />
            </Box>
            <Typography
              variant="body2"
              title={title}
              sx={{
                color: "text.primary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontWeight: 600
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="caption"
              title={artist}
              sx={{
                color: "text.secondary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {artist}
            </Typography>
          </Box>

          {/* Controls */}
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <IconButton onClick={onSkipPrevious} sx={{ color: "text.primary" }}>
              <SkipPreviousIcon fontSize="large" />
            </IconButton>

            <IconButton onClick={onPlayPauseToggle} sx={{ color: "text.primary" }}>
              {isPlaying ? (
                <PauseCircleFilledIcon fontSize="large" />
              ) : (
                <PlayCircleFilledIcon fontSize="large" />
              )}
            </IconButton>

            <IconButton onClick={onSkipNext} sx={{ color: "text.primary" }}>
              <SkipNextIcon fontSize="large" />
            </IconButton>
          </Box>

          {/* Timeline / Slider */}
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gridColumn: { xs: "1 / 3", sm: "auto" },
              width: "100%"
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "text.primary", whiteSpace: "nowrap" }}
            >
              {formatMilliseconds(smoothedProgressMs)}
            </Typography>

            <Slider
              valueLabelDisplay="off"
              value={Math.min(smoothedProgressMs, durationMs || 1)}
              min={0}
              max={durationMs || 1}
              disabled={durationMs === 0}
              onChange={(_: any, value: number | number[]) => {
                const numericValue = Array.isArray(value) ? value[0] : value;
                (onUserSlide as any)(numericValue);
              }}
              onChangeCommitted={(_: any, value: number | number[]) => {
                const numericValue = Array.isArray(value) ? value[0] : value;
                (onUserFinishedSliding as any)(numericValue);
              }}
              sx={{
                mx: 2,
                py: { xs: 1.25, sm: 1.5 }
              }}
            />

            <Typography
              variant="caption"
              sx={{ color: "text.primary", whiteSpace: "nowrap" }}
            >
              {formatMilliseconds(durationMs)}
            </Typography>
          </Box>
        </Box>
      </Container>
    </AppBar>
  );
};

export default Player;