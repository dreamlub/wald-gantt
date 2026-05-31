# Wald Gantt Product Handoff

Last local verification: 2026-05-31.

This document is the current product/engineering handoff. Earlier P0 claims about `workspace_api_keys`, daily share RPC, XSS, lint, and API error handling were stale after subsequent fixes. Keep the product direction, but use the updated risk list below.

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

## Actual P0: Security Work Still Needed

### 1. Enable RLS on `task_completions`

Migration file:

- `supabase/migrations/20260531000001_create_task_completions.sql`

Problem:

- The table is created in `public`.
- The migration creates indexes but does not enable RLS.
- It stores task completion snapshots: title, assignee, labels, projects, dates.

Impact:

- If exposed via Supabase Data API, task completion history can leak across workspaces.
- Claude reported live Supabase advisor flagged this as ERROR level.
- Current row count may be 0, but the risk becomes real as soon as completed task snapshots are inserted.

Required fix:

```sql
alter table task_completions enable row level security;

create policy "workspace members can access task_completions"
  on task_completions
  for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
```

Also consider explicit grants/revokes based on the project's Data API exposure settings.

### 2. Fix `workspace_members` INSERT Policy

Claude reported live DB has an INSERT policy with `WITH CHECK (true)`.

Impact:

- If authenticated users can insert themselves into arbitrary workspaces, all membership-based RLS becomes bypassable.
- This weakens workspace isolation globally, including issues, review candidates, API keys, projects, and task data.

Required fix:

- Inspect live `workspace_members` policies.
- Remove any self-service arbitrary insert policy.
- Allow membership creation only through a controlled server/admin flow.
- If self-join is required, enforce an invite token, domain rule, or owner/admin check.
- Add a migration that reproduces the corrected policy state.

Suggested policy direction:

```text
SELECT: user can see own memberships
INSERT: disabled for normal authenticated users, or allowed only with invite/owner check
UPDATE/DELETE: owner/admin controlled only
```

### 3. Run Supabase Advisors After Both Fixes

After applying the two fixes:

- run Supabase security advisors
- confirm no ERROR-level RLS findings remain
- check function warnings separately, especially `SECURITY DEFINER` and mutable search path warnings

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
