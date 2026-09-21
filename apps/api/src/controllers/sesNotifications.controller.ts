import { asyncHandler } from '../lib/asyncHandler.js';
import { env } from '../config/env.js';
import { badRequest, forbidden, serviceUnavailable } from '../lib/errors.js';
import { isTrustedSnsUrl, parseSnsMessage, verifySnsMessage } from '../lib/sns.js';
import { handleSesNotification } from '../services/emailEvents.service.js';

/**
 * Public endpoint Amazon SNS posts SES bounce/complaint notifications to. It has
 * no session, so the only thing standing between it and the internet is the
 * message signature plus the expected topic ARN — both are checked before
 * anything is acted on.
 */
export const receive = asyncHandler(async (req, res) => {
  const expectedTopic = env.SES_SNS_TOPIC_ARN;
  if (!expectedTopic) throw serviceUnavailable('SES notifications are not configured');

  // SNS posts `text/plain`, which the route parses as a string; a JSON content
  // type has already been parsed into an object by the app-wide body parser.
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw badRequest('Body is not valid JSON');
    }
  }

  const msg = parseSnsMessage(raw);
  if (!msg) throw badRequest('Not an SNS message');
  if (msg.TopicArn !== expectedTopic) throw forbidden('Unexpected topic');
  if (!(await verifySnsMessage(msg))) throw forbidden('Invalid signature');

  if (msg.Type === 'SubscriptionConfirmation') {
    // Visiting SubscribeURL is how the topic owner (us) proves the endpoint is real.
    if (!isTrustedSnsUrl(msg.SubscribeURL)) throw badRequest('Untrusted SubscribeURL');
    const confirm = await fetch(msg.SubscribeURL!, { signal: AbortSignal.timeout(5000) });
    if (!confirm.ok) throw serviceUnavailable('Could not confirm the SNS subscription');
    req.log?.info({ topic: msg.TopicArn }, '[ses] SNS subscription confirmed');
  } else if (msg.Type === 'Notification') {
    await handleSesNotification(msg.Message);
  }

  res.json({ ok: true as const });
});
