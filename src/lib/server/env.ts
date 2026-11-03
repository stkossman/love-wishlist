export function getServerEnv(name: string): string | undefined {
  // Vercel and Bun supply runtime values. Astro's .env fallback is local-only
  // so production credentials are never captured from the build environment.
  return process.env[name] ?? (import.meta.env.DEV ? import.meta.env[name] : undefined);
}
