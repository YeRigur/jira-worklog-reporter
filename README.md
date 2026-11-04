# Jira Worklogs Export

A small web page that turns a Jira CSV export into the worklogs Excel report —
the same file the SimpleLife Chrome extension makes.

Everything happens in your browser. The file you upload is never sent anywhere:
the page is not allowed to connect to any server.

## How to use it

1. **Open the page.** Go to the site (GitHub Pages) — it is a single page,
   `index.html`.
2. **Load your team settings** (first time only). Click *Load settings file* and
   pick `worklogs-settings-<site>.json` (for example `worklogs-settings-nbslvivws.json`). Ask your team lead for this file. The browser
   remembers it, so you only do this once.
3. **Choose the period.** By default it is last month.
4. **Tick the people** and check the Jira site (it comes from the settings
   file). People are listed by team group (Teams assignments, else the email's
   domain); the ones your team's filter names are ticked at first. Add someone
   with *Add* if they are missing — then save the settings file to pass it on.
   *Separate report* next to a group downloads an Excel with only that group,
   without touching the main one.
5. **Press Start.** Jira opens in a new tab. The first time, drag the
   *Worklogs bridge* button to your bookmarks bar (it is under *First time?*).
   In the Jira tab, click that bookmark. The page then reads the worklogs from
   Jira through that tab, with your own Jira sign-in.
6. **Fix what the page asks about**, if anything: people not found in Jira,
   projects without a group.
7. **Click *Download Excel*.** Use *Preview* first if you want to see the rows.

The bookmark only reads from Jira (searches, worklogs, users, the field list)
and only answers this page. The page itself still connects to nothing. A
bookmark dragged from one address (say `localhost`) only answers that address,
so the GitHub Pages page needs its own.

**No bookmark?** *Or upload a CSV* gives the old way: copy the JQL, export
**⋯ → Export → CSV (all fields)** from Jira (one file per month) and drop the
file on the page.

## The settings file

The page itself contains no names or emails. All team data lives in
`worklogs-settings-<site>.json` (for example `worklogs-settings-nbslvivws.json`):

- the team roster (emails),
- the Jira site,
- the Jira accounts found for the emails (filled in by the page),
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
