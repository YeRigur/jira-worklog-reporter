// Answers a request it has seen from memory. In Jira mode the first preview
// asks Jira; the Summary toggle, the download and a restart after a closed tab
// replay what is kept. Only 200s are kept — a failure is asked again.

const answer = ({ status, text }) => new Response(text, { status, headers: { 'Content-Type': 'application/json' } });

export function createFetchCache(backend) {
  const kept = new Map();
  async function cached(input, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    const url = String(input);
    const body = init.body == null ? '' : String(init.body);
    const key = JSON.stringify([method, url, body]);
    if (kept.has(key)) return answer(kept.get(key));
    const res = await backend(input, init);
    if (res.status !== 200) return res;
    const entry = { method, url, body, status: 200, text: await res.text() };
    kept.set(key, entry);
    return answer(entry);
  }
  cached.clear = () => kept.clear();
  cached.entries = () => [...kept.values()];
  return cached;
}
