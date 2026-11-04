import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccounts } from '../src/core/accounts.js';

const jira = (byQuery, status = 200) => {
  const asked = [];
  const fetch = async (input) => {
    const q = new URL(String(input), 'https://acme.atlassian.net').searchParams.get('query');
    asked.push(q);
    return new Response(JSON.stringify(byQuery[q] || []), { status });
  };
  return { fetch, asked };
};

test('the user whose email matches is taken; known ones are not asked again', async () => {
  const { fetch, asked } = jira({
    'a@x.com': [{ accountId: 'id-other', accountType: 'atlassian', emailAddress: 'aa@x.com', displayName: 'Aa' },
      { accountId: 'id-a', accountType: 'atlassian', emailAddress: 'A@x.com', displayName: 'Testenko,Olena' }]
  });
  const r = await resolveAccounts(fetch, ['A@x.com', 'k@x.com'], { 'k@x.com': 'id-k' });
  assert.deepEqual(r.accounts, { 'a@x.com': 'id-a', 'k@x.com': 'id-k' });
  assert.deepEqual(r.meta, { 'id-a': { displayName: 'Testenko,Olena', email: 'a@x.com' }, 'id-k': { displayName: '', email: 'k@x.com' } });
  assert.deepEqual(asked, ['a@x.com']);
  assert.deepEqual([r.missing, r.guessed], [[], []]);
});

test('a single user with a hidden email is taken and marked as a guess', async () => {
  const { fetch } = jira({ 'b@x.com': [{ accountId: 'id-b', accountType: 'atlassian', displayName: 'Probenko,Ivan' }] });
  const r = await resolveAccounts(fetch, ['b@x.com'], {});
  assert.deepEqual(r.accounts, { 'b@x.com': 'id-b' });
  assert.deepEqual(r.guessed, ['b@x.com']);
});

test('nobody, several hidden candidates, or only apps — not found', async () => {
  const { fetch } = jira({
    'c@x.com': [{ accountId: '1', accountType: 'atlassian' }, { accountId: '2', accountType: 'atlassian' }],
    'd@x.com': [{ accountId: 'bot', accountType: 'app', displayName: 'Bot' }]
  });
  const r = await resolveAccounts(fetch, ['c@x.com', 'd@x.com', 'e@x.com'], {});
  assert.deepEqual(r.accounts, {});
  assert.deepEqual(r.missing, ['c@x.com', 'd@x.com', 'e@x.com']);
});

test('signed out of Jira is an error of its own', async () => {
  const { fetch } = jira({}, 401);
  await assert.rejects(resolveAccounts(fetch, ['a@x.com'], {}), (e) => e.code === 'signed-out');
});
