# Change Log

All notable changes to the "muxpanel" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.5.1] - 2026-02-03

### Fixed
- Fixed Gantt chart export functionality - now exports as standalone HTML file
- Export uses VS Code save dialog to choose location
- Exported HTML can be opened in browser and printed/saved as PDF
- Works within webview security constraints

## [1.5.0] - 2026-02-03

### Added
- **Export Gantt Chart as PNG**: New "Export PNG" button in Gantt chart header
  - One-click export of the entire Gantt chart as a high-resolution PNG image
  - Automatically names file with project name and date
  - Visual feedback during export (loading state, success/error indicators)
  - Uses html2canvas for accurate rendering

### Fixed
- Removed misaligned month headers from Gantt chart timeline
- Gantt chart now shows only date-aligned week headers for cleaner view
- Reduced timeline header height for more compact layout

## [1.4.0] - 2026-02-03

### Added - Zero Friction Natural Language Interaction

This release removes the need for slash commands - just talk naturally to Muxpanel!

#### Natural Language Understanding
- **No commands required!** Just say what you want:
  - "Create a task for implementing login" ✓
  - "Mark the authentication task as done" ✓
  - "Show me overdue tasks" ✓
  - "Plan a project for building a mobile app" ✓
  - "Delete REQ-003" ✓
  - "What's the status of my project?" ✓

#### New Smart Request Handler
- Unified intelligent handler (`handleSmartRequest`) processes ALL requests
- Automatically understands intent: create, update, delete, query, plan
- Matches items by name from workspace context
- Chains multiple operations for complex requests

#### Improved Follow-up Suggestions
- Suggestions no longer require slash commands
- Contextual follow-ups based on what you just did
- Natural language prompts like "Show me all my tasks"

### Changed
- All requests now route through the smart handler regardless of command usage
- System prompt simplified for natural conversation
- Follow-up provider uses natural language instead of commands

### Removed
- Command routing switch statement (now unified)
- Requirement to use `/create`, `/update`, etc. commands (still supported but optional)

## [1.3.0] - 2026-02-03

### Added - Major AI Context & Autonomy Improvements

This release significantly improves how Copilot interacts with Muxpanel, making it more context-aware and autonomous.

#### New Context Tools
- `muxpanel_getWorkspaceContext` - Get comprehensive workspace overview (always call this first)
- `muxpanel_searchItems` - Search items by text query with fuzzy matching across all types
- `muxpanel_findTaskByName` - Find tasks by name/partial match instead of requiring IDs
- `muxpanel_findRequirementByName` - Find requirements by title, key, or partial match
- `muxpanel_findMilestoneByName` - Find milestones by name in active project

#### Improved AI Behavior
- **Rich Context Injection**: Every request now includes detailed workspace state:
  - All projects with their status and milestone counts
  - Up to 15 active tasks with IDs, titles, status, and due dates
  - Up to 15 requirements with keys, titles, types, and status
  - Active project milestones with IDs and linked task counts
- **Fuzzy Matching**: Intelligent matching algorithm finds items even with partial or approximate names
- **Smart Lookups**: When you say "update the login task", Copilot now automatically finds the matching task
- **Better Error Recovery**: When items aren't found, shows available items to help you

#### Enhanced System Prompt
- Clear instructions for context-first workflow
- Tool chaining guidance for complex operations
- Better response formatting with action summaries

### Changed
- `handleGeneralWithTools` now injects full workspace context into every LLM request
- Analysis prompt includes all available items so LLM can match by name
- Tool execution shows more detailed success/failure information

### Fixed
- Copilot can now find and update items by name instead of requiring exact IDs
- Search operations return helpful hints when no matches found
- Better error messages with suggestions for available items

## [1.2.1] - 2026-02-02

### Fixed
- **Critical**: Fixed task save button not working after v1.2.0 milestone consolidation
- Task edit form JavaScript was referencing removed 'type' dropdown element, causing save to fail silently
- Removed obsolete `type` property from `muxpanel_createTask` Copilot tool schema (tasks are always tasks now)
- Updated tool description to direct users to `muxpanel_createMilestone` for milestone creation

