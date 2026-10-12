/**
 * Parses the compact duration strings used for token/session lifetimes
 * ("30m", "7d", "3600s"). A bare number is treated as seconds, matching
 * jsonwebtoken's own `expiresIn` convention, so the cookie lifetime and the
 * JWT lifetime cannot drift apart.
 */
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Unsupported duration: "${value}". Use e.g. "900s", "30m", "12h", "7d".`);
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = UNIT_MS[unit];
  if (!multiplier) {
    throw new Error(`Unsupported duration unit in "${value}".`);
  }
  return amount * multiplier;
}
