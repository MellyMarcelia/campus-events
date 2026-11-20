import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../mcp/mcpServer.mjs';

// HTTP in/out for MCP ("Streamable HTTP" transport). Stateless: every POST gets a fresh server
// and transport, so there are no sessions to keep in memory and any API instance can answer.
// enableJsonResponse: plain JSON answers instead of a stream, which every proxy passes through.
export function createMcpController(services) {
  return {
    async handle(req, res) {
      const server = createMcpServer(services);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    },

    // Without sessions there is no server-to-client stream (GET) and nothing to end (DELETE).
    methodNotAllowed(req, res) {
      res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: use POST' }, id: null });
    }
  };
}
