# Jira Worklogs Export

A small web page that makes the worklogs Excel report straight from Jira —
the same file the SimpleLife Chrome extension makes.

Everything happens in your browser. The page itself is not allowed to connect
to any server: it reads Jira through your own Jira tab, with a bookmark (the
*Worklogs bridge*), using your own sign-in.

## How to use it

1. **Open the page.** Go to the site (GitHub Pages) — it is a single page,
   `index.html`.
2. **Load your team settings** (first time only). Click *Load file* (step 1) and
   pick `worklogs-settings-<site>.json` (for example `worklogs-settings-acme.json`). Ask your team lead for this file. The browser
   remembers it, so you only do this once.
3. **Choose the period.** By default it is last month.
4. **Tick the people** and check the Jira site (it comes from the settings
   file). People are listed by team group (Teams assignments, else the email's
   domain); the ones your team's filter names are ticked at first. Add someone
   with *Add* if they are missing — then save the settings file to pass it on.
   *Separate report* next to a group downloads an Excel with only that group,
   without touching the main one.
5. **Pick a project group** if you want one (step 5, when the settings have
   project groups): Jira is then asked for those projects only, which is much
   quicker, and the file is named after the group.
6. **Press Start.** Jira opens in a new tab. The first time, drag the
   *Worklogs bridge* button to your bookmarks bar (it is under *First time?*).
   In the Jira tab, click that bookmark: the Jira page is blurred behind a card
   that shows how far the export is, and says when the tab can be closed.
7. **Check the columns.** Each column of the report and the Jira field it comes
   from; the ones attached in the settings are already filled in. Pick a field
   or *Leave empty* for the rest, then press **Build Excel** — only then are the
   worklogs read.
8. **Fix what the page asks about**, if anything: people not found in Jira,
   projects without a group.
9. **Click *Download Excel*.** Use *Preview* first if you want to see the rows.

The bookmark is a plain relay: it answers this page only, makes only GET
requests to Jira's REST API (`/rest/api/3/…`), same-site with your sign-in,
and never writes anything. The page itself still connects to nothing. Which
calls the page sends, the timeouts and the bookmark's words are all in
`src/config/jira-bridge.js`; the bookmark is built from it. It doesn't change
when the page changes — only a new `protocol` there asks you to drag it again. A
bookmark dragged from one address (say `localhost`) only answers that address,
so the GitHub Pages page needs its own.

## The settings file

The page itself contains no names or emails. All team data lives in
`worklogs-settings-<site>.json` (for example `worklogs-settings-acme.json`):

- the team roster (emails),
- the Jira site,
- the Jira accounts found for the emails (filled in by the page),
- team groups and project groups,
- who is ticked at first (`defaultPeople`; an older file's JQL filter still works),
- columns you mapped by hand, per Jira site.

Edit it on the *Settings* page — a plain form: the site, the people (group,
ticked at first), groups by email domain, project groups. Save it with *Save
settings file* and share it only with your team.
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
src/config/       public defaults: the column list (catalog.js) and the bridge (jira-bridge.js)
src/vendor/       the extension's own export code, unchanged
src/core/         the logic: the bridge, accounts, columns, coverage, periods, settings
src/app/          page state, settings storage, the run through the bridge, building the Excel
src/ui/           what is drawn on screen; one file per screen in ui/pages/
src/dev/          the ?demo mode
tests/            automated tests; the sample data is made up, and tests/support/fake-jira
                  is a stand-in Jira over it (also used by ?demo)
tools/            helpers: a local server and a script to compare two Excel files
```

How it works in short: the bookmark in the Jira tab runs the page's read-only
REST calls with your sign-in and hands the answers back; the extension's own
export code asks those questions and builds the Excel. The preview and the
download are the same file.
