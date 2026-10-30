// Explicit offset keeps the launch instant identical across visitor time zones.
export const launchAt = '2027-01-25T00:00:00-03:00';

export function getLaunchCountdown(now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(launchAt) - now) / 1000));
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
    reached: seconds === 0,
  };
}
