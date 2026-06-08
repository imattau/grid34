export interface Block {
  id: string
  type: string
  parentBlockId: string | null
  order: number
  content: Record<string, unknown>
  updatedAt: number
}

export interface Page {
  id: string
  title: string
  parentId: string | null
  order: number
  blocks: Block[]
  updatedAt: number
  icon?: string
  deleted?: boolean
}

export interface PageTreeState {
  pages: Record<string, Page>
}

export interface Patch {
  id: string
  pageId: string
  page: Page
  createdAt: number
}
