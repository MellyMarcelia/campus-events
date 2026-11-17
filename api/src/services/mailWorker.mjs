import { logger } from '../lib/logger.mjs';
import { topics } from '../messaging/topics.mjs';

// Sends the confirmation mails that arrive through the broker. If mailer.send() throws, the
// handler throws too, and the broker hands the message back after a delay: no attempt limit,
// so the mail goes out as soon as the provider works again.
export function createMailWorker({ broker, mailer }) {
  return {
    start() {
      return broker.consume(topics.confirmationMail, async ({ registrationId, mail }) => {
        await mailer.send(mail);
        logger.info('confirmation mail sent', { registrationId });
      });
    }
  };
}
