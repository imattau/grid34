# plan.md — Invite to workspace via Nostr Encrypted DM

## Objective
Implement a feature to invite contacts to workspaces via Nostr Encrypted DMs (NIP-04). When an owner invites a collaborator in `PageEditor.tsx`, send an encrypted DM containing the workspace ID and the workspace's CEK. On the receiving end, display incoming workspace invitations in the `WorkspaceSwitcher` panel, allowing users to accept and join them automatically.

## Strategy
1. **Nostr DM Invite Protocol**:
   - Create functions to encrypt/send and load/decrypt NIP-04 Direct Messages (Kind 4) containing the invitation payload: `{"type": "grid34-workspace-invite", "workspaceId": "...", "cek": "..."}`.
   - Implement these helpers inside `src/editor/contacts/workspaceAccess.ts`.
2. **Sender-side Integration**:
   - In `PageEditor.tsx`'s `handleToggleCollaborator`, if a collaborator is being added (invited), retrieve the workspace's CEK from localStorage, convert it to hex, and send the Nostr DM invite.
3. **Recipient-side Inbox**:
   - In `WorkspaceSwitcher` (inside `src/App.tsx`), fetch incoming DM invites on mount/refresh if `currentUserPubkey` is available.
   - Filter out invitations for workspaces the user has already joined.
   - Display a beautifully styled "Workspace Invitations" section in the workspace switcher area.
   - Add an "Accept" button that automatically parses the CEK, saves it to localStorage, registers the workspace, and switches to it.

## Tasks

### 1. Nostr DM Invite Protocol Helpers
- [x] Task 1.1: Add `sendNostrDMInvite` and `loadIncomingDMInvites` functions to `src/editor/contacts/workspaceAccess.ts`.
  - *Verification*: Write unit tests in `src/editor/contacts/workspaceAccess.test.ts` to test mock encryption, sending, receiving, and decryption.

### 2. Sender-side Integration in Page Editor
- [x] Task 2.1: Update `handleToggleCollaborator` in `src/editor/components/PageEditor.tsx` to call `sendNostrDMInvite` when adding a collaborator.
  - *Verification*: Update or add test assertions in `src/editor/components/PageEditor.test.tsx` to verify `sendNostrDMInvite` is called with the correct parameters.

### 3. Recipient-side Switcher Inbox UI & Logic
- [x] Task 3.1: Add fetching of incoming DM invites in `WorkspaceSwitcher` (in `src/App.tsx`).
- [x] Task 3.2: Render the "Workspace Invitations" inbox section in the sidebar within `WorkspaceSwitcher`.
- [x] Task 3.3: Implement the invitation acceptance flow to write the CEK, register the workspace, publish access snapshot, and switch active workspace.
  - *Verification*: Write a test in `src/App.test.tsx` simulating incoming DM invites and verifying clicking "Accept" joins the workspace.

### 4. Verification & Clean-up
- [x] Task 4.1: Run all tests to make sure everything passes perfectly.
