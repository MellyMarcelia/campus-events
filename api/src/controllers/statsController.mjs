export function createStatsController(statsService) {
  return {
    async get(req, res) {
      res.json(await statsService.getStats());
    }
  };
}
