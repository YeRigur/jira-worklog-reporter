// Everything the page knows at a moment. One object, changed in place by the
// actions in this folder; the UI redraws from it.
import { previousMonth } from '../core/period.js';
import { emptySettings } from '../core/settings.js';

// Jira mode's run, before anything happened.
export const freshJira = () => ({ phase: 'idle', message: '', slow: false, missing: [], guessed: [], report: '', reportNote: null, done: false });

export function createState() {
  const range = previousMonth();
  return {
    // the report: the period, the Jira site (typed; else the settings file's), the Summary sheet
    from: range.from, to: range.to, site: '', withSummary: null,
    // the roster emails ticked; null means the team filter's people (or everyone)
    picked: null,
    // one project group only ('' = all projects)
    projectGroup: '',
    // the run through the bridge, and the bookmark panel
    jira: freshJira(), bridgeOpen: false, progress: '', progressPct: 0, busy: false, result: null,
    // columns attached by hand for this site, and the ones gone without
    bindings: {}, skipped: [],
    // the workbook built for the preview — the same one the download hands over
    preview: null, previewing: null, previewSheet: 0,
    savedSig: '', savedAs: '',
    // which page the card shows, and what those pages are on
    page: 'main', pickKeys: [], searchFor: '', searchQuery: '', searchPick: '', searchBack: 'pick', emptyOk: false,
    // the team's settings file
    settings: emptySettings(), settingsName: '', settingsRev: 0, settingsNote: null
  };
}
