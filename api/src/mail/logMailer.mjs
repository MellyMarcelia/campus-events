// Fallback when no SMTP_URL is configured: local development works without a mail account,
// and you can still see in the console which mail would have been sent.
export function createLogMailer(logger) {
  return {
    async send({ to, subject }) {
      logger.info('mail (not sent, no SMTP_URL configured)', { to, subject });
    }
  };
}
