import {
  Box,
  IconButton,
  InputAdornment,
  Link,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { makeStyles } from "@mui/styles";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import SyncEnabledIcon from "@mui/icons-material/Sync";
import SyncDisabledIcon from "@mui/icons-material/SyncDisabled";
import MarkJS from "mark.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { IFoundLyrics } from "../../../../src/dto";
import useSmoothProgress from "../../hooks/useSmoothProgress";
import "./LyricsDisplay.css";

interface IProps {
  lyricsDetails: IFoundLyrics;
  progressMs: number;
  paused: boolean;
}

const LyricsDisplay: React.FunctionComponent<IProps> = ({ lyricsDetails, progressMs, paused }) => {
  const classes = useStyles();
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const highlightedRef = useRef<HTMLSpanElement | null>(null);
  const [search, setSearch] = useState("");
  const [searchShown, setSearchShown] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(true);

  const { progress: smoothedProgressMs } = useSmoothProgress(
    progressMs,
    Infinity,
    !paused,
    null,
    250
  );

  const isSyncingPossible = lyricsDetails.syncedLyrics !== null && lyricsDetails.syncedLyrics.length > 0;

  // 1. Highlight text when search changes
  useEffect(() => {
    if (lyricsRef.current !== null) {
      const instance = new MarkJS(lyricsRef.current);
      instance.unmark();
      if (search.trim() !== "") {
        instance.mark(search);
      }
    }
  }, [search, lyricsDetails]);

  // 2. Focus search input when search button is clicked (FIX: inputRef am TextField ergänzt)
  useEffect(() => {
    if (searchShown && searchInputRef.current !== null) {
      searchInputRef.current.focus();
    }
  }, [searchShown]);

  const lyricsState = useMemo(
    () => calculateLyricsState(lyricsDetails, smoothedProgressMs, syncEnabled),
    [lyricsDetails, smoothedProgressMs, syncEnabled]
  );

  // 3. Automatically scroll to highlighted text ONLY when the highlighted line changes
  useEffect(() => {
    const element = highlightedRef.current;
    if (syncEnabled && element !== null && lyricsState.highlighted !== "") {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [syncEnabled, lyricsState.highlighted]); // Abhängigkeit auf highlighted reduziert!

  const onUserSearch = (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setSearch(event.currentTarget.value ?? "");
  const toggleSearchShown = () => setSearchShown(s => !s);
  const toggleSyncEnabled = () => setSyncEnabled(s => !s);

  return (
    <div className={classes.root}>
      <Toolbar className={classes.toolbar}>
        {searchShown ? (
          <Box mb={1}>
            <TextField
              inputRef={searchInputRef} // FIX: Ref hier gebunden!
              variant="outlined"
              value={search}
              onChange={onUserSearch}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={toggleSearchShown} edge="end">
                      <CloseIcon />
                    </IconButton>
                  </InputAdornment>
                )
              }}
              label="Search"
              placeholder="Search lyrics you heard to find your position..."
              style={{ width: "100%", maxWidth: 600 }}
            />
          </Box>
        ) : (
          <IconButton onClick={toggleSearchShown}>
            <SearchIcon fontSize="small" />
          </IconButton>
        )}
        <IconButton onClick={toggleSyncEnabled} disabled={!isSyncingPossible}>
          {syncEnabled ? <SyncEnabledIcon /> : <SyncDisabledIcon />}
        </IconButton>
      </Toolbar>
      <div>
        <Typography component="div" className={classes.lyrics} ref={lyricsRef} id="lyrics-main">
          <span id="lyrics-passed">{lyricsState.before}</span>

          {lyricsState.highlighted !== "" && (
            <div className={classes.highlightedLyricsWrapper}>
              <span className={classes.highlightedLyrics} ref={highlightedRef} id="lyrics-current">
                {lyricsState.highlighted}
              </span>
            </div>
          )}

          <span id="lyrics-upcoming">{lyricsState.after}</span>
        </Typography>
        <Box mt={2} textAlign="left">
          <Typography id="lyrics-provider">
            <Link href={lyricsDetails.attribution} target="_blank" rel="noopener noreferrer">
              Lyrics for {lyricsDetails.title} by {lyricsDetails.artist}
            </Link>
          </Typography>
        </Box>
      </div>
    </div>
  );
};

// Effiziente Berechnung des Songtext-Status
const calculateLyricsState = (
  lyricsDetails: IFoundLyrics,
  progressMs: number,
  syncEnabled: boolean
) => {
  const synced = lyricsDetails.syncedLyrics as any[];

  // Helper, um den Zeilentext unabhängig vom Key (text oder content) auszulesen
  const getText = (line: any) => line?.text ?? line?.content ?? "";

  // Wenn keine synchronisierten Lyrics vorhanden oder Sync deaktiviert ist
  if (!synced || synced.length === 0 || !syncEnabled) {
    return {
      before: "",
      highlighted: "",
      after: lyricsDetails.plainLyrics ?? ""
    };
  }

  const progressSeconds = progressMs / 1000;

  let currentIndex = -1;
  for (let i = 0; i < synced.length; i++) {
    if (synced[i].timestamp <= progressSeconds) {
      currentIndex = i;
    } else {
      break;
    }
  }

  if (currentIndex === -1) {
    return {
      before: "",
      highlighted: "",
      after: synced.map(getText).join(" \n ")
    };
  }

  const before = synced.slice(0, currentIndex).map(getText).join(" \n ");
  const highlighted = getText(synced[currentIndex]);
  const after = synced.slice(currentIndex + 1).map(getText).join(" \n ");

  return { before, highlighted, after };
};

const useStyles = makeStyles(theme => ({
  lyrics: {
    whiteSpace: "pre-wrap"
  },
  highlightedLyricsWrapper: {
    marginTop: 20,
    marginBottom: 20
  },
  highlightedLyrics: {
    padding: "0.1em 0",
    whiteSpace: "pre-wrap",
    fontWeight: "bolder",
    fontSize: "5em",
    [theme.breakpoints.down("xs")]: {
      fontSize: "3em"
    }
  },
  root: {
    margin: "auto",
    maxWidth: 700,
    position: "relative",
    textAlign: "center"
  },
  toolbar: {
    padding: 0,
    margin: "-6px -6px 0 0",
    position: "fixed",
    right: 60,
    top: 75
  }
}));

export default LyricsDisplay;
