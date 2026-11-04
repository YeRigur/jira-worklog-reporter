// The export's error messages talk about the extension's developer selection
// and its ↻ button; here they are reworded for the page.

const NO_WORKLOGS_IN_PERIOD = 'The ticked people logged no time in this period. Check the period, the people or the project group.';

const RULES = [
  [/^No worklogs found on\/after (\S+) anywhere you can see/,
    (m) => `Jira has no worklogs on/after ${m[1]} that you can see. Check the period, or that you are signed in to the right Jira.`],
  [/^Worklogs exist after \S+, but none were logged by the/, () => NO_WORKLOGS_IN_PERIOD],
  [/^Found \d+ issues with worklogs in range, but none were logged by the selected developers/, () => NO_WORKLOGS_IN_PERIOD],
  [/^Search returns no issues at all/, () => 'Jira returned no issues at all — are you signed in to it in the Jira tab?'],
  [/^Jira search API returned an error/, () => 'Jira’s search failed — sign in to Jira in that tab and press Start again. Details are in the browser console.'],
  [/^Pick at least one developer\.$/, () => 'None of the ticked people were found in this Jira.']
];

export function rewriteExportMessage(message) {
  const text = String(message ?? '');
  for (const [re, reword] of RULES) {
    const m = re.exec(text);
    if (m) return reword(m);
  }
  return text;
}
