-- Projects/Tasks list & trash performance indexes.
-- gantt_projects previously had only its primary key; gantt_tasks lacked a
-- covering index for the dominant active-list query. These target the hot
-- read paths in task-service/gantt-service as data grows.

-- Active task list: getTasks() — workspace + not-deleted + not-archived, sort_order.
create index if not exists idx_gantt_tasks_active
  on gantt_tasks (workspace_id, sort_order)
  where deleted_at is null and archived_at is null;

-- Task trash list/count: getDeletedTasks(), getDeletedTasksCount().
create index if not exists idx_gantt_tasks_trash
  on gantt_tasks (workspace_id)
  where deleted_at is not null;

-- Active project list: getProjects() — board + not-deleted, sort_order.
-- Also serves addProject()'s board_id-prefixed max(sort_order) lookup.
create index if not exists idx_gantt_projects_active
  on gantt_projects (board_id, sort_order)
  where deleted_at is null;

-- Project trash list/count: getDeletedProjects(), getDeletedProjectsCount().
create index if not exists idx_gantt_projects_trash
  on gantt_projects (board_id, deleted_at desc)
  where deleted_at is not null;

-- Subproject cascade on soft delete / restore: .eq('parent_id', id).
create index if not exists idx_gantt_projects_parent
  on gantt_projects (parent_id)
  where parent_id is not null;
