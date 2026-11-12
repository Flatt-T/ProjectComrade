// Transactional email through Amazon SES (PW25 notifications).
//
// The service deliberately carries no AWS SDK (see cognito.ts), so SendEmail is
// a hand-rolled SigV4-signed POST to the SES v2 JSON API. The channel stays
// inert until COMRADE_SES_FROM plus AWS credentials are configured; callers
// treat a missing config as 'skipped', never an error.
import { createHash, createHmac } from 'node:crypto';
import { ses } from '../config.js';
import { log } from '../ops.js';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** SigV4-signed SES v2 SendEmail. Throws on transport or API failure. */
export async function sendSesEmail(args: {
  to: string; subject: string; text: string;
}): Promise<void> {
  const region = ses.region();
  const { amzDate, dateStamp } = amzDates();
  const body = JSON.stringify({
    FromEmailAddress: ses.fromName() ? `"${ses.fromName()}" <${ses.fromAddress()}>` : ses.fromAddress(),
    Destination: { ToAddresses: [args.to] },
    Content: {
      Simple: {
        Subject: { Data: args.subject, Charset: 'UTF-8' },
        Body: { Text: { Data: args.text, Charset: 'UTF-8' } },
      },
    },
  });
  const host = `email.${region}.amazonaws.com`;
  const payloadHash = sha256(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'POST', '/v2/email/outbound-emails', '', canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${process.env.AWS_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 'ses');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${scope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}/v2/email/outbound-emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'X-Amz-Content-SHA256': payloadHash,
      Authorization: authorization,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    log('ses-send-failed', { status: response.status, detail });
    throw new Error(`SES ${response.status}: ${detail}`);
  }
}