## [1.2.0] - 2026-02-02

### Changed
- **Breaking**: Removed `TaskType.Milestone` - milestones are now exclusively stored as `project.milestones`, not as tasks
- Gantt chart now properly displays project milestones with dedicated milestone markers
- Tasks and milestones are now clearly separated in the Gantt chart view
- Milestones appear first in the Gantt chart, followed by tasks
- Task form no longer shows "Type" dropdown - tasks are always tasks, milestones are created via projects
- Linked Milestone dropdown now shows project milestones instead of task-type milestones

### Removed
- Removed `TaskType.Milestone` enum value - use `dataService.addMilestone()` to create milestones
- Removed `getMilestones()`, `getMilestonesByProject()`, `getMilestonesByActiveProject()` methods from DataService
- Removed milestone-specific icons in tasks provider (milestones are not tasks)

### Added
- `getProjectMilestones(projectId?)` method in DataService to get milestones from project

### Fixed
- Gantt chart now correctly shows project milestones as diamond markers
- Autonomous project creation now creates proper project milestones instead of task-type milestones

## [1.1.1] - 2026-02-02

### Fixed
- **Critical**: Fixed data persistence issue where milestones and other items were not being saved
- Added `forceSave()` calls to all Copilot tool handlers to ensure immediate data persistence
- Fixed stale reference issues in schedule operations using `dataService.getProject()` instead of cached arrays
- All create, update, and delete operations now persist immediately instead of using debounced saves

## [1.1.0] - 2026-02-02

### Added

#### Schedule & Milestone Management
- `muxpanel_linkTaskToMilestone` - Link tasks to milestones with bidirectional updates
- `muxpanel_unlinkTaskFromMilestone` - Remove task-milestone links
- `muxpanel_updateMilestone` - Update milestone name, description, due date, and status
- `muxpanel_getSchedule` - Get complete schedule information for active project
- `muxpanel_getTasksByMilestone` - Get all tasks linked to a specific milestone
- `muxpanel_analyzeScheduleRisks` - Analyze overdue tasks, at-risk milestones, blocked items

#### Project Management
- `muxpanel_updateProject` - Update project name, description, status, and dates
- `muxpanel_getProject` - Get detailed project information including milestones and task counts

#### Task Management
- `muxpanel_createSubtask` - Create subtasks under a parent task
- `muxpanel_getSubtasks` - Get all subtasks of a parent task

#### Requirement Management
- `muxpanel_getRequirement` - Get detailed requirement info with trace links
- `muxpanel_getChildRequirements` - Get child requirements hierarchy
- Enhanced `muxpanel_updateRequirement` with type, rationale, and acceptanceCriteria support

#### Note Management
- `muxpanel_updateNote` - Update existing notes with full linking support
- Enhanced `muxpanel_createNote` with linkedRequirementKeys, linkedTaskIds, tags, isPinned

#### Follow-up Management
- `muxpanel_completeFollowUp` - Mark follow-ups as completed
- `muxpanel_getFollowUps` - List all pending follow-ups across tasks

### Changed
- `muxpanel_createMilestone` now properly adds milestones to the active project
- `muxpanel_createTask` now updates milestone's linkedTaskIds when linkedMilestoneId is provided
- `muxpanel_updateTask` now supports linkedMilestoneId, startDate, and assignee fields
- `muxpanel_listItems` now includes project milestones with linked task information
- Updated system prompt with schedule management workflow documentation
- New custom activity bar icon with "M" branding

### Fixed
- Task-milestone bidirectional linking now works correctly
- Milestone creation uses project milestones instead of task-type milestones

## [1.0.0] - Initial Release

### Added
- Requirements management with hierarchical structure
- Task management with priorities and due dates
- Project management with milestones
- Note-taking with categories
- Dashboard view
- Copilot chat participant with autonomous capabilities
- Trace link management between requirements
- Baseline and review management
- Performance optimizations (debounced saves, LRU caching, indexed collections)