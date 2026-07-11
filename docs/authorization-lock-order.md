# Authorization Transaction Lock Order

Transactions that combine authorization state acquire row locks in this order:

1. `workspaces`
2. `workspace_members` (user IDs sorted within a workspace)
3. `users`
4. `repositories`

Commands that touch fewer tables keep the same subsequence. Workspace claims lock the workspace
before inspecting or changing memberships; member mutations lock the workspace and then member
rows; global-user commands use only user rows; repository activation locks all four after its live
GitHub admin check completes outside the transaction.

The order includes implicit foreign-key locks. Authorization audits reference `workspaces` and
their actor `users`, while membership delegation fields also reference `users`; PostgreSQL can take
key-share locks for those checks. Locking workspace and membership rows before user rows prevents
those audit writes from creating a reverse edge, and locking repositories last keeps activation
compatible with every authority mutation path.
