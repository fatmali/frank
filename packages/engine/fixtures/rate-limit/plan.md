# Add rate limiting to the public API

## Context
A few API clients send bursts that slow everyone else down. We want a per-key
limit on public endpoints.

## Plan
1. Add `express-rate-limit` and `rate-limit-redis` as dependencies.
2. Use Redis to share counters across instances, configured with `REDIS_URL`.
3. Create `src/middleware/rateLimit.ts` exporting a limiter: 100 requests per minute per API key.
4. Apply the limiter to every route in `src/server.ts`.
5. Return 429 with a `Retry-After` header when the limit is hit.
6. Add tests in `test/rateLimit.test.ts`.
