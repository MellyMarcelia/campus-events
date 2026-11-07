import nodemailer from 'nodemailer';

// Real mail via any SMTP provider (Brevo, Mailtrap, Gmail, Ethereal, ...), configured with one URL:
// smtp://user:pass@host:587  or  smtps://user:pass@host:465
export function createSmtpMailer({ url, from, timeoutMs }) {
  const transporter = nodemailer.createTransport({
    url,
    // Nodemailer's defaults wait up to 2 minutes to connect and 10 minutes on a silent socket.
    // We'd rather fail fast and log it: the registration is already saved anyway.
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs
  });

  return {
    async send({ to, subject, text }) {
      await transporter.sendMail({ from, to, subject, text });
    }
  };
}
