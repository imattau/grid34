# plan.md — Implement @ Mentions and Workspace Access Check

## Objective
Implement inline `@` mentions inside TipTap text editor blocks (`RichTextBlock.tsx`) that pull from Nostr contacts. When a contact is selected, check if they have read/write access to the current workspace, notifying the user with a prompt to invite them if they do not.

## Strategy
1. **TipTap Extension**: Install and configure `@tiptap/extension-mention` to handle typing `@` and rendering inline tags.
2. **Mentions Suggestion Popup**: Implement a suggestion trigger wrapper linking contacts to the suggestion dropdown. Load contacts via `loadNostrContacts` using user relays.
3. **Workspace Collaboration Checker**: Verify the mentioned contact's pubkey against the workspace owner/invited list. If not invited, display an elegant banner alert in the editor shell with an active "Invite Editor" button.

## Tasks

### 1. Research & Setup
- [x] Task 1.1: Install `@tiptap/extension-mention` package.
  - *Verification*: Run installation command and confirm in `package.json`.

### 2. Suggestion Component & Extensions
- [x] Task 2.1: Implement a custom mentions dropdown suggestion controller using React.
  - *File*: `src/editor/blocks/mentionSuggestions.tsx`
  - *Verification*: Create the query filtering list logic for contacts list.
- [x] Task 2.2: Add `Mention` extension into TipTap `extensions` list inside `RichTextBlock.tsx`.
  - *File*: `src/editor/blocks/RichTextBlock.tsx`
  - *Verification*: Check if typing `@` brings up a suggestion list overlay in the block editor.

### 3. Collaboration Alert & Invites
- [x] Task 3.1: Implement page-level observer for mentions inside the active editor. Check pubkeys of newly entered mentions.
  - *File*: `src/editor/components/PageEditor.tsx`
  - *Verification*: When typing `@Bob` (where Bob has no access), set local state trigger to show the banner.
- [x] Task 3.2: Render notification banner alert with an "Invite" trigger.
  - *File*: `src/editor/components/PageEditor.tsx`
  - *Verification*: Clicking "Invite" correctly calls `handleToggleCollaborator(pubkey)`.

### 4. Verification & Clean-up
- [x] Task 4.1: Write tests for mention parsing, checking permissions, and inviting.
  - *Verification*: Run unit tests under `npm test`.
