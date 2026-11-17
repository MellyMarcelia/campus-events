// Names of the messages that travel through the broker. One place, so a typo can't make a
// publisher and a consumer talk past each other.
export const topics = Object.freeze({
  confirmationMail: 'mail.confirmation'
});
