---
name: notion-budget-summary
description: Summarize total verified spending for a calendar month from the Notion budget database.
---

# Monthly spending summary

Read-only. Do not mutate Notion.

## Scope

- **Rows:** status is `Verified` only (ignore Uploaded and everything else).
- **Total:** sum of amount for matching rows. No category breakdown.
- **Month:** current calendar month in local time unless Captain passed `month=YYYY-MM`.

## Prerequisites

- Integration profile `notion.budget` connected in Orca.

## Steps

1. Run `node monthly-summary.ts --precheck --profile notion.budget`
2. Run `node monthly-summary.ts --profile notion.budget` (add `--month YYYY-MM` when Captain specified `month=` in the turn).
3. Write `reports/{runId}/summary.md` (short prose + total) and `result.json` (`monthly-summary/v1` schema).
4. If the month is still in progress, say so in the summary (partial month).

Use `orca integration request --profile notion.budget` for Notion reads. Do not put tokens in env or prompts.
