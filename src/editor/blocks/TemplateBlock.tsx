import { useDraftStore } from '../contexts/storeContexts'
import type { BlockProps } from './ParagraphBlock'
import { RichTextBlock } from './RichTextBlock'
import { getKnowledgeTemplate, KNOWLEDGE_TEMPLATES, type KnowledgeTemplateKey } from './knowledgeTemplates'

export function TemplateBlock({
  block,
  pageId,
  onSplitBlock,
  onMergeWithPrevious,
  onOpenSlashMenu,
}: BlockProps) {
  const draftStore = useDraftStore()
  const templateKey = (block.content.templateKey as KnowledgeTemplateKey | undefined) ?? KNOWLEDGE_TEMPLATES[0].key
  const template = getKnowledgeTemplate(templateKey)

  function handleTemplateChange(nextTemplateKey: string) {
    const nextTemplate = getKnowledgeTemplate(nextTemplateKey)
    draftStore.stage(pageId, block.id, {
      ...block.content,
      templateKey: nextTemplate.key,
      richText: nextTemplate.content,
      text: nextTemplate.label,
    })
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white my-3 overflow-hidden shadow-sm dark:border-gray-800/80 dark:bg-gray-900/10">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950/20">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Template</div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{template.label}</div>
        </div>
        <select
          value={template.key}
          onChange={(event) => handleTemplateChange(event.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 outline-none focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-200"
          aria-label="Template preset"
        >
          {KNOWLEDGE_TEMPLATES.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <div className="px-3 py-2 dark:bg-gray-950/5">
        <RichTextBlock
          block={block}
          pageId={pageId}
          ariaLabel="Template content"
          placeholder="Template content..."
          className="w-full text-base leading-relaxed"
          enterBehavior="newline"
          onSplitBlock={onSplitBlock}
          onMergeWithPrevious={onMergeWithPrevious}
          onOpenSlashMenu={onOpenSlashMenu}
        />
      </div>
    </div>
  )
}
