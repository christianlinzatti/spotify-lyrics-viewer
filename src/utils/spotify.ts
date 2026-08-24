import { Request } from "express";

export function isStoredTokenValid(req: Request): boolean {
  // 1. Sichere Prüfung: Ist req.session vorhanden?
  if (!req.session) {
    return false;
  }

  const { access_token, expires_at } = req.session;

  // 2. Prüfen, ob die Token-Daten existieren
  if (!access_token || !expires_at) {
    return false;
  }

  // 3. Prüfen, ob das Token abgelaufen ist
  if (new Date(expires_at).getTime() < Date.now()) {
    delete req.session.access_token;
    delete req.session.expires_at;
    delete req.session.refresh_token;
    return false;
  }

  return true;
}