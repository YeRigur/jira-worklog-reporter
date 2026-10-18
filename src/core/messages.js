// The export's error messages talk about Jira, developer selection and its ↻
// button; in the converter the data is a CSV and every author is exported,
// so the known ones are reworded.

const NO_WORKLOGS_IN_PERIOD = 'No worklogs in the chosen period in this CSV. Check the period.';

const RULES = [
  [/^No worklogs found on\/after (\S+) anywhere you can see/,
    (m) => `No worklogs on/after ${m[1]} in this CSV. Check the period, or export the CSV for these dates.`],
  [/^Worklogs exist after \S+, but none were logged by the/, () => NO_WORKLOGS_IN_PERIOD],
  [/^Found \d+ issues with worklogs in range, but none were logged by the selected developers/, () => NO_WORKLOGS_IN_PERIOD],
  [/^Search returns no issues at all/, () => 'This CSV has no issues.'],
  [/^Jira search API returned an error/, () => 'The CSV couldn’t be read — details are in the browser console.'],
  [/^Pick at least one developer\.$/, () => 'This CSV has no worklogs.']
];

export function rewriteExportMessage(message) {
  const text = String(message ?? '');
  for (const [re, reword] of RULES) {
    const m = re.exec(text);
    if (m) return reword(m);
  }
  return text;
}

