// The export's error messages talk about the extension's developer selection
// and its ↻ button; here they are reworded for the page (src/config/texts.js).
import { messages } from '../config/texts.js';

const RULES = [
  [/^No worklogs found on\/after (\S+) anywhere you can see/, (m) => messages.noWorklogsAfter(m[1])],
  [/^Worklogs exist after \S+, but none were logged by the/, () => messages.noWorklogs],
  [/^Found \d+ issues with worklogs in range, but none were logged by the selected developers/, () => messages.noWorklogs],
  [/^Search returns no issues at all/, () => messages.noIssues],
  [/^Jira search API returned an error/, () => messages.searchFailed],
  [/^Pick at least one developer\.$/, () => messages.nobodyPicked]
];

export function rewriteExportMessage(message) {
  const text = String(message ?? '');
  for (const [re, reword] of RULES) {
    const m = re.exec(text);
    if (m) return reword(m);
  }
  return text;
}
