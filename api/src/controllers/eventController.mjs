// Controllers translate HTTP ⇄ service calls and pick the status code. No rules here.
// Express 5 forwards rejected promises to the error handler, so no try/catch is needed.
export function createEventController(eventService) {
  return {
    async list(req, res) {
      res.json(await eventService.list());
    },

    async get(req, res) {
      res.json(await eventService.getDetail(req.validated.params.id));
    },

    async create(req, res) {
      const event = await eventService.create(req.validated.body);
      res.status(201).location(`/api/events/${event.id}`).json(event);
    },

    async update(req, res) {
      res.json(await eventService.update(req.validated.params.id, req.validated.body));
    },

    async remove(req, res) {
      await eventService.remove(req.validated.params.id);
      res.status(204).send();
    }
  };
}
