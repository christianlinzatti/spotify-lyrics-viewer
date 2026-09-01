import green from "@mui/material/colors/green";
import { createTheme } from "@mui/material/styles";

const getTheme = (isDark: boolean) => {
  if (isDark) {
    return createTheme({
      palette: {
        mode: "dark",
        primary: {
          main: green[500]
        }
      }
    });
  } else {
    return createTheme({
      palette: {
        mode: "light",
        primary: {
          main: green[800]
        }
      }
    });
  }
};

export default getTheme;
