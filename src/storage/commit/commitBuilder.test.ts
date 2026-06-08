import { describe, expect, it } from 'vitest'
import { buildPatchEventTemplate } from './commitBuilder'
import { decryptContent, generateCEK } from '../crypto/cryptoBox'
import type { Page } from '../repo/types'

describe('buildPatchEventTemplate', () => {
  it('produces a kind 1617 NIP-34 patch event template with encrypted content', () => {
    const cek = generateCEK()
    const page: Page = {
      id: 'page-1',
      title: 'My Page',
      parentId: null,
      order: 0,
      updatedAt: 1234,
      blocks: [],
    }

    const template = buildPatchEventTemplate({
      page,
      repoId: 'workspace-repo',
      cek,
      createdAt: 5000,
    })

    expect(template.kind).toBe(1617)
    expect(template.created_at).toBe(5000)
    expect(template.tags).toContainEqual(['a', '30617:workspace-repo'])
    expect(template.tags).toContainEqual(['file', 'pages/page-1.json'])
    expect(template.content).not.toContain('My Page')
    expect(JSON.parse(decryptContent(template.content, cek))).toEqual(page)
  })
})
