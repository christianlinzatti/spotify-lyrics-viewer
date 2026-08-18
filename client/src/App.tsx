import { Box, Container, CssBaseline, ThemeProvider } from "@material-ui/core";
import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { deleteSession, spotifyGetCurrentToken } from "./api";
import MetaTags from "./components/MetaTags";
import Navigation from "./components/Navigation";
import Player from "./components/Player";
import useCurrentlyPlayingSong from "./hooks/useCurrentlyPlayingSong";
import useLyrics from "./hooks/useLyrics";
import useThemeState from "./hooks/useThemeState";
import useTokenRefresh from "./hooks/useTokenRefresh";
import useUser from "./hooks/useUser";
import About from "./pages/About";
import LyricsView from "./pages/LyricsView";
import NotFound from "./pages/NotFound";
import SpotifyAuthorization from "./pages/SpotifyAuthorization";
import { IToken } from "./types/token";

const App: React.FC = () => {
  const [token, setToken] = useState<IToken | null>(null);

  const onNewToken = (accessToken: string, expiresAt: number) => {
    setToken({ expiry: new Date(expiresAt), value: accessToken } as IToken);
  };

  const clearToken = () => {
    setToken(null);
    deleteSession();
  };

  const user = useUser(token, clearToken);
  useTokenRefresh(token, onNewToken, clearToken);
  const currentlyPlayingSong = useCurrentlyPlayingSong(token, clearToken);
  const lyrics = useLyrics(currentlyPlayingSong);
  const { theme, toggleTheme, darkModeEnabled } = useThemeState();

  // Request for a token on load to see if data is already in the state
  useEffect(() => {
    spotifyGetCurrentToken().then(newToken => {
      if (newToken !== null) {
        onNewToken(newToken.access_token, newToken.expires_at);
      }
    });
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100%" }}>
        <Navigation
          user={user}
          onLogout={clearToken}
          onThemeToggle={toggleTheme}
          isDarkMode={darkModeEnabled}
        />

        <Box py={3} style={{ overflow: "auto" }}>
          <Container maxWidth="md">
            <Routes>
              <Route
                path="/"
                element={
                  <MetaTags
                    route="/"
                    description="View the lyrics of the current song playing on your Spotify account in your browser."
                  >
                    <LyricsView user={user} currentlyPlayingSong={currentlyPlayingSong} lyrics={lyrics} />
                  </MetaTags>
                }
              />
              <Route
                path="/about"
                element={
                  <MetaTags
                    route="/about"
                    titlePrefix="About - "
                    description="Spotify Lyrics Viewer is a tool that allows you to view the lyrics of the current playing song on Spotify."
                  >
                    <About />
                  </MetaTags>
                }
              />
              {/* Redirect für Trailing Slash (/about/ -> /about) */}
              <Route path="/about/" element={<Navigate to="/about" replace />} />

              <Route path="/spotify-authorization" element={<SpotifyAuthorization onNewToken={onNewToken} />} />
              <Route path="/spotify-authorization/" element={<SpotifyAuthorization onNewToken={onNewToken} />} />

              {/* Catch-All für 404 Not Found */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Container>
        </Box>

        <Player currentlyPlayingSong={currentlyPlayingSong} token={token} />
      </div>
    </ThemeProvider>
  );
};

export default App;