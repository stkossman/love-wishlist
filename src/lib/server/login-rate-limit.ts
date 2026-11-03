const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CLIENTS = 1000;

// A per-instance backstop; production also needs the shared Vercel WAF rule in SECURITY.md.
export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; expires: number }>();

  consume(client: string, now = Date.now()): number {
    for (const [key, value] of this.attempts) {
      if (value.expires <= now) this.attempts.delete(key);
    }

    let attempt = this.attempts.get(client);
    if (!attempt) {
      if (this.attempts.size >= MAX_CLIENTS) return Math.ceil(WINDOW_MS / 1000);
      attempt = { count: 0, expires: now + WINDOW_MS };
      this.attempts.set(client, attempt);
    }
    if (attempt.count >= MAX_ATTEMPTS) return Math.ceil((attempt.expires - now) / 1000);
    attempt.count++;
    return 0;
  }
}

export const loginRateLimiter = new LoginRateLimiter();
