import { promises as dns } from 'node:dns';
import { badRequest } from './errors.js';

/**
 * Mailboxes that exist for mail-system administration, not for people signing up.
 * AWS flags these explicitly: they're a favourite way to sabotage a sender's
 * reputation, since anyone can register `abuse@victim.com`.
 */
const ROLE_LOCAL_PARTS = new Set([
  'postmaster',
  'abuse',
  'noc',
  'hostmaster',
  'webmaster',
  'mailer-daemon',
  'root',
  'spam',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
]);

export function isRoleAddress(email: string): boolean {
  const local = email.slice(0, email.lastIndexOf('@')).toLowerCase();
  return ROLE_LOCAL_PARTS.has(local);
}

/** The slice of `dns.promises` we use, so tests can stub DNS. */
export interface MailResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

const DNS_TIMEOUT_MS = 3000;

/** True only for "this name has no such record" — anything else (timeout, SERVFAIL) is inconclusive. */
const isNoRecord = (err: unknown) =>
  ['ENODATA', 'ENOTFOUND'].includes((err as { code?: string } | null)?.code ?? '');

class Inconclusive extends Error {}

async function lookup<T>(run: Promise<T>): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Inconclusive('dns timeout')), DNS_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    if (isNoRecord(err)) return null;
    throw new Inconclusive(String(err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether `domain` can receive mail: it has a real MX record, or (RFC 5321
 * implicit MX) an A/AAAA record. A "null MX" (`.`) explicitly says it can't.
 * Fails open — if DNS itself is down or slow we don't block a signup for it.
 */
export async function domainCanReceiveMail(domain: string, resolver: MailResolver = dns): Promise<boolean> {
  try {
    const mx = await lookup(resolver.resolveMx(domain));
    if (mx?.length) return mx.some((m) => m.exchange && m.exchange !== '.');
    if ((await lookup(resolver.resolve4(domain)))?.length) return true;
    return Boolean((await lookup(resolver.resolve6(domain)))?.length);
  } catch {
    return true;
  }
}

/** Reject addresses we shouldn't send account mail to. Throws a 400 `badRequest`. */
export async function assertDeliverableEmail(
  email: string,
  opts: { checkDns?: boolean; resolver?: MailResolver } = {},
): Promise<void> {
  if (isRoleAddress(email)) {
    throw badRequest('Please use a personal email address, not a shared or system mailbox');
  }
  if (opts.checkDns !== false) {
    const domain = email.slice(email.lastIndexOf('@') + 1);
    if (!(await domainCanReceiveMail(domain, opts.resolver))) {
      throw badRequest("That email domain doesn't appear to accept mail. Check the address for typos");
    }
  }
}
