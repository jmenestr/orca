---
name: notion-budget-verify
description: Verify uploaded Notion budget expenses against manual entries.
---

# Notion budget verify

## Prerequisites

- Integration profile `notion.budget` connected in Settings.

## Steps

1. Run `node verify-uploaded.ts --precheck --profile notion.budget`
2. Dry run, then apply auto_verify bucket only.
3. Write `reports/{runId}/summary.md` and `result.json`.
4. Stop if `needs_review` is non-empty.

Use `orca integration request --profile notion.budget --method GET --path /databases/$DATABASE_ID/query` for Notion reads.

Do not put tokens in env or prompts.
