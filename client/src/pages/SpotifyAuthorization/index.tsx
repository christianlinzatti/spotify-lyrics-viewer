import { Box, CircularProgress, Typography } from "@material-ui/core";
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Config from "../../config";

interface IProps {
  onNewToken: (accessToken: string, expiresIn: number) => void;
}

const SpotifyAuthorization: React.FC<IProps> = ({ onNewToken }) => {
  const navigate = useNavigate();
  const { search } = window.location;

  const params = new URLSearchParams(search.substring(1));
  const accessToken = params.get("access_token");
  const expiresAt = params.get("expires_at");

  useEffect(() => {
    if (search === "") {
      // Kein Token in der URL: Weiterleitung zur Spotify-Authentifizierung
      window.location.href = Config.api.root + Config.api.spotify_authentication_route;
    } else if (accessToken !== null && expiresAt !== null) {
      // Token vorhanden: Speichern und zur Homepage navigieren
      onNewToken(accessToken, parseInt(expiresAt, 10));
      navigate("/", { replace: true });
    }
  }, [search, accessToken, expiresAt, onNewToken, navigate]);

  let message = <></>;

  if (search === "") {
    message = (
      <>
        <Box mb={2}>
          <Typography variant="subtitle1">Redirecting...</Typography>
        </Box>
        <CircularProgress size={30} />
      </>
    );
  } else if (accessToken !== null && expiresAt !== null) {
    message = <Typography variant="subtitle1">Token received</Typography>;
  } else {
    message = <Typography variant="subtitle1">Incorrect URL parameters</Typography>;
  }

  return (
    <>
      <Typography variant="h4" align="center">
        Spotify Authorization
      </Typography>
      <Box alignItems="center" textAlign="center" mt={2}>
        {message}
      </Box>
    </>
  );
};

export default SpotifyAuthorization;