import { Box, CircularProgress, Divider, Typography } from "@material-ui/core";
import React from "react";
import ArtistInfo from "../../components/ArtistInfo";
import { PlayingStatePaused, PlayingStatePlaying } from "../../types/currentlyPlayingState";
import { ITrackLyrics } from "../../types/trackLyrics";
import LyricsDisplay from "./LyricsDisplay";

interface IProps {
  lyricDetails?: ITrackLyrics;
  currentlyPlayingSong?: PlayingStatePlaying | PlayingStatePaused;
}

const TrackPlaying: React.FunctionComponent<IProps> = ({ lyricDetails, currentlyPlayingSong }) => {
  const artistName = currentlyPlayingSong?.currentlyPlayingObject?.item?.artists?.[0]?.name;

  // No lyrics yet
  if (lyricDetails === undefined) {
    return (
      <Box textAlign="center">
        <CircularProgress size={30} />
      </Box>
    );
  }

  // No lyrics found
  if (lyricDetails.lyrics === undefined) {
    return (
      <Box textAlign="center">
        <Typography>No lyrics found for the current track.</Typography>
        {artistName && (
          <>
            <Divider style={{ margin: "2rem 0" }} />
            <ArtistInfo artistName={artistName} />
          </>
        )}
      </Box>
    );
  }

  // Lyrics miss
  const lyricsAreEmpty =
    !lyricDetails?.lyrics?.plainLyrics &&
    (!lyricDetails?.lyrics?.syncedLyrics || lyricDetails.lyrics.syncedLyrics.length === 0);

  if (lyricsAreEmpty) {
    return (
      <Box textAlign="center">
        <Typography>No lyrics found for this track.</Typography>
      </Box>
    );
  }

  // Lyrics found
  return (
    <Box>
      <LyricsDisplay
        lyricsDetails={lyricDetails.lyrics}
        progressMs={currentlyPlayingSong?.currentlyPlayingObject?.progress_ms ?? 0}
        paused={!currentlyPlayingSong?.currentlyPlayingObject?.is_playing ?? false}
      />
      {artistName && (
        <>
          <Divider style={{ margin: "2rem 0" }} />
          <ArtistInfo artistName={artistName} />
        </>
      )}
    </Box>
  );
};

export default TrackPlaying;
