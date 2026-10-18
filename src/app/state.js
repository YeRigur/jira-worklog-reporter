// Everything the page knows at a moment. One object, changed in place by the
// actions in this folder; the UI redraws from it.
import { previousMonth } from '../core/period.js';
import { emptySettings } from '../core/settings.js';

export function createState() {
  const range = previousMonth();
  return {
    // the CSV
    files: [], dataset: null, error: null, datePattern: '',
    // the report
    from: range.from, to: range.to, site: '', withSummary: null,
    // months whose JQL was copied, to tick them off ("from|to")
    copiedMonths: [], monthPick: '',
    // columns attached by hand, and the ones gone without
    bindings: {}, skipped: [],
    // the workbook built for the preview — the same one the download hands over
    preview: null, previewing: null, previewSheet: 0,
    savedSig: '', savedAs: '',
    // which page the card shows, and what those pages are on
    page: 'main', pickKeys: [], searchFor: '', searchQuery: '', searchPick: '', searchBack: 'pick', emptyOk: false,
    busy: false, progress: '', result: null,
    // the team's settings file
    settings: emptySettings(), settingsRev: 0, settingsNote: null, lookupText: ''
  };
}
