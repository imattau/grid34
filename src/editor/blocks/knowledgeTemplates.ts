export type KnowledgeTemplateKey = 'meeting-notes' | 'project-brief' | 'daily-log'

export interface KnowledgeTemplate {
  key: KnowledgeTemplateKey
  label: string
  description: string
  content: string
}

export const KNOWLEDGE_TEMPLATES: KnowledgeTemplate[] = [
  {
    key: 'meeting-notes',
    label: 'Meeting notes',
    description: 'Agenda, decisions, and next steps',
    content:
      '<h2>Meeting notes</h2><p><strong>Attendees</strong></p><ul><li></li></ul><p><strong>Decisions</strong></p><ul><li></li></ul><p><strong>Next steps</strong></p><ul><li></li></ul>',
  },
  {
    key: 'project-brief',
    label: 'Project brief',
    description: 'Scope, goals, and milestones',
    content:
      '<h2>Project brief</h2><p><strong>Goal</strong></p><p></p><p><strong>Scope</strong></p><ul><li></li></ul><p><strong>Milestones</strong></p><ul><li></li></ul>',
  },
  {
    key: 'daily-log',
    label: 'Daily log',
    description: 'Wins, blockers, and follow-ups',
    content:
      '<h2>Daily log</h2><p><strong>Wins</strong></p><ul><li></li></ul><p><strong>Blockers</strong></p><ul><li></li></ul><p><strong>Follow-ups</strong></p><ul><li></li></ul>',
  },
]

export function getKnowledgeTemplate(key: string | null | undefined): KnowledgeTemplate {
  const template = KNOWLEDGE_TEMPLATES.find((item) => item.key === key)
  return template ?? KNOWLEDGE_TEMPLATES[0]
}
