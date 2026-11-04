// Who the roster's emails are in Jira. Jira Cloud searches work by accountId;
// emails are often hidden, so each email is looked up once through the bridge
// and the answer kept in the settings file.

import { messages } from '../config/texts.js';

const lower = (s) => String(s || '').trim().toLowerCase();

export async function resolveAccounts(fetch, emails, known = {}) {
  const accounts = {};
  const meta = {};
  const missing = [];
  const guessed = [];
  for (const email of [...new Set(emails.map(lower))]) {
    if (known[email]) {
      accounts[email] = known[email];
      meta[known[email]] ??= { displayName: '', email };
      continue;
    }
    const res = await fetch(`/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=10`);
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(messages.signedOut), { code: 'signed-out' });
    }
    if (!res.ok) { missing.push(email); continue; }
    const users = (await res.json()).filter((u) => u && u.accountId && u.accountType !== 'app');
    const exact = users.find((u) => lower(u.emailAddress) === email);
    const pick = exact || (users.length === 1 && !users[0].emailAddress ? users[0] : null);
    if (!pick) { missing.push(email); continue; }
    if (!exact) guessed.push(email);
    accounts[email] = pick.accountId;
    meta[pick.accountId] = { displayName: pick.displayName || '', email };
  }
  return { accounts, meta, missing, guessed };
}
