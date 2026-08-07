import dotenv from "dotenv";
dotenv.config(); // Setup .env

import cookieSession from "cookie-session";
import express from "express";
import fs from "fs";
import https from "https";
import path from "path";
import Config from "./config";
import LyricsRoutes, { subRoute as lyricsSubRoute } from "./routes/lyrics";
import SessionRoutes, { subRoute as sessionSubRoute } from "./routes/session";
import SpotifyRoutes, { subRoute as spotifySubRoute } from "./routes/spotify";

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  if (reason instanceof Error) {
    console.error(reason.stack);
  }
});

const app = express();
const isProduction = app.get("env") === "production";

// Wichtig für Vercel Reverse Proxy
app.set("trust proxy", 1);

app.use(express.json());

// Session - lax ist stabil für Same-Domain OAuth auf Vercel
app.use(
  cookieSession({
    name: "session",
    keys: Config.server.session_keys,
    maxAge: 48 * 60 * 60 * 1000, // 48h
    sameSite: "lax",
    secure: isProduction // Nur in Production zwingend HTTPS
  })
);

// CORS Middleware (sauberes Matching ohne Pfad-Fehler)
app.use((req, res, next) => {
  const rawOrigin = req.get("origin") ?? req.get("referrer");
  let originDomain = rawOrigin;

  if (rawOrigin) {
    try {
      // Extrahiere nur Protokoll + Hostname (ohne Pfade)
      originDomain = new URL(rawOrigin).origin;
    } catch {
      originDomain = rawOrigin;
    }
  }

  if (originDomain && Config.server.allowed_origins.includes(originDomain)) {
    res.header("Access-Control-Allow-Origin", originDomain);
  }

  res.header("Access-Control-Max-Age", "600");
  res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// API Endpoints
app.use(sessionSubRoute, SessionRoutes);
app.use(spotifySubRoute, SpotifyRoutes);
app.use(lyricsSubRoute, LyricsRoutes);

// Statische Dateien nur lokal servieren (auf Vercel übernimmt das vercel.json / CDN)
if (!isProduction) {
  const clientBuildDirectory = path.join(__dirname, Config.client.relative_build_directory);
  app.use(express.static(clientBuildDirectory));
  
  Config.client.routes.forEach(route =>
    app.get(route, (req, res) => {
      res.sendFile(path.join(clientBuildDirectory, "index.html"));
    })
  );

  const port = process.env.PORT || 5000;
  https
    .createServer(
      {
        cert: fs.readFileSync("server.cert"),
        key: fs.readFileSync("server.key")
      },
      app
    )
    .listen(port, () => {
      console.log(`Listening on ${port} with HTTPS`);
    });
}

export default app;
