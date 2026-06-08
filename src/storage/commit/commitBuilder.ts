import { encryptContent, type CEK } from '../crypto/cryptoBox'
import type { Page } from '../repo/types'

export interface EventTemplateLike {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

export interface BuildPatchOptions {
  page: Page
  repoId: string
  cek: CEK
  createdAt: number
}

export function buildPatchEventTemplate(options: BuildPatchOptions): EventTemplateLike {
  const { page, repoId, cek, createdAt } = options
  const ciphertext = encryptContent(JSON.stringify(page), cek)

  return {
    kind: 1617,
    created_at: createdAt,
    tags: [
      ['a', `30617:${repoId}`],
      ['file', `pages/${page.id}.json`],
    ],
    content: ciphertext,
  }
}
