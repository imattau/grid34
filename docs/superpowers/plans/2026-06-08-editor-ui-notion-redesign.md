# Grid34 Editor UI — Notion-Feel Redesign Plan

## Objective
Implement a visually polished, highly interactive, and accessible Notion-like user experience for the Grid34 block editor while preserving the underlying local-first storage architecture (`DraftStore` boundaries, patch reduction, and block-level conflicts).

## Strategy
1. **Styling Foundation**: Introduce Tailwind CSS project-wide. Set up design tokens for typography, spacing, neutral/accent colors, and hover transitions.
2. **Rich Text Editing**: Replace basic input fields in `ParagraphBlock`, `HeadingBlock`, and `ListBlock` with custom Tiptap/ProseMirror editors. Keep editors scoped per block to maintain block-level last-write-wins synchronization.
3. **Cross-Block Logic**: Implement block splitting (Enter key) and block merging (Backspace key at start of block) using parent-coordinated callbacks (`onSplitBlock`, `onMergeWithPrevious`) in `PageEditor`.
4. **Slash Command Command Menu**: Add a filterable `SlashMenu` component anchored to the cursor when typing `/` in an empty block, facilitating easy type-conversion.
5. **Drag-and-Drop & Chrome**: Wrap each block in a `BlockChrome` component offering hover handles and action menus. Use `@dnd-kit` to handle accessible drag-to-reorder, updating the fractional `order` on drop.
6. **Page Tree CRUD & Redesign**: Implement `createPage`, `renamePage`, and `deletePage` mutations inside `DraftStore`. Upgrade `PageTree` and `PageNode` with collapsible state, customizable icons (`page.icon`), and hover CRUD triggers.

---

## Tasks

### 1. Research & Audit
- [x] **Task 1.1: Audit Existing Blocks & Flow**: Locate exact file positions and integration hooks for `PageTree`, `PageEditor`, block components, and `DraftStore` staging loops.
- [x] **Task 1.2: Verify Dependency Compatibility**: Check if `@tiptap/react`, `@tiptap/starter-kit`, `@dnd-kit/core`, `@dnd-kit/sortable`, and standard styling libraries are fully compatible with Vite/Vitest config.

### 2. Styling Foundation & Infrastructure
- [x] **Task 2.1: Dependency Installation**: Install Tailwind CSS, PostCSS, Autoprefixer, Tiptap packages, and `@dnd-kit` suite.
- [x] **Task 2.2: Configure Tailwind CSS**: Create `tailwind.config.ts` and set up `src/index.css` with base rules, utility imports, and essential components styling using `@apply`.
- [x] **Task 2.3: Layout Restructuring**: Adjust the global layout to a premium document feel (persistent left sidebar + padded, centered main workspace).

### 3. Core Rich Text Blocks & Slash Command Menu
- [x] **Task 3.1: Reusable RichTextBlock Component**: Implement a shared wrapper using Tiptap `useEditor` equipped with formatting extensions (bold, italic, strike, code, link) and keymaps.
- [x] **Task 3.2: Rebuild Text Blocks**: Refactor `ParagraphBlock`, `HeadingBlock`, and `ListBlock` to leverage `RichTextBlock` for their representation.
- [x] **Task 3.3: Slash Command Menu**: Implement the `SlashMenu` popup triggered by `/` at block start. Connect selection to block-type updates.

### 4. Layout, Reordering, & Block Chrome
- [x] **Task 4.1: Drag Handle & Actions Wrapper**: Implement `BlockChrome` to inject a drag handle and a block actions menu (with delete action) next to every block on hover.
- [x] **Task 4.2: Coordinate Reordering in PageEditor**: Integrate `@dnd-kit`'s `DndContext` and `SortableContext` inside `PageEditor`. Calculate and stage new fractional order numbers.
- [x] **Task 4.3: Split and Merge Handlers**: Write split/merge helpers in `PageEditor` which create/delete blocks dynamically in the draft state and handle focus shifting.

### 5. Page Tree Redesign & Page CRUD
- [x] **Task 5.1: Extend DraftStore with Page Mutations**: Add `createPage`, `renamePage`, and `deletePage` to `DraftStore` so they push updates to `PageTreeState` through standard commits.
- [x] **Task 5.2: Collapsible PageTree & Node Actions**: Refactor `PageTree` and `PageNode` to support a local collapse state dictionary, custom icons, and hover-triggered CRUD operations.
- [x] **Task 5.3: Inline Rename affording ContentEditable**: Integrate editable node title editing that saves changes on blur or Enter press.

### 6. Verification & Hardening
- [x] **Task 6.1: Unit Test Coverage for Blocks**: Write tests verifying serialisation of ProseMirror JSON, and triggering split/merge/type-change callbacks.
- [x] **Task 6.2: Unit Test Coverage for Page CRUD**: Add tests ensuring `DraftStore` correctly stages page creation, deletion, and renaming patches.
- [x] **Task 6.3: UX/A11y Review**: Inspect keyboard focus trap, accessibility attributes (ARIA), and layout stability.
- [x] **Task 6.4: Final Production Build**: Ensure the application bundles cleanly without TypeScript compilation errors or linter issues.
