import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type {
  WorkflowSkillRecord,
  WorkflowSkillTaskRecord
} from '../../shared/workflows/skill-task-manifest'
import { getWorkflowsRoot, getWorkflowsStorePath } from './paths'

type WorkflowsStoreFile = {
  version: 1
  skills: WorkflowSkillRecord[]
  tasks: WorkflowSkillTaskRecord[]
}

function emptyStore(): WorkflowsStoreFile {
  return { version: 1, skills: [], tasks: [] }
}

function readStore(): WorkflowsStoreFile {
  const path = getWorkflowsStorePath()
  if (!existsSync(path)) {
    return emptyStore()
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as WorkflowsStoreFile
    if (parsed.version !== 1) {
      return emptyStore()
    }
    return {
      version: 1,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: WorkflowsStoreFile): void {
  mkdirSync(getWorkflowsRoot(), { recursive: true })
  writeFileSync(getWorkflowsStorePath(), JSON.stringify(store, null, 2), 'utf8')
}

export class WorkflowsStore {
  private data = readStore()

  listSkills(): WorkflowSkillRecord[] {
    return [...this.data.skills].sort((a, b) => a.name.localeCompare(b.name))
  }

  getSkill(skillId: string): WorkflowSkillRecord | null {
    return this.data.skills.find((skill) => skill.id === skillId) ?? null
  }

  upsertSkill(skill: WorkflowSkillRecord): WorkflowSkillRecord {
    const index = this.data.skills.findIndex((entry) => entry.id === skill.id)
    if (index >= 0) {
      this.data.skills[index] = skill
    } else {
      this.data.skills.push(skill)
    }
    writeStore(this.data)
    return skill
  }

  deleteSkill(skillId: string): boolean {
    const before = this.data.skills.length
    this.data.skills = this.data.skills.filter((skill) => skill.id !== skillId)
    this.data.tasks = this.data.tasks.filter((task) => task.skillId !== skillId)
    if (this.data.skills.length !== before) {
      writeStore(this.data)
      return true
    }
    return false
  }

  listTasks(): WorkflowSkillTaskRecord[] {
    return [...this.data.tasks].sort((a, b) => a.title.localeCompare(b.title))
  }

  getTask(taskId: string): WorkflowSkillTaskRecord | null {
    return this.data.tasks.find((task) => task.id === taskId) ?? null
  }

  upsertTask(task: WorkflowSkillTaskRecord): WorkflowSkillTaskRecord {
    const index = this.data.tasks.findIndex((entry) => entry.id === task.id)
    if (index >= 0) {
      this.data.tasks[index] = task
    } else {
      this.data.tasks.push(task)
    }
    writeStore(this.data)
    return task
  }

  deleteTask(taskId: string): boolean {
    const before = this.data.tasks.length
    this.data.tasks = this.data.tasks.filter((task) => task.id !== taskId)
    if (this.data.tasks.length !== before) {
      writeStore(this.data)
      return true
    }
    return false
  }
}

let singleton: WorkflowsStore | null = null

export function getWorkflowsStore(): WorkflowsStore {
  if (!singleton) {
    singleton = new WorkflowsStore()
  }
  return singleton
}

export function resetWorkflowsStoreForTests(): void {
  singleton = null
}
