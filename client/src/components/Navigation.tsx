import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import DarkModeIcon from "@mui/icons-material/Brightness4";
import LightModeIcon from "@mui/icons-material/Brightness7";
import GitHubIcon from "@mui/icons-material/GitHub";
import {
  AppBar,
  Avatar,
  Box,
  Container,
  IconButton,
  Link as MuiLink,
  Toolbar,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import BannerImageDark from "../img/banner-dark.png";
import BannerImage from "../img/banner.png";
import LogoImage from "../img/logo.png";

const navbarLinks: { [key: string]: string } = {
  "/": "Home",
  "/about": "About"
};

interface IProps {
  user: SpotifyApi.UserObjectPrivate | null;
  onLogout: () => void;
  onThemeToggle: () => void;
  isDarkMode: boolean;
}

const Navigation: React.FunctionComponent<IProps> = ({
  user,
  onLogout,
  onThemeToggle,
  isDarkMode
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();

  const showFullLogo = useMediaQuery(theme.breakpoints.up("sm"));

  const onUserIconClick = () => {
    if (user === null) {
      navigate("/spotify-authorization");
    } else {
      const answer = window.confirm("Are you sure you want to logout?");
      if (answer) {
        onLogout();
      }
    }
  };

  return (
    <AppBar
      position="static"
      sx={{
        backgroundColor: "background.paper",
        boxShadow: "none"
      }}
    >
      <Container maxWidth="md">
        <Toolbar sx={{ padding: 0 }}>
          <MuiLink component={RouterLink} to="/" sx={{ display: "flex", alignItems: "center" }}>
            {showFullLogo ? (
              <Box
                component="img"
                src={isDarkMode ? BannerImageDark : BannerImage}
                sx={{ height: 30, cursor: "pointer" }}
                alt="Spotify Lyrics Viewer Banner"
              />
            ) : (
              <Box
                component="img"
                src={LogoImage}
                sx={{ height: 30, cursor: "pointer" }}
                alt="Spotify Lyrics Viewer Logo"
              />
            )}
          </MuiLink>

          {Object.keys(navbarLinks).map(path => {
            const isActive = location.pathname === path;
            return (
              <Box key={path} sx={{ display: "inline", ml: 2 }}>
                <MuiLink
                  component={RouterLink}
                  to={path}
                  underline="none"
                  sx={{
                    textDecoration: "none",
                    color: isActive ? "text.primary" : "text.secondary",
                    "&:hover": {
                      color: "text.primary"
                    }
                  }}
                >
                  <Typography variant="body1" component="span">
                    {navbarLinks[path]}
                  </Typography>
                </MuiLink>
              </Box>
            );
          })}

          {/* Spacer, um die Navigations-Icons nach rechts zu schieben */}
          <Box sx={{ flexGrow: 1 }} />

          <MuiLink
            href="https://github.com/brentvollebregt/spotify-lyrics-viewer"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconButton>
              <GitHubIcon />
            </IconButton>
          </MuiLink>

          <IconButton onClick={onThemeToggle}>
            {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          <IconButton onClick={onUserIconClick}>
            {user !== null ? (
              <Avatar
                alt={user.display_name + " Logo"}
                src={
                  user.images !== undefined && user.images.length > 0
                    ? user.images[0].url
                    : undefined
                }
                sx={{ width: 30, height: 30 }}
              >
                {user.display_name?.substring(0, 1)}
              </Avatar>
            ) : (
              <AccountCircleIcon />
            )}
          </IconButton>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default Navigation;