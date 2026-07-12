# Desk policy: project-first review desk

Status: **product direction**  
Visual contract: [`docs/design-mockups/dashboard-project-first.html`](./design-mockups/dashboard-project-first.html) (when present)

## Hierarchy

| Level | Name | UI |
| ----- | ---- | -- |
| **L1** | Workspace | Header + metrics for the **active scope** |
| **L2** | Project | Projects sidebar + Project bar |
| **L3** | Queue · PR | Next-up / Complete **inside** the active scope |

## Which repositories appear

**Must:** The desk lists only repositories with **Folio enabled** in  
Settings → Repositories (DB `folioEnabled === true`).

**Must not:** List every GitHub App installation repo, or show long “not enabled”
project sections for toggled-off repositories.

- Sidebar “All projects · N repos” → N = enabled count  
- Single-project list → enabled only  
- Empty desk when none enabled → guide user to Settings to turn repos on  

## Scope

- **All projects** = stack of enabled project sections  
- **Single project** = Next-up + Complete for that enabled repo  
- Ready / Yours / Complete chips filter **within** the active project scope  
- Metrics match the active scope  

## Implementation notes

- Summary API: `boardRead: true` scope + filter `folioEnabled`  
- Web: `selectEnabledDashboardRepos()` before sidebar/load  
- Pull pages remain repository-scoped via `repository=` query  
