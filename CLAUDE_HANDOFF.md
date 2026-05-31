# Wald Gantt Product Handoff

Last local verification: 2026-05-31.

This document is the current product/engineering handoff. Earlier P0 claims about `workspace_api_keys`, daily share RPC, XSS, lint, and API error handling were stale after subsequent fixes. The two real RLS holes that the live advisor surfaced (`task_completions`, `workspace_members`) were then fixed and pushed (commit `8dfd857`, 2026-05-31). There are no known ERROR-level security findings remaining — the next work is product flow (P1) and pipeline hardening (P2).

## Product Direction

This product is not primarily a Gantt/task tool. Its core is an operational signal pipeline.

```text
Signal capture
→ Candidate extraction
→ Human Review
→ Task / Project / Calendar execution
→ Timeline / Stats / Reminder monitoring
```

There are three signal sources.

```text
Slack      = real-time operational signal
Weekly     = structured organizational report signal
Notes      = fast manual signal from calls, verbal requests, meetings, ideas
```

Review Inbox is the central gate. Slack, Weekly, and Notes should all be able to flow into Review or directly into Task when the user explicitly chooses that.

## Current State

Slack is close to complete as a data pipeline.

```text
Slack data pipeline completeness: ~85%
Slack operational product completeness: ~80%
```

Already improved:

- raw message retention
- `channel_id + parent_ts` dedup key
- channel mapping / exclusion / brand alias normalization
- author normalization
- thread reply update
- atomic reclassification RPC
- AI classification validation
- Daily / Timeline / Review integration

Weekly is being folded into the same pipeline.

```text
Weekly pipeline completeness: ~60-70%
```

Notes is currently closer to a note app, but product-wise it should become the third signal source.

## Verified Closed Items

These were previously listed as P0, but local code now shows them as handled.

### `workspace_api_keys` Direct Secret Read

Migration exists:

- `supabase/migrations/20260531200000_restrict_api_keys_select.sql`

It drops the broad `FOR ALL` policy and creates insert/update/delete policies only. Direct authenticated SELECT is no longer allowed by the migration.

### Daily Share RPC Membership Check

Migration exists:

- `supabase/migrations/20260531200001_secure_upsert_daily_report_share.sql`

`upsert_daily_report_share(p_date, p_workspace_id)` now checks that `auth.uid()` is a member of `p_workspace_id` before issuing or returning a token.

### XSS Risks Previously Identified

Current local code:

- `daily-list-view.tsx` no longer uses `dangerouslySetInnerHTML`; bold markdown is rendered as React nodes.
- `note-markdown.tsx` uses `rehypeRaw` followed by `rehypeSanitize`.
- `package.json` includes `rehype-sanitize`.

Residual note: raw HTML in notes is still unnecessary. Removing `rehypeRaw` entirely would be stricter, but the immediate unsafe state is resolved.

### Quality Gate

Current local result:

```text
npm run check: pass
typecheck: pass
lint: 0 errors, warnings only
test: 13 files / 71 tests pass
```

Warnings remain, but the gate is green.

### API Error Handling

Current local code now checks errors in:

- `src/app/api/weekly/collection-status/route.ts`
- `src/app/api/issues/route.ts`

## Security: P0 RLS Holes — Closed (commit `8dfd857`, 2026-05-31)

Both ERROR-level holes the live Supabase advisor surfaced were fixed and verified. Migration: `supabase/migrations/20260531200002_fix_rls_holes.sql`.

### 1. `task_completions` RLS — DONE

- Was created in `public` without RLS → task completion snapshots (title, assignee, labels, projects, dates) exposable across workspaces via Data API.
- Fix: `enable row level security` + workspace-member `for all` policy.
- Verified live: `rls_enabled = true`, 1 policy. Row count was 0, so no data had leaked.

### 2. `workspace_members` INSERT policy — DONE

- Had an INSERT policy with `WITH CHECK (true)` → any authenticated user could insert themselves into an arbitrary workspace, bypassing all membership-based RLS.
- Fix: dropped the `insert membership` policy. Legitimate membership is created only by `create_workspace_for_user` (a `SECURITY DEFINER` RPC that bypasses RLS), and all 38 app-code references to `workspace_members` are SELECT-only — so removing the policy has no functional impact.
- Verified live: 0 INSERT policies.

### 3. Advisor re-run — DONE

