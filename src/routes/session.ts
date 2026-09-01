import express from "express";

export const subRoute = "/api/session";
const router = express.Router();

router.get("/", (req, res) => {
  if (process.env.NODE_ENV === "development") {
    return res.json(req.session || {});
  }
  return res.status(403).send("Forbidden");
});

router.delete("/", (req, res) => {
  if (!req.session) {
    return res.status(200).json({ success: true });
  }

  // Für express-session: Session zerstören statt req.session = null
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to clear session" });
    }
    res.clearCookie("connect.sid"); // Session-Cookie im Browser löschen
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