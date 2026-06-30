import { lazy } from 'react'
import type { PageRegistryFragment } from './types'

const WorkflowsPage = lazy(() => import('../workflows/WorkflowsPage'))

export const skillsPageRegistry: PageRegistryFragment = {
  skills: WorkflowsPage
}