- Re-ran Supabase security advisors after both fixes: **no ERROR-level findings remain**.
- Remaining items are all WARN and mostly intentional: `function_search_path_mutable` (hardening), `SECURITY DEFINER` functions executable by anon/authenticated (shared-token report/board access is by design), and leaked-password protection (a dashboard toggle). Address opportunistically, not blocking.

## P1: Product Flow Completion

### 1. Make Notes the Third Signal Source

Goal:

```text
Call / verbal request / meeting note / idea
→ fast note capture
→ unresolved inbox item
→ Review or Task
```

MVP data model:

```ts
notes.status = 'inbox' | 'reviewed' | 'archived'
notes.source_context = 'call' | 'meeting' | 'idea' | 'manual' // optional
notes.review_candidate_id // optional
notes.task_id // optional
```

Minimum implementation:

- New notes default to `status = 'inbox'`.
- Add note actions:
  - send to Review
  - create Task
  - mark reviewed
- Add `note` to `ReviewSource`.
- Add `note` to `review_candidates.source` CHECK constraint.
- Keep source traceability from Review/Task back to the note.
- Show unresolved notes on Home.

### 2. Redefine Home

Home should be today's operational cockpit, not a generic dashboard.

```text
Home
├─ Review Queue
│  └─ pending / high / snoozed today
├─ Capture Inbox
│  └─ unresolved Notes
├─ Today Execution
│  └─ overdue / today / unscheduled tasks
├─ Monitoring
│  └─ repeated / re-mentioned / long-open issues
└─ Pipeline Health
   └─ Slack / Daily / Weekly collection and generation status
```

Home should be action/list/CTA oriented, not chart-heavy.

### 3. Redefine Stats

Avoid overlap with Home.

```text
Home  = today's queues and alerts
Stats = long-term trends and bottleneck diagnosis
```

Recommended tabs:

```text
Stats
├─ Overview
│  └─ Signal → Review → Task → Done funnel
├─ Signals
│  └─ Slack / Weekly / Notes conversion rates
├─ Review
│  └─ pending dwell time, created/ignored/snoozed ratio
├─ Execution
│  └─ task completion rate, overdue rate, unscheduled count
├─ Issues
│  └─ recurring / long-running / re-mentioned / brand risk
└─ Resources
   └─ people-by-project allocation over time
```

MVP metrics:

- candidate count by source
- candidate-to-task conversion rate
- pending candidate count
- overdue task count
- long-open issue count

### 4. Add Resource / Capacity View

The user wants to see which team members are allocated to which projects over time.

Initial location:

```text
Stats > Resources
```

MVP shape:

```text
Y axis: assignee
X axis: week
Cell: project task count
```

Implementation phases:

1. Assignee × week × project task count
2. Allocation based on `start_date` / `due_date`
3. Load based on `estimated_minutes`
4. Actual calendar allocation based on `scheduled_at`

Purpose:

- identify overload
- identify project/person concentration
- see where Review-created work actually flows

## P2: Weekly Pipeline Hardening

Weekly should align with the Slack pipeline.

Current direction:

```text
weekly_reports.raw_content
→ AI summary
→ action_required / task_title / task_memo
→ review_candidates
→ Task
```

Needed:

- validation before saving weekly summary
- regeneration/archive policy for summaries
- stronger deduplication of action-required candidates
- preserve existing `created/snoozed/ignored` review statuses
- visible generation success/failure history

## Menu Grouping Recommendation

Menu should follow the product workflow, not raw feature type.

Recommended order:

```text
Home
Review

Signals
- Slack
- Weekly
- Notes

Execution
- Tasks
- Projects
- Calendar / Work Time

Monitoring
- Stats
- Timeline (later, when it combines Slack/Weekly/Notes issues)

System
- Settings
```

Rationale:

- Home is today's cockpit.
- Review is the daily decision queue.
- Signals are source inspection surfaces.
- Execution is where confirmed work is managed.
- Monitoring is for trend, risk, and bottleneck diagnosis.

## Design Principles

1. Pipeline reliability before new surface area.
2. Every signal keeps its source trace.
3. Default path is human Review before Task creation.
4. Notes may bypass Review and become Task directly when the user explicitly chooses it.
5. Home is an action surface; Stats is a diagnosis surface.
6. Slack / Weekly / Notes are different inputs, but after Review they converge into the same execution model.

## Core Product Sentence

```text
Wald Gantt detects work signals from Slack, Weekly reports, and Notes;
turns them into candidates for human Review;
converts confirmed work into Tasks, Projects, and Calendar blocks;
and monitors recurring issues, delays, and bottlenecks through Timeline and Stats.
```
