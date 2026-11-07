export function createHealthService({ health }) {
  return {
    async check() {
      await health.ping();
      return { status: 'ok' };
    }
  };
}
