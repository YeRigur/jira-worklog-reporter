# Jira Worklogs Export

A small web page that turns a Jira CSV export into the worklogs Excel report —
the same file the SimpleLife Chrome extension makes.

Everything happens in your browser. The file you upload is never sent anywhere:
the page is not allowed to connect to any server.

## How to use it

1. **Open the page.** Go to the site (GitHub Pages) — it is a single page,
   `index.html`.
2. **Load your team settings** (first time only). Click *Load settings file* and
   pick `worklogs-settings.json`. Ask your team lead for this file. The browser
   remembers it, so you only do this once.
3. **Choose the period.** By default it is last month. If you pick several
   months, export one CSV per month (Jira gives at most 1000 issues per file).
4. **Get the CSV from Jira.**
   - Click *Copy JQL* and paste it into Jira's issue search (or open your
     team's saved filter).
   - Choose **⋯ → Export → CSV (all fields)**. Do not use "Current fields" —
     it leaves the worklogs out.
5. **Upload the CSV.** Drag it onto the page or click *Browse files*. You can
   upload several files at once; duplicates are merged.
6. **Fix what the page asks about**, if anything:
   - *Columns aren't in this CSV* — pick a column from your file for each one,
     or skip them.
   - *Projects without a group* — type a group name for each project.
   - *Authors show as "Unknown"* — follow the steps to look them up in Jira.
7. **Click *Download Excel*.** Use *Preview* first if you want to see the rows.

## The settings file

The page itself contains no names or emails. All team data lives in
`worklogs-settings.json`:

- the team roster (emails),
- team groups and project groups,
- the team's JQL filter,
- people found for old Jira accounts,
- columns you mapped by hand.

Save it with *Settings → Save settings file* and share it only with your team.
**Never put it in this repository** (`.gitignore` already blocks it).

## Try it without real data

Open the page with `?demo` at the end of the address, for example
`https://<user>.github.io/<repo>/?demo`. A panel at the bottom lets you step
through every screen with made-up data. Nothing you do there is saved.

## Publish on GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. In the repository: **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**. Branch: **main**, folder: **/ (root)**.
   Save.
4. After a minute the site is at `https://<user>.github.io/<repo>/`.

`index.html` is the start page. All links are relative, so the site works
from any address. The `.nojekyll` file makes GitHub serve the files as they are.

## Run it on your computer

The page uses JavaScript modules, so double-clicking `index.html` will not
work. Start the small local server instead (needs Python 3):

```bash
npm run serve
```

Then open <http://localhost:8000>.

## For developers

Run the tests (needs Node.js 22 or newer, no installs required):

```bash
npm test
```

Folder layout:

```
index.html        the page
styles/           theme.css (colours, fonts), base.css (layout, components), dev.css (demo panel)
src/main.js       starts the page
src/config/       public defaults: the column list and the default JQL
src/vendor/       the extension's own export code, unchanged
src/core/         the logic: reading the CSV, dates, columns, people, periods
src/app/          page state, settings storage, building the Excel
src/ui/           what is drawn on screen; one file per screen in ui/pages/
src/dev/          the ?demo mode
tests/            automated tests; the sample data is made up
tools/            helpers: a local server and scripts to compare Excel files
```

How it works in short: the CSV is read into memory, a small stand-in for the
Jira API answers the questions the extension's export code asks, and that
code builds the Excel. The preview and the download are the same file.
