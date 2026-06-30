import type {
  IntegrationConfigField,
  IntegrationConfigValidateResult
} from '../../../shared/integration-config/types'

export const NOTION_BUDGET_PROFILE_ID = 'notion.budget'

export const NOTION_BUDGET_FIELDS: IntegrationConfigField[] = [
  {
    id: 'token',
    label: 'Integration token',
    kind: 'secret',
    required: true
  },
  {
    id: 'databaseId',
    label: 'Database ID',
    kind: 'config',
    required: true,
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  },
  {
    id: 'statusProperty',
    label: 'Status property name',
    kind: 'config',
    placeholder: 'Status'
  },
  {
    id: 'verifiedStatusValue',
    label: 'Verified status value',
    kind: 'config',
    placeholder: 'Verified'
  },
  {
    id: 'amountProperty',
    label: 'Amount property name',
    kind: 'config',
    placeholder: 'Amount'
  },
  {
    id: 'dateProperty',
    label: 'Date property name',
    kind: 'config',
    placeholder: 'Date'
  }
]

export async function validateNotionBudgetConnection(args: {
  token: string
  databaseId: string
}): Promise<IntegrationConfigValidateResult> {
  const { token, databaseId } = args
  if (!token.trim()) {
    return { ok: false, error: 'Integration token is required.' }
  }
  if (!databaseId.trim()) {
    return { ok: false, error: 'Database ID is required.' }
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId.trim()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Notion-Version': '2022-06-28'
      }
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      return {
        ok: false,
        error: body?.message ?? `Notion API returned ${response.status}.`
      }
    }
    const body = (await response.json()) as { title?: { plain_text?: string }[] }
    const title = body.title?.map((part) => part.plain_text ?? '').join('') ?? 'Database'
    return { ok: true, details: { title } }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not reach Notion.'
    }
  }
}

export async function notionBudgetRequest(args: {
  token: string
  method: string
  path: string
  body?: unknown
  headers?: Record<string, string>
}): Promise<{ status: number; body: unknown }> {
  const url = args.path.startsWith('http')
    ? args.path
    : `https://api.notion.com/v1${args.path.startsWith('/') ? args.path : `/${args.path}`}`
  const response = await fetch(url, {
    method: args.method.toUpperCase(),
    headers: {
      Authorization: `Bearer ${args.token}`,
      'Notion-Version': '2022-06-28',
      ...(args.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...args.headers
    },
    body: args.body !== undefined ? JSON.stringify(args.body) : undefined
  })
  const text = await response.text()
  let body: unknown = text
  try {
    body = text.length > 0 ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body }
}
