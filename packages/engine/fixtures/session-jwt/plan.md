# Replace cookie sessions with JWT auth

1. Add `jsonwebtoken` as a dependency.
2. Issue a JWT at login in `src/auth/login.ts`, signed with `JWT_SECRET`, with a 30-day expiry.
3. Stop reading the session cookie in `src/auth/middleware.ts` and read the `Authorization: Bearer` header instead.
4. Drop the `sessions` table with a new migration, `migrations/0042_drop_sessions.sql`.
5. Update the web and mobile clients to send the header.
