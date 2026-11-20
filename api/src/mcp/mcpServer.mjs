import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AppError } from '../errors/AppError.mjs';
import { registrationSchema } from '../validation/schemas.mjs';

// MCP = Model Context Protocol: lets an AI assistant call "tools" on this API.
// The tools are a thin layer over the SAME services the REST controllers use, so every rule
// (capacity, the seat lock, duplicate check, confirmation mail via the outbox) applies here too.

// The fields an assistant needs to answer questions and pick an event id. No registrations:
// who registered is not something to hand out.
const toSummary = ({ id, title, description, location, startsAt, capacity }) => ({ id, title, description, location, startsAt, capacity });

const textResult = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

// Expected problems (event full, unknown id, already registered) go back to the assistant as a
// readable tool error it can explain to the user. Anything else is a real bug: let it throw.
function asToolError(err) {
  if (err instanceof AppError) return { isError: true, content: [{ type: 'text', text: err.message }] };
  throw err;
}

export function createMcpServer({ events, registrations }) {
  const server = new McpServer({ name: 'campus-events', version: '1.0.0' });

  server.registerTool('list_events', {
    title: 'List campus events',
    description: 'Lists campus events. Use when = "upcoming" for events that have not started yet (soonest first), '
      + '"past" for events that already started (most recent first), or "all". '
      + 'Optionally filter on a word from the title. Returns each event with its id, needed to register.',
    inputSchema: {
      when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
      search: z.string().trim().min(1).optional().describe('Only events whose title contains this text (case-insensitive)')
    },
    annotations: { readOnlyHint: true }
  }, async ({ when, search }) => {
    const byWhen = { upcoming: events.listUpcoming, past: events.listPast, all: events.list };
    let found = await byWhen[when]();
    if (search) found = found.filter((event) => event.title.toLowerCase().includes(search.toLowerCase()));
    return textResult(found.map(toSummary));
  });

  server.registerTool('register_for_event', {
    title: 'Register for an event',
    description: 'Registers ONE person for an event; they get a confirmation mail. To register several people '
      + '(e.g. "me and Sam"), call this once per person. Needs the event id (look it up with list_events) and the '
      + 'name and email of each person: ask the user for any you do not know, never invent an email address.',
    inputSchema: { eventId: z.number().int().positive(), ...registrationSchema.shape }
  }, async ({ eventId, name, email }) => {
    try {
      const registration = await registrations.register(eventId, { name, email });
      const event = await events.getById(eventId);
      return textResult(`Registered ${registration.name} (${registration.email}) for "${event.title}" `
        + `on ${new Date(event.startsAt).toISOString()}. Registration id ${registration.id}. A confirmation mail is on its way.`);
    } catch (err) {
      return asToolError(err);
    }
  });

  return server;
}
