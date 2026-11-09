import { logger } from '../lib/logger.mjs';
import { confirmationMail } from './registrationService.mjs';

// Retries confirmation mails that failed at registration time (see registrationService).
// No timer in here: server.mjs calls runOnce() every MAIL_RETRY_INTERVAL_MS, tests just call it directly.
export function createMailRetryService({ pendingMails, mailer, maxAttempts }) {
  let running = false;

  async function retry(pending) {
    const attempts = pending.attempts + 1;
    const context = { registrationId: pending.registrationId, attempts, maxAttempts };
    try {
      await mailer.send(confirmationMail(pending.event, pending.registration));
      // If this delete fails, the next run sends the mail again: a duplicate, never a lost mail.
      await pendingMails.remove(pending.id);
      logger.info('confirmation mail sent on retry', context);
      return true;
    } catch (err) {
      await pendingMails.update(pending.id, { attempts, lastError: err.message });
      if (attempts >= maxAttempts) logger.error('confirmation mail failed for good, giving up', { ...context, error: err.message });
      else logger.warn('confirmation mail retry failed', { ...context, error: err.message });
      return false;
    }
  }

  return {
    // Returns { sent, failed }, or { skipped: true } while the previous run is still busy
    // (a slow provider can make one run take longer than the interval).
    async runOnce() {
      if (running) return { skipped: true };
      running = true;
      try {
        const due = await pendingMails.findRetryable(maxAttempts);
        let sent = 0;
        // One by one on purpose: no burst of mails on a provider that just came back.
        for (const pending of due) {
          if (await retry(pending)) sent += 1;
        }
        return { sent, failed: due.length - sent };
      } finally {
        running = false;
      }
    }
  };
}
