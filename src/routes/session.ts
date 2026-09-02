import express from "express";

export const subRoute = "/api/session";
const router = express.Router();

router.get("/", (req: any, res: any) => {
  if (process.env.NODE_ENV === "development") {
    return res.json(req.session || {});
  }
  return res.status(403).send("Forbidden");
});

router.delete("/", (req: any, res: any) => {
  if (!req.session) {
    return res.status(200).json({ success: true });
  }

  const cookieName = process.env.SESSION_COOKIE_NAME || "connect.sid";

  req.session.destroy((err: any) => {
    if (err) {
      console.error("Session destroy error:", err);
      return res.status(500).json({ error: "Failed to clear session" });
    }

    // Cookie explizit mit Pfad & SameSite/Secure-Optionen löschen
    res.clearCookie(cookieName, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    });

    return res.json({ success: true });
  });
});

export default function handler(req: any, res: any) {
  return router(req, res, (err?: any) => {
    if (err) {
      console.error("Express Router Error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
}