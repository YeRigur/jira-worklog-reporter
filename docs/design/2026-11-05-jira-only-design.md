# Jira only: no CSV, and the Columns pages on Jira's fields

Date: 2026-11-05 · Status: implemented

## Decision

The page exports from Jira through the Worklogs bridge only. The CSV path —
upload, Copy JQL and month split, the Overview, Authors, "left out by the
filter", file notes and the period page — is gone from the product.

## What stays, and where

- Sections: Export · Columns · Preview · Project groups · Settings.
- Columns reuses the CSV-era pages (all, pick, search, empty) on Jira's data:
  - the model is Jira's field list (`/rest/api/3/field` → `jiraModel`);
  - after Start one sample search (≤100 of the people's issues in the period,
    project group applied, `fields=*all`) gives "filled in N of M" and an
    example per field (`src/core/coverage.js`); no worklogs are read yet;
  - bindings are per site, as before; `csv:<name>` from older files maps to
    the Jira field of that name;
  - the Export page shows one line: "N of M found in Jira", Check columns,
    Build Excel. Worklogs are read on Build Excel only.
- The CSV parser, dataset and Jira emulator moved to `tests/support/fake-jira/`:
  test and `?demo` infrastructure, not product.
- Settings files keep their format. `people` (old CSV author keys) is still
  read; its accountIds join `accounts` when finding people.

## Removed

`src/core/{people,filter-jql,worklog-stats}.js`, `src/config/defaults.js`,
`src/ui/pages/{main,start,authors,notes,outside,period}.js`,
`tools/{run-page,ui-snapshot}.js`, and their tests.
