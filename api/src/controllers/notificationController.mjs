// Server-Sent Events: the browser opens ONE long-lived GET (new EventSource('/api/notifications'))
// and we write a message into it whenever something happens. One-way, plain HTTP, and the browser
// reconnects by itself: all we need for toasts, without a WebSocket library.
const HEARTBEAT_MS = 25_000;

export function createNotificationController(notificationService) {
  return {
    stream(req, res) {
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform', // no-transform: proxies must not buffer or compress it
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // same, for nginx-style proxies
      });
      res.flushHeaders();
      res.write('retry: 5000\n\n'); // after a dropped connection, the browser retries every 5 s

      const unsubscribe = notificationService.subscribe((notification) => {
        res.write(`event: ${notification.type}\ndata: ${JSON.stringify(notification)}\n\n`);
      });
      // A comment line every 25 s: proxies close connections that stay silent too long.
      const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

      // The tab was closed or lost its connection: stop writing to it, or listeners pile up.
      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    }
  };
}
