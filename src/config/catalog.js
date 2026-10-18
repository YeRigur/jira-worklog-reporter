// The public part of the extension's scripts.json: the Jira export's columns
// and defaults. No people, projects or groups — those come from the team's
// settings file.

export const catalog = {
  "projectGroups": {
    "_comment": "Empty on purpose: each team sets Jira project key → group in its settings file (projectGroups)."
  },
  "teams": {
    "_comment": "Empty on purpose: people, groups and projects come from the team settings file (roster, teams, groupByDomain)."
  },
  "scripts": [
    {
      "id": "jira-worklogs-export",
      "name": "Jira Worklogs Export",
      "description": "Exports worklogs.xlsx for the chosen period (all projects by default), attributing hours to the developer who logged them (worklog author).",
      "files": [
        "lib/xlsx-writer.js",
        "scripts/worklogs-export.js"
      ],
      "hosts": [
        "*.atlassian.net"
      ],
      "settings": [
        {
          "id": "dateFrom",
          "label": "From date",
          "type": "date",
          "default": "2025-08-14",
          "hint": "Worklogs dated on or after this day."
        },
        {
          "id": "dateTo",
          "label": "To date (optional)",
          "type": "date",
          "default": "",
          "hint": "Leave empty for \"until now\"."
        },
        {
          "id": "users",
          "label": "Developers (worklog authors)",
          "type": "checkboxes",
          "searchable": true,
          "syncAction": "users",
          "liveSearch": true,
          "domainFilter": true,
          "teamFilter": true,
          "rosterPanel": false,
          "domainFilterAllow": [],
          "defaultByDomain": [],
          "default": [],
          "defaultByEmailRoster": "team",
          "options": [],
          "hint": "The list is loaded from Jira (display name + email) when this window opens; ↻ reloads it. Anyone missing can be pulled in by typing their name or email in the filter box. Checked by default: the team roster."
        },
        {
          "id": "sheets",
          "label": "Sheets in the workbook",
          "type": "checkboxes",
          "tab": "fields",
          "default": [
            "summary",
            "details"
          ],
          "options": [
            {
              "value": "summary",
              "label": "Jira Summary — one row per issue, using the columns picked below"
            },
            {
              "value": "details",
              "label": "Jira Details — one row per worklog (issue, developer, hours, date)"
            }
          ],
          "hint": "Both sheets by default. With Summary on, the picked columns go there and Details stays a clean worklog log; with Summary off they are appended to Details instead."
        },
        {
          "id": "exportFields",
          "label": "Columns to export (Summary sheet)",
          "type": "checkboxes",
          "tab": "fields",
          "searchable": true,
          "orderable": true,
          "syncAction": "fields",
          "default": [
            "issuetype",
            "_issueKey",
            "summary",
            "assignee",
            "_developer",
            "_authorEmail",
            "_developerGroup",
            "status",
            "created",
            "updated",
            "resolutiondate",
            "customfield_10084",
            "customfield_10186",
            "_originalEstimateHours",
            "_timeSpentHours",
            "_estimationDeviation",
            "priority",
            "_projectGroup",
            "_projectKey",
            "_projectName",
            "_projectUrl",
            "_parentSummary"
          ],
          "defaultByLabel": [
            "Difficulty",
            "Exception Reason",
            "Root cause",
            "Unknown",
            "Volume",
            "Client Complexity",
            "Return Rate counter",
            "Satisfaction"
          ],
          "options": [
            {
              "value": "_issueKey",
              "label": "Issue key"
            },
            {
              "value": "issuetype",
              "label": "Work type"
            },
            {
              "value": "summary",
              "label": "Summary"
            },
            {
              "value": "_developer",
              "label": "Person"
            },
            {
              "value": "_authorEmail",
              "label": "Person email"
            },
            {
              "value": "_developerGroup",
              "label": "Person group"
            },
            {
              "value": "_developerJobTitle",
              "label": "Person job title"
            },
            {
              "value": "_developerProject",
              "label": "Person project"
            },
            {
              "value": "_developerDepartment",
              "label": "Person department"
            },
            {
              "value": "_developerLocation",
              "label": "Person location"
            },
            {
              "value": "_developerHours",
              "label": "Worklog hours"
            },
            {
              "value": "assignee",
              "label": "Assignee"
            },
            {
              "value": "status",
              "label": "Status"
            },
            {
              "value": "created",
              "label": "Created"
            },
            {
              "value": "updated",
              "label": "Updated"
            },
            {
              "value": "resolutiondate",
              "label": "Resolved"
            },
            {
              "value": "customfield_10084",
              "label": "Complexity Levels"
            },
            {
              "value": "customfield_10186",
              "label": "Pick Up Time"
            },
            {
              "value": "_originalEstimateHours",
              "label": "Original estimate (hours)"
            },
            {
              "value": "_timeSpentHours",
              "label": "Time Spent (hours)"
            },
            {
              "value": "_estimationDeviation",
              "label": "Estimation deviation"
            },
            {
              "value": "priority",
              "label": "Priority"
            },
            {
              "value": "_projectGroup",
              "label": "Project group"
            },
            {
              "value": "_projectKey",
              "label": "Project key"
            },
            {
              "value": "_projectName",
              "label": "Project name"
            },
            {
              "value": "_projectUrl",
              "label": "Project url"
            },
            {
              "value": "_parentSummary",
              "label": "Parent Summary"
            }
          ],
          "hint": "All Jira fields are loaded; default selection matches the original Summary columns. Drag rows in \"Column order\" to set the left-to-right order of the Summary sheet; the preview below shows the result."
        }
      ]
    }
  ]
};
