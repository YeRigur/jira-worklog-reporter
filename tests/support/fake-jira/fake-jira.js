// A stand-in for the Worklogs bridge, for ?demo and the tests: the CSV
// emulator answers search and worklogs, and this adds the user search and the
// field list Jira mode asks for. Same shape as openBridge()'s result.
import { createJiraEmulator } from './emulator.js';

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

export function createFakeJira({ dataset, authors, people, site = dataset.site || 'acme.atlassian.net' }) {
  const origin = `https://${site}`;
  const emulator = createJiraEmulator({ dataset, authors, origin });
  const nameOf = (id) => dataset.model.fields.find((f) => f.id === id)?.name || id;
  async function fetch(input, init = {}) {
    const url = new URL(String(input), origin);
    if (url.pathname === '/rest/api/3/field') {
      return json(Object.keys(dataset.model.specs).map((id) => ({ id, name: nameOf(id), custom: /^(customfield_|csv:)/.test(id) })));
    }
    if (url.pathname === '/rest/api/3/user/search') {
      const q = String(url.searchParams.get('query') || '').toLowerCase();
      return json(people.filter((p) => String(p.emailAddress).toLowerCase() === q).map((p) => ({ accountType: 'atlassian', ...p })));
    }
    return emulator(url.toString(), init);
  }
  const statuses = [];
  return { site, ready: Promise.resolve({ site }), fetch, status: (s) => statuses.push(s), statuses, close() {}, closed: false };
}
