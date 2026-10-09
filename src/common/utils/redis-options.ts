import type { RedisOptions } from 'ioredis';

/**
 * Redis connection options from env. Prefers REDIS_URL (Railway / Upstash style,
 * e.g. redis://default:password@host:port, or rediss:// for TLS); otherwise
 * falls back to REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_USERNAME.
 */
export function redisOptions(env: NodeJS.ProcessEnv = process.env): RedisOptions {
  const url = env.REDIS_URL?.trim();
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
      // Railway private networking is IPv6-only
      family: 0,
    };
  }
  return {
    host: env.REDIS_HOST || 'localhost',
    port: parseInt(env.REDIS_PORT || '6379', 10),
    username: env.REDIS_USERNAME || undefined,
    password: env.REDIS_PASSWORD || undefined,
    family: 0,
  };
}
