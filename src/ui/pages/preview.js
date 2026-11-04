// The workbook as it will be saved.
import { previewTable } from '../preview-table.js';
import { hints } from '../../config/texts.js';

export function previewPage(app) {
  const { pageHead, hint, actions, doneButton } = app;
  return [pageHead('Preview'),
    hint(hints.preview),
    previewTable(app),
    actions(doneButton('Back'))];
}
