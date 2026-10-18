// The workbook as it will be saved.
import { previewTable } from '../preview-table.js';

export function previewPage(app) {
  const { pageHead, hint, actions, doneButton } = app;
  return [pageHead('Preview'),
    hint('The first rows of each sheet, exactly as they will appear in the Excel.'),
    previewTable(app),
    actions(doneButton('Back'))];
}
