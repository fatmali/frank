import { getSession } from './sessions';

export async function requireUser(req, res, next) {
  const sid = req.cookies['sid'];
  const session = sid && (await getSession(sid));
  if (!session) return res.status(401).end();
  req.user = session.user;
  // Admins can revoke a session instantly from the dashboard.
  next();
}
