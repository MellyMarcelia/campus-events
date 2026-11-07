export function createHealthController(healthService) {
  return {
    async get(req, res) {
      res.status(200).json(await healthService.check());
    }
  };
}
