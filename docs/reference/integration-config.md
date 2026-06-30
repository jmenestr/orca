# Integration config

Orca stores workflow integration credentials in `~/.orca/integration-config/` and exposes them through Settings, RPC, and CLI.

## Profiles

Each profile declares public config fields and secret fields.

| Profile | Purpose |
|---------|---------|
| `notion.budget` | Notion integration token, expenses database id, and property mapping for chore scripts |

### notion.budget fields

| Field | Kind | Notes |
|-------|------|-------|
| `token` | secret | Notion integration token |
| `databaseId` | config | Expenses database id |
| `statusProperty` | config | Notion status column name (default: Status) |
| `verifiedStatusValue` | config | Value meaning verified (default: Verified) |
| `amountProperty` | config | Amount column name |
| `dateProperty` | config | Date column name |

Public env at dispatch uses `ORCA_INTEGRATION_NOTION_BUDGET__*` for each config field.

## Secret access

Secrets never enter dispatch env or Conductor envelopes by default.

Scripts should call:

```bash
orca integration request --profile notion.budget --method GET --path /databases/<id>
```

For run-scoped access, start a session first:

```bash
orca integration session start --profile notion.budget --run-id <run-id>
```

Public config fields are injected as env vars such as `ORCA_INTEGRATION_NOTION_BUDGET__DATABASE_ID`.

## Adding profile #2

1. Add field definitions and validate/request handlers under `src/main/integration-config/profiles/`.
2. Register the profile in `src/main/integration-config/registry.ts`.
3. Add a Settings card under Integrations.
4. Document the profile id here.

Keep provider HTTP behind `integration.request` so agents never handle raw tokens.
