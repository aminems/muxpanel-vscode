import * as vscode from 'vscode';
import { DataService } from '../services';
import { 
    RequirementType, 
    RequirementStatus, 
    Priority,
    TaskStatus,
    TaskPriority,
    TaskType,
    NoteCategory,
    MilestoneStatus,
    ProjectStatus,
    TraceLinkType,
    TraceLinkTargetType,
    TraceLink
} from '../models';

const SYSTEM_PROMPT = `You are an intelligent assistant for Muxpanel - a systems engineering and project management tool.

## KEY PRINCIPLE: ZERO FRICTION

Users can talk to you naturally - NO COMMANDS REQUIRED. Just understand what they want and do it.

Examples of natural requests you handle:
- "Create a task for implementing login"
- "Mark the authentication task as done"  
- "Show me overdue tasks"
- "Plan a project for building a mobile app"
- "What's the status of my project?"
- "Delete REQ-003"
- "Update the design milestone to completed"

## HOW YOU WORK

1. **Understand Intent**: Parse natural language to determine create/update/delete/query actions
2. **Find Items**: Match item names from context - you have full visibility of all tasks, requirements, milestones
3. **Execute**: Use the appropriate tool with correct IDs from context
4. **Respond**: Give clear, concise feedback on what was done

## CAPABILITIES

- **Create**: Tasks, requirements, milestones, projects, notes, trace links
- **Update**: Status, priority, dates, descriptions, assignments
- **Delete**: Any item by name or ID
- **Query**: Status, schedules, overdue items, coverage analysis
- **Plan**: Generate complete project structures with milestones and tasks

## IMPORTANT

- Items are in the workspace context - match by name to find IDs
- Be proactive - if user wants a project, create milestones too
- Chain operations when needed (search → update, create project → add milestones)
- Respond concisely with clear confirmation of actions taken`;

// ============================================================================
// TOOL DEFINITIONS for Language Model Tools API
// ============================================================================

const MUXPANEL_TOOLS: vscode.LanguageModelChatTool[] = [
    // ========================================================================
    // CONTEXT & SEARCH TOOLS (Use these FIRST before any operation)
    // ========================================================================
    {
        name: 'muxpanel_getWorkspaceContext',
        description: 'ALWAYS call this first! Get a comprehensive overview of the entire Muxpanel workspace including all projects, requirements, tasks, milestones, and notes. Use this to understand what exists before performing any operation.',
        inputSchema: {
            type: 'object',
            properties: {
                includeDetails: { type: 'boolean', description: 'Include detailed information about items', default: true }
            }
        }
    },
    {
        name: 'muxpanel_searchItems',
        description: 'Search for items by text query across all item types. Use this to find items when user mentions them by name, description, or partial match. Returns matching items with their IDs/keys for subsequent operations.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search text to match against titles, descriptions, and content' },
                itemTypes: { 
                    type: 'array', 
                    items: { type: 'string', enum: ['requirement', 'task', 'milestone', 'note', 'project'] },
                    description: 'Types of items to search (omit for all types)'
                },
                status: { type: 'string', description: 'Filter by status' },
                limit: { type: 'number', description: 'Max results to return', default: 10 }
            },
            required: ['query']
        }
    },
    {
        name: 'muxpanel_findTaskByName',
        description: 'Find a task by its title or partial title match. Use when user refers to a task by name instead of ID.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Task name or partial name to search for' },
                includeCompleted: { type: 'boolean', description: 'Include completed tasks in search', default: false }
            },
            required: ['name']
        }
    },
    {
        name: 'muxpanel_findRequirementByName',
        description: 'Find a requirement by its title, key, or partial match. Use when user refers to a requirement by name instead of key.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Requirement title, key (e.g., REQ-001), or partial match' }
            },
            required: ['name']
        }
    },
    {
        name: 'muxpanel_findMilestoneByName',
        description: 'Find a milestone by its name or partial match. Use when user refers to a milestone by name.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Milestone name or partial match' }
            },
            required: ['name']
        }
    },
    // ========================================================================
    // CREATE TOOLS
    // ========================================================================
    {
        name: 'muxpanel_createRequirement',
        description: 'Create a new requirement in Muxpanel. Use for functional, non-functional, interface, constraint, business, system, software, hardware, performance, safety, or security requirements.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'The requirement title' },
                description: { type: 'string', description: 'Detailed description' },
                type: { type: 'string', enum: ['functional', 'non-functional', 'interface', 'constraint', 'business', 'system', 'software', 'hardware', 'performance', 'safety', 'security'] },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                rationale: { type: 'string', description: 'Why this requirement exists' },
                acceptanceCriteria: { type: 'string', description: 'How to verify this requirement' },
                parentKey: { type: 'string', description: 'Parent requirement key (e.g., REQ-001) for hierarchical requirements' }
            },
            required: ['title']
        }
    },
    {
        name: 'muxpanel_createTask',
        description: 'Create a new task in Muxpanel. Tasks are work items that can be assigned and tracked. To create milestones, use muxpanel_createMilestone instead.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'The task title' },
                description: { type: 'string', description: 'Task description' },
                priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
                startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                assignee: { type: 'string', description: 'Person assigned to this task' },
                linkedMilestoneId: { type: 'string', description: 'ID of project milestone this task is linked to' }
            },
            required: ['title']
        }
    },
    {
        name: 'muxpanel_createMilestone',
        description: 'Create a new milestone (key deliverable) in Muxpanel. Milestones are major checkpoints in a project. Adds the milestone to the active project.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'The milestone name' },
                description: { type: 'string', description: 'Milestone description' },
                dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
                priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                projectId: { type: 'string', description: 'Project ID to add milestone to (uses active project if not specified)' }
            },
            required: ['title', 'dueDate']
        }
    },
    {
        name: 'muxpanel_createProject',
        description: 'Create a new project in Muxpanel with optional milestones.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Project name' },
                description: { type: 'string', description: 'Project description' },
                startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
                targetEndDate: { type: 'string', description: 'Target end date YYYY-MM-DD' },
                setAsActive: { type: 'boolean', description: 'Set this as the active project' }
            },
            required: ['name']
        }
    },
    {
        name: 'muxpanel_createTraceLink',
        description: 'Create a trace link between a requirement and another item (requirement, task, test case, etc.).',
        inputSchema: {
            type: 'object',
            properties: {
                sourceKey: { type: 'string', description: 'Source requirement key (e.g., REQ-001)' },
                targetKey: { type: 'string', description: 'Target item key or ID' },
                targetType: { type: 'string', enum: ['requirement', 'task', 'test-case', 'code', 'document', 'external'] },
                linkType: { type: 'string', enum: ['derives-from', 'refines', 'satisfies', 'verifies', 'validates', 'implements', 'traces-to', 'conflicts-with', 'depends-on', 'related-to'] }
            },
            required: ['sourceKey', 'targetKey', 'linkType']
        }
    },
    {
        name: 'muxpanel_createNote',
        description: 'Create a new note in Muxpanel with optional links to requirements and tasks.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Note title' },
                content: { type: 'string', description: 'Note content (markdown supported)' },
                category: { type: 'string', enum: ['general', 'meeting-notes', 'decision', 'technical-note', 'review', 'idea', 'issue'] },
                linkedRequirementKeys: { type: 'array', items: { type: 'string' }, description: 'Requirement keys to link (e.g., ["REQ-001", "REQ-002"])' },
                linkedTaskIds: { type: 'array', items: { type: 'string' }, description: 'Task IDs to link' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the note' },
                isPinned: { type: 'boolean', description: 'Whether to pin this note' }
            },
            required: ['title']
        }
    },
    {
        name: 'muxpanel_updateNote',
        description: 'Update an existing note.',
        inputSchema: {
            type: 'object',
            properties: {
                noteId: { type: 'string', description: 'Note ID' },
                title: { type: 'string' },
                content: { type: 'string' },
                category: { type: 'string', enum: ['general', 'meeting-notes', 'decision', 'technical-note', 'review', 'idea', 'issue'] },
                linkedRequirementKeys: { type: 'array', items: { type: 'string' }, description: 'Requirement keys to link' },
                linkedTaskIds: { type: 'array', items: { type: 'string' }, description: 'Task IDs to link' },
                tags: { type: 'array', items: { type: 'string' } },
                isPinned: { type: 'boolean' }
            },
            required: ['noteId']
        }
    },
    {
        name: 'muxpanel_addFollowUp',
        description: 'Add a follow-up action item to an existing task.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'The task ID to add follow-up to' },
                content: { type: 'string', description: 'Follow-up description' },
                dueDate: { type: 'string', description: 'Due date YYYY-MM-DD' }
            },
            required: ['taskId', 'content', 'dueDate']
        }
    },
    {
        name: 'muxpanel_completeFollowUp',
        description: 'Mark a follow-up as completed.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'The task ID containing the follow-up' },
                followUpId: { type: 'string', description: 'The follow-up ID to complete' }
            },
            required: ['taskId', 'followUpId']
        }
    },
    {
        name: 'muxpanel_getFollowUps',
        description: 'Get all pending follow-ups across tasks.',
        inputSchema: {
            type: 'object',
            properties: {
                includeCompleted: { type: 'boolean', description: 'Include completed follow-ups', default: false }
            }
        }
    },
    {
        name: 'muxpanel_updateRequirement',
        description: 'Update an existing requirement.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Requirement key (e.g., REQ-001)' },
                title: { type: 'string' },
                description: { type: 'string' },
                status: { type: 'string', enum: ['draft', 'proposed', 'under-review', 'approved', 'active', 'implemented', 'verified', 'validated', 'released', 'rejected', 'deferred', 'deprecated'] },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                type: { type: 'string', enum: ['functional', 'non-functional', 'interface', 'constraint', 'business', 'system', 'software', 'hardware', 'performance', 'safety', 'security'] },
                rationale: { type: 'string', description: 'Why this requirement exists' },
                acceptanceCriteria: { type: 'string', description: 'How to verify this requirement' }
            },
            required: ['key']
        }
    },
    {
        name: 'muxpanel_updateTask',
        description: 'Update an existing task.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID' },
                title: { type: 'string' },
                status: { type: 'string', enum: ['todo', 'in-progress', 'blocked', 'in-review', 'done', 'cancelled'] },
                priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                dueDate: { type: 'string' },
                linkedMilestoneId: { type: 'string', description: 'ID of milestone to link this task to' },
                startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                assignee: { type: 'string', description: 'Person assigned to this task' }
            },
            required: ['taskId']
        }
    },
    {
        name: 'muxpanel_deleteItem',
        description: 'Delete an item from Muxpanel.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['requirement', 'task', 'note', 'project'] },
                id: { type: 'string', description: 'Item ID or key' }
            },
            required: ['type', 'id']
        }
    },
    {
        name: 'muxpanel_switchProject',
        description: 'Switch the active project context.',
        inputSchema: {
            type: 'object',
            properties: {
                projectName: { type: 'string', description: 'Name of project to switch to (partial match supported)' }
            },
            required: ['projectName']
        }
    },
    {
        name: 'muxpanel_getStatus',
        description: 'Get current Muxpanel status including statistics, active project, and pending items.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'muxpanel_listItems',
        description: 'List items in Muxpanel with optional filters.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['requirements', 'tasks', 'milestones', 'notes', 'projects', 'overdue', 'all'] },
                status: { type: 'string', description: 'Filter by status' },
                priority: { type: 'string', description: 'Filter by priority' },
                limit: { type: 'number', description: 'Max items to return', default: 20 }
            },
            required: ['type']
        }
    },
    {
        name: 'muxpanel_createBaseline',
        description: 'Create a baseline snapshot of current requirements.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Baseline name' },
                description: { type: 'string', description: 'Baseline description' },
                requirementKeys: { type: 'array', items: { type: 'string' }, description: 'Specific requirement keys to include (empty for all)' }
            },
            required: ['name']
        }
    },
    {
        name: 'muxpanel_analyzeImpact',
        description: 'Analyze the impact of changing a requirement.',
        inputSchema: {
            type: 'object',
            properties: {
                requirementKey: { type: 'string', description: 'Requirement key to analyze' }
            },
            required: ['requirementKey']
        }
    },
    // ========================================================================
    // SCHEDULE & MILESTONE TOOLS
    // ========================================================================
    {
        name: 'muxpanel_linkTaskToMilestone',
        description: 'Link an existing task to a milestone. This establishes a relationship between the task and the milestone for schedule tracking.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'The ID of the task to link' },
                milestoneId: { type: 'string', description: 'The ID of the milestone to link to' }
            },
            required: ['taskId', 'milestoneId']
        }
    },
    {
        name: 'muxpanel_unlinkTaskFromMilestone',
        description: 'Remove the link between a task and its milestone.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'The ID of the task to unlink' }
            },
            required: ['taskId']
        }
    },
    {
        name: 'muxpanel_updateMilestone',
        description: 'Update an existing milestone in the active project.',
        inputSchema: {
            type: 'object',
            properties: {
                milestoneId: { type: 'string', description: 'The milestone ID to update' },
                name: { type: 'string', description: 'New name for the milestone' },
                description: { type: 'string', description: 'New description' },
                dueDate: { type: 'string', description: 'New due date in YYYY-MM-DD format' },
                status: { type: 'string', enum: ['not-started', 'in-progress', 'completed', 'delayed', 'cancelled'], description: 'Milestone status' }
            },
            required: ['milestoneId']
        }
    },
    {
        name: 'muxpanel_getSchedule',
        description: 'Get the schedule information for the active project including milestones, tasks, and timeline. Use this to understand the current project schedule before making changes.',
        inputSchema: {
            type: 'object',
            properties: {
                includeCompleted: { type: 'boolean', description: 'Include completed items in the schedule', default: false }
            }
        }
    },
    {
        name: 'muxpanel_getTasksByMilestone',
        description: 'Get all tasks linked to a specific milestone.',
        inputSchema: {
            type: 'object',
            properties: {
                milestoneId: { type: 'string', description: 'The milestone ID to get tasks for' }
            },
            required: ['milestoneId']
        }
    },
    {
        name: 'muxpanel_analyzeScheduleRisks',
        description: 'Analyze the current schedule for risks including overdue tasks, milestones at risk, and resource conflicts.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    // ========================================================================
    // PROJECT MANAGEMENT TOOLS
    // ========================================================================
    {
        name: 'muxpanel_updateProject',
        description: 'Update an existing project.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID (uses active project if not specified)' },
                name: { type: 'string', description: 'New project name' },
                description: { type: 'string', description: 'New description' },
                status: { type: 'string', enum: ['planning', 'active', 'on-hold', 'completed', 'cancelled'] },
                startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
                targetEndDate: { type: 'string', description: 'Target end date YYYY-MM-DD' }
            }
        }
    },
    {
        name: 'muxpanel_getProject',
        description: 'Get detailed information about a project.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project ID (uses active project if not specified)' }
            }
        }
    },
    // ========================================================================
    // SUBTASK TOOLS
    // ========================================================================
    {
        name: 'muxpanel_createSubtask',
        description: 'Create a subtask under an existing task.',
        inputSchema: {
            type: 'object',
            properties: {
                parentTaskId: { type: 'string', description: 'The parent task ID' },
                title: { type: 'string', description: 'Subtask title' },
                description: { type: 'string', description: 'Subtask description' },
                priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                dueDate: { type: 'string', description: 'Due date YYYY-MM-DD' },
                assignee: { type: 'string', description: 'Person assigned' }
            },
            required: ['parentTaskId', 'title']
        }
    },
    {
        name: 'muxpanel_getSubtasks',
        description: 'Get all subtasks of a parent task.',
        inputSchema: {
            type: 'object',
            properties: {
                parentTaskId: { type: 'string', description: 'The parent task ID' }
            },
            required: ['parentTaskId']
        }
    },
    // ========================================================================
    // REQUIREMENT LINKING TOOLS
    // ========================================================================
    {
        name: 'muxpanel_getRequirement',
        description: 'Get detailed information about a requirement including its trace links.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Requirement key (e.g., REQ-001)' }
            },
            required: ['key']
        }
    },
    {
        name: 'muxpanel_getChildRequirements',
        description: 'Get all child requirements of a parent requirement.',
        inputSchema: {
            type: 'object',
            properties: {
                parentKey: { type: 'string', description: 'Parent requirement key' }
            },
            required: ['parentKey']
        }
    }
];

export function registerChatParticipant(context: vscode.ExtensionContext): vscode.ChatParticipant {
    const dataService = DataService.getInstance();

    // ========================================================================
    // FUZZY MATCHING HELPER
    // ========================================================================
    function fuzzyMatch(text: string, query: string): number {
        const textLower = text.toLowerCase();
        const queryLower = query.toLowerCase();
        
        // Exact match
        if (textLower === queryLower) return 1.0;
        
        // Contains match
        if (textLower.includes(queryLower)) return 0.9;
        
        // Word match
        const queryWords = queryLower.split(/\s+/);
        const textWords = textLower.split(/\s+/);
        let matchedWords = 0;
        for (const qWord of queryWords) {
            if (textWords.some(tWord => tWord.includes(qWord) || qWord.includes(tWord))) {
                matchedWords++;
            }
        }
        if (matchedWords > 0) {
            return 0.5 + (0.4 * matchedWords / queryWords.length);
        }
        
        return 0;
    }

    // ========================================================================
    // TOOL EXECUTION HANDLER
    // ========================================================================
    async function executeToolCall(toolName: string, toolInput: any): Promise<string> {
        try {
            switch (toolName) {
                // ============================================================
                // CONTEXT & SEARCH TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_getWorkspaceContext': {
                    const projects = dataService.getProjects();
                    const requirements = dataService.getRequirements();
                    const tasks = dataService.getTasks();
                    const notes = dataService.getNotes();
                    const activeProject = dataService.activeProject;
                    const stats = dataService.getStatistics();
                    
                    const includeDetails = toolInput.includeDetails !== false;
                    
                    const context: any = {
                        summary: {
                            totalProjects: projects.length,
                            totalRequirements: requirements.length,
                            totalTasks: tasks.length,
                            totalNotes: notes.length,
                            overdueTasks: stats.overdueTasks,
                            pendingFollowUps: stats.pendingFollowUps
                        },
                        activeProject: activeProject ? {
                            id: activeProject.id,
                            name: activeProject.name,
                            status: activeProject.status,
                            progress: activeProject.progress,
                            milestoneCount: activeProject.milestones?.length || 0,
                            milestones: activeProject.milestones?.map((m: any) => ({
                                id: m.id,
                                name: m.name,
                                dueDate: m.dueDate,
                                status: m.status,
                                linkedTaskCount: (m.linkedTaskIds || []).length
                            })) || []
                        } : null
                    };
                    
                    if (includeDetails) {
                        context.projects = projects.map(p => ({
                            id: p.id,
                            name: p.name,
                            status: p.status,
                            isActive: p.id === activeProject?.id,
                            milestoneCount: p.milestones?.length || 0
                        }));
                        
                        context.requirements = requirements.slice(0, 50).map(r => ({
                            id: r.id,
                            key: r.key,
                            title: r.title,
                            type: r.type,
                            status: r.status,
                            priority: r.priority,
                            hasChildren: r.children && r.children.length > 0
                        }));
                        
                        context.tasks = tasks.slice(0, 50).map(t => ({
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            priority: t.priority,
                            dueDate: t.dueDate,
                            assignee: t.assignee,
                            linkedMilestoneId: t.linkedMilestoneId
                        }));
                        
                        context.notes = notes.slice(0, 20).map(n => ({
                            id: n.id,
                            title: n.title,
                            category: n.category,
                            isPinned: n.isPinned
                        }));
                    }
                    
                    return JSON.stringify({ success: true, context });
                }
                
                case 'muxpanel_searchItems': {
                    const query = toolInput.query?.toLowerCase() || '';
                    const itemTypes = toolInput.itemTypes || ['requirement', 'task', 'milestone', 'note', 'project'];
                    const limit = toolInput.limit || 10;
                    
                    const results: any[] = [];
                    
                    if (itemTypes.includes('requirement')) {
                        const reqs = dataService.getRequirements();
                        for (const r of reqs) {
                            const score = Math.max(
                                fuzzyMatch(r.title, query),
                                fuzzyMatch(r.key, query),
                                fuzzyMatch(r.description || '', query) * 0.8
                            );
                            if (score > 0.3) {
                                results.push({
                                    type: 'requirement',
                                    id: r.id,
                                    key: r.key,
                                    title: r.title,
                                    status: r.status,
                                    priority: r.priority,
                                    score
                                });
                            }
                        }
                    }
                    
                    if (itemTypes.includes('task')) {
                        const tasks = dataService.getTasks();
                        for (const t of tasks) {
                            if (toolInput.status && t.status !== toolInput.status) continue;
                            const score = Math.max(
                                fuzzyMatch(t.title, query),
                                fuzzyMatch(t.description || '', query) * 0.8
                            );
                            if (score > 0.3) {
                                results.push({
                                    type: 'task',
                                    id: t.id,
                                    title: t.title,
                                    status: t.status,
                                    priority: t.priority,
                                    dueDate: t.dueDate,
                                    score
                                });
                            }
                        }
                    }
                    
                    if (itemTypes.includes('milestone')) {
                        const activeProject = dataService.activeProject;
                        if (activeProject) {
                            for (const m of activeProject.milestones || []) {
                                const score = Math.max(
                                    fuzzyMatch(m.name, query),
                                    fuzzyMatch(m.description || '', query) * 0.8
                                );
                                if (score > 0.3) {
                                    results.push({
                                        type: 'milestone',
                                        id: m.id,
                                        name: m.name,
                                        dueDate: m.dueDate,
                                        status: m.status,
                                        score
                                    });
                                }
                            }
                        }
                    }
                    
                    if (itemTypes.includes('note')) {
                        const notes = dataService.getNotes();
                        for (const n of notes) {
                            const score = Math.max(
                                fuzzyMatch(n.title, query),
                                fuzzyMatch(n.content || '', query) * 0.8
                            );
                            if (score > 0.3) {
                                results.push({
                                    type: 'note',
                                    id: n.id,
                                    title: n.title,
                                    category: n.category,
                                    score
                                });
                            }
                        }
                    }
                    
                    if (itemTypes.includes('project')) {
                        const projects = dataService.getProjects();
                        for (const p of projects) {
                            const score = Math.max(
                                fuzzyMatch(p.name, query),
                                fuzzyMatch(p.description || '', query) * 0.8
                            );
                            if (score > 0.3) {
                                results.push({
                                    type: 'project',
                                    id: p.id,
                                    name: p.name,
                                    status: p.status,
                                    score
                                });
                            }
                        }
                    }
                    
                    // Sort by score and limit
                    results.sort((a, b) => b.score - a.score);
                    const limitedResults = results.slice(0, limit);
                    
                    return JSON.stringify({
                        success: true,
                        query,
                        totalMatches: results.length,
                        results: limitedResults,
                        hint: results.length === 0 
                            ? 'No items found. Try a different search term or check the workspace context.' 
                            : undefined
                    });
                }
                
                case 'muxpanel_findTaskByName': {
                    const query = toolInput.name?.toLowerCase() || '';
                    const tasks = dataService.getTasks();
                    const includeCompleted = toolInput.includeCompleted || false;
                    
                    const matches = tasks
                        .filter(t => includeCompleted || (t.status !== 'done' && t.status !== 'cancelled'))
                        .map(t => ({
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            priority: t.priority,
                            dueDate: t.dueDate,
                            assignee: t.assignee,
                            linkedMilestoneId: t.linkedMilestoneId,
                            score: fuzzyMatch(t.title, query)
                        }))
                        .filter(t => t.score > 0.3)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 5);
                    
                    if (matches.length === 0) {
                        return JSON.stringify({
                            success: false,
                            error: `No task found matching "${toolInput.name}"`,
                            availableTasks: tasks.slice(0, 10).map(t => ({ id: t.id, title: t.title, status: t.status }))
                        });
                    }
                    
                    return JSON.stringify({
                        success: true,
                        bestMatch: matches[0],
                        allMatches: matches
                    });
                }
                
                case 'muxpanel_findRequirementByName': {
                    const query = toolInput.name?.toLowerCase() || '';
                    const requirements = dataService.getRequirements();
                    
                    const matches = requirements
                        .map(r => ({
                            id: r.id,
                            key: r.key,
                            title: r.title,
                            type: r.type,
                            status: r.status,
                            priority: r.priority,
                            score: Math.max(fuzzyMatch(r.title, query), fuzzyMatch(r.key, query))
                        }))
                        .filter(r => r.score > 0.3)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 5);
                    
                    if (matches.length === 0) {
                        return JSON.stringify({
                            success: false,
                            error: `No requirement found matching "${toolInput.name}"`,
                            availableRequirements: requirements.slice(0, 10).map(r => ({ key: r.key, title: r.title }))
                        });
                    }
                    
                    return JSON.stringify({
                        success: true,
                        bestMatch: matches[0],
                        allMatches: matches
                    });
                }
                
                case 'muxpanel_findMilestoneByName': {
                    const query = toolInput.name?.toLowerCase() || '';
                    const activeProject = dataService.activeProject;
                    
                    if (!activeProject) {
                        return JSON.stringify({
                            success: false,
                            error: 'No active project',
                            availableProjects: dataService.getProjects().map(p => ({ id: p.id, name: p.name }))
                        });
                    }
                    
                    const milestones = activeProject.milestones || [];
                    const matches = milestones
                        .map((m: any) => ({
                            id: m.id,
                            name: m.name,
                            dueDate: m.dueDate,
                            status: m.status,
                            linkedTaskCount: (m.linkedTaskIds || []).length,
                            score: fuzzyMatch(m.name, query)
                        }))
                        .filter((m: any) => m.score > 0.3)
                        .sort((a: any, b: any) => b.score - a.score)
                        .slice(0, 5);
                    
                    if (matches.length === 0) {
                        return JSON.stringify({
                            success: false,
                            error: `No milestone found matching "${toolInput.name}"`,
                            availableMilestones: milestones.map((m: any) => ({ id: m.id, name: m.name }))
                        });
                    }
                    
                    return JSON.stringify({
                        success: true,
                        bestMatch: matches[0],
                        allMatches: matches
                    });
                }
                
                // ============================================================
                // CREATE TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_createRequirement': {
                    const parentId = toolInput.parentKey 
                        ? dataService.getRequirements().find(r => r.key === toolInput.parentKey)?.id 
                        : undefined;
                    const req = dataService.addRequirement({
                        title: toolInput.title,
                        description: toolInput.description || '',
                        type: mapRequirementType(toolInput.type || 'functional'),
                        priority: mapPriority(toolInput.priority || 'medium'),
                        rationale: toolInput.rationale || '',
                        acceptanceCriteria: toolInput.acceptanceCriteria || '',
                        parentId: parentId
                    });
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshRequirements');
                    return JSON.stringify({ success: true, key: req.key, title: req.title, id: req.id });
                }
                
                case 'muxpanel_createTask': {
                    const task = dataService.addTask({
                        title: toolInput.title,
                        description: toolInput.description || '',
                        priority: mapTaskPriority(toolInput.priority || 'medium'),
                        dueDate: toolInput.dueDate ? new Date(toolInput.dueDate).toISOString() : undefined,
                        startDate: toolInput.startDate ? new Date(toolInput.startDate).toISOString() : undefined,
                        assignee: toolInput.assignee,
                        linkedMilestoneId: toolInput.linkedMilestoneId
                    });
                    
                    // If task is linked to a milestone, update the milestone's linkedTaskIds
                    if (toolInput.linkedMilestoneId) {
                        const activeProject = dataService.activeProject;
                        if (activeProject) {
                            const milestone = activeProject.milestones.find((m: any) => m.id === toolInput.linkedMilestoneId);
                            if (milestone) {
                                const currentLinks = milestone.linkedTaskIds || [];
                                if (!currentLinks.includes(task.id)) {
                                    dataService.updateMilestone(activeProject.id, toolInput.linkedMilestoneId, {
                                        linkedTaskIds: [...currentLinks, task.id]
                                    });
                                }
                            }
                        }
                    }
                    
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshTasks');
                    return JSON.stringify({ success: true, id: task.id, title: task.title, linkedMilestoneId: task.linkedMilestoneId });
                }
                
                case 'muxpanel_createMilestone': {
                    // Get the project to add milestone to
                    const projectId = toolInput.projectId || dataService.activeProjectId;
                    
                    if (!projectId) {
                        return JSON.stringify({ 
                            success: false, 
                            error: 'No active project. Create or select a project first, or specify projectId.',
                            availableProjects: dataService.getProjects().map(p => ({ id: p.id, name: p.name }))
                        });
                    }
                    
                    const project = dataService.getProject(projectId);
                    if (!project) {
                        return JSON.stringify({ success: false, error: `Project ${projectId} not found` });
                    }
                    
                    // Add milestone to the project (not as a task)
                    const milestone = dataService.addMilestone(projectId, {
                        name: toolInput.title,
                        description: toolInput.description || '',
                        dueDate: toolInput.dueDate ? new Date(toolInput.dueDate).toISOString() : new Date().toISOString()
                    });
                    
                    // Force immediate save to ensure persistence
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshAll');
                    
                    if (milestone) {
                        return JSON.stringify({ 
                            success: true, 
                            id: milestone.id, 
                            name: milestone.name,
                            dueDate: milestone.dueDate,
                            projectId: projectId,
                            projectName: project.name
                        });
                    }
                    return JSON.stringify({ success: false, error: 'Failed to create milestone' });
                }
                
                case 'muxpanel_createProject': {
                    const project = dataService.addProject({
                        name: toolInput.name,
                        description: toolInput.description || '',
                        startDate: toolInput.startDate || new Date().toISOString(),
                        targetEndDate: toolInput.targetEndDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
                    });
                    if (toolInput.setAsActive) {
                        dataService.setActiveProject(project.id);
                    }
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshProjects');
                    return JSON.stringify({ success: true, id: project.id, name: project.name });
                }
                
                case 'muxpanel_createTraceLink': {
                    const sourceReq = dataService.getRequirements().find(r => r.key === toolInput.sourceKey);
                    if (!sourceReq) {
                        return JSON.stringify({ success: false, error: `Requirement ${toolInput.sourceKey} not found` });
                    }
                    
                    const targetType = mapTraceLinkTargetType(toolInput.targetType || 'requirement');
                    let targetId = toolInput.targetKey;
                    let targetTitle = toolInput.targetKey;
                    
                    if (targetType === TraceLinkTargetType.Requirement) {
                        const targetReq = dataService.getRequirements().find(r => r.key === toolInput.targetKey);
                        if (targetReq) {
                            targetId = targetReq.id;
                            targetTitle = targetReq.title;
                        }
                    } else if (targetType === TraceLinkTargetType.Task) {
                        const targetTask = dataService.getTasks().find(t => t.id === toolInput.targetKey || t.title.includes(toolInput.targetKey));
                        if (targetTask) {
                            targetId = targetTask.id;
                            targetTitle = targetTask.title;
                        }
                    }
                    
                    const link = dataService.addTraceLink(
                        sourceReq.id,
                        targetId,
                        mapTraceLinkType(toolInput.linkType),
                        targetType
                    );
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshRequirements');
                    return JSON.stringify({ success: true, linkId: link?.id, source: toolInput.sourceKey, target: toolInput.targetKey });
                }
                
                case 'muxpanel_createNote': {
                    // Convert requirement keys to IDs
                    let linkedRequirementIds: string[] = [];
                    if (toolInput.linkedRequirementKeys) {
                        linkedRequirementIds = toolInput.linkedRequirementKeys
                            .map((key: string) => dataService.getRequirements().find(r => r.key === key)?.id)
                            .filter((id: string | undefined) => id) as string[];
                    }
                    
                    const note = dataService.addNote({
                        title: toolInput.title,
                        content: toolInput.content || '',
                        category: mapNoteCategory(toolInput.category || 'general'),
                        linkedRequirementIds: linkedRequirementIds,
                        linkedTaskIds: toolInput.linkedTaskIds || [],
                        tags: toolInput.tags || [],
                        isPinned: toolInput.isPinned || false
                    });
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshNotes');
                    return JSON.stringify({ 
                        success: true, 
                        id: note.id, 
                        title: note.title,
                        linkedRequirements: linkedRequirementIds.length,
                        linkedTasks: (toolInput.linkedTaskIds || []).length
                    });
                }
                
                case 'muxpanel_addFollowUp': {
                    dataService.addFollowUp(toolInput.taskId, {
                        content: toolInput.content,
                        dueDate: new Date(toolInput.dueDate).toISOString()
                    });
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshTasks');
                    return JSON.stringify({ success: true, taskId: toolInput.taskId });
                }
                
                case 'muxpanel_updateRequirement': {
                    const req = dataService.getRequirements().find(r => r.key === toolInput.key);
                    if (!req) {
                        return JSON.stringify({ success: false, error: `Requirement ${toolInput.key} not found` });
                    }
                    const updates: any = {};
                    if (toolInput.title) updates.title = toolInput.title;
                    if (toolInput.description) updates.description = toolInput.description;
                    if (toolInput.status) updates.status = mapRequirementStatus(toolInput.status);
                    if (toolInput.priority) updates.priority = mapPriority(toolInput.priority);
                    if (toolInput.type) updates.type = mapRequirementType(toolInput.type);
                    if (toolInput.rationale) updates.rationale = toolInput.rationale;
                    if (toolInput.acceptanceCriteria) updates.acceptanceCriteria = toolInput.acceptanceCriteria;
                    
                    dataService.updateRequirement(req.id, updates, 'copilot-tool');
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshRequirements');
                    return JSON.stringify({ success: true, key: toolInput.key, updated: Object.keys(updates) });
                }
                
                case 'muxpanel_updateTask': {
                    const task = dataService.getTask(toolInput.taskId);
                    if (!task) {
                        return JSON.stringify({ success: false, error: `Task ${toolInput.taskId} not found` });
                    }
                    const updates: any = {};
                    if (toolInput.title) updates.title = toolInput.title;
                    if (toolInput.status) updates.status = mapTaskStatus(toolInput.status);
                    if (toolInput.priority) updates.priority = mapTaskPriority(toolInput.priority);
                    if (toolInput.dueDate) updates.dueDate = new Date(toolInput.dueDate).toISOString();
                    if (toolInput.startDate) updates.startDate = new Date(toolInput.startDate).toISOString();
                    if (toolInput.assignee) updates.assignee = toolInput.assignee;
                    
                    // Handle milestone linking/unlinking
                    if (toolInput.linkedMilestoneId !== undefined) {
                        const activeProject = dataService.activeProject;
                        
                        // Remove from old milestone if changing
                        if (task.linkedMilestoneId && task.linkedMilestoneId !== toolInput.linkedMilestoneId && activeProject) {
                            const oldMilestone = activeProject.milestones.find((m: any) => m.id === task.linkedMilestoneId);
                            if (oldMilestone) {
                                const newLinks = (oldMilestone.linkedTaskIds || []).filter((id: string) => id !== toolInput.taskId);
                                dataService.updateMilestone(activeProject.id, oldMilestone.id, { linkedTaskIds: newLinks });
                            }
                        }
                        
                        // Add to new milestone
                        if (toolInput.linkedMilestoneId && activeProject) {
                            const newMilestone = activeProject.milestones.find((m: any) => m.id === toolInput.linkedMilestoneId);
                            if (newMilestone) {
                                const currentLinks = newMilestone.linkedTaskIds || [];
                                if (!currentLinks.includes(toolInput.taskId)) {
                                    dataService.updateMilestone(activeProject.id, newMilestone.id, {
                                        linkedTaskIds: [...currentLinks, toolInput.taskId]
                                    });
                                }
                            }
                        }
                        
                        updates.linkedMilestoneId = toolInput.linkedMilestoneId || undefined;
                    }
                    
                    dataService.updateTask(toolInput.taskId, updates);
                    dataService.forceSave();
                    vscode.commands.executeCommand('muxpanel.refreshAll');
                    return JSON.stringify({ success: true, taskId: toolInput.taskId, updated: Object.keys(updates) });
                }
                
                case 'muxpanel_deleteItem': {
                    if (toolInput.type === 'requirement') {
                        const req = dataService.getRequirements().find(r => r.key === toolInput.id || r.id === toolInput.id);
                        if (req) {
                            dataService.deleteRequirement(req.id);
                            dataService.forceSave();
                            vscode.commands.executeCommand('muxpanel.refreshRequirements');
                            return JSON.stringify({ success: true, deleted: req.key });
                        }
                    } else if (toolInput.type === 'task') {
                        dataService.deleteTask(toolInput.id);
                        dataService.forceSave();
                        vscode.commands.executeCommand('muxpanel.refreshTasks');
                        return JSON.stringify({ success: true, deleted: toolInput.id });
                    } else if (toolInput.type === 'note') {
                        dataService.deleteNote(toolInput.id);
                        dataService.forceSave();
                        vscode.commands.executeCommand('muxpanel.refreshNotes');
                        return JSON.stringify({ success: true, deleted: toolInput.id });
                    } else if (toolInput.type === 'project') {
                        dataService.deleteProject(toolInput.id);
                        dataService.forceSave();
                        vscode.commands.executeCommand('muxpanel.refreshProjects');
                        return JSON.stringify({ success: true, deleted: toolInput.id });
                    }
                    return JSON.stringify({ success: false, error: 'Item not found' });
                }
                
                case 'muxpanel_switchProject': {
                    const projects = dataService.getProjects();
                    const project = projects.find(p => 
                        p.name.toLowerCase().includes(toolInput.projectName.toLowerCase()) ||
                        p.id === toolInput.projectName
                    );
                    if (project) {
                        dataService.setActiveProject(project.id);
                        vscode.commands.executeCommand('muxpanel.refreshAll');
                        return JSON.stringify({ success: true, activeProject: project.name, id: project.id });
                    }
                    return JSON.stringify({ success: false, error: `Project "${toolInput.projectName}" not found`, available: projects.map(p => p.name) });
                }
                
                case 'muxpanel_getStatus': {
                    const stats = dataService.getStatistics();
                    const activeProject = dataService.activeProject;
                    return JSON.stringify({
                        activeProject: activeProject ? { name: activeProject.name, progress: activeProject.progress } : null,
                        totalRequirements: stats.totalRequirements,
                        totalTasks: stats.totalTasks,
                        totalProjects: stats.totalProjects,
                        overdueTasks: stats.overdueTasks,
                        pendingFollowUps: stats.pendingFollowUps
                    });
                }
                
                case 'muxpanel_listItems': {
                    const limit = toolInput.limit || 20;
                    let items: any[] = [];
                    
                    if (toolInput.type === 'requirements' || toolInput.type === 'all') {
                        const reqs = dataService.getRequirements().slice(0, limit);
                        items.push(...reqs.map(r => ({ type: 'requirement', key: r.key, title: r.title, status: r.status, priority: r.priority })));
                    }
                    if (toolInput.type === 'tasks' || toolInput.type === 'all') {
                        const tasks = dataService.getTasks().slice(0, limit);
                        items.push(...tasks.map(t => ({ 
                            type: 'task', 
                            id: t.id, 
                            title: t.title, 
                            status: t.status, 
                            priority: t.priority, 
                            dueDate: t.dueDate,
                            linkedMilestoneId: t.linkedMilestoneId
                        })));
                    }
                    if (toolInput.type === 'milestones') {
                        // Include project milestones from active project
                        const activeProject = dataService.activeProject;
                        if (activeProject) {
                            const projectMilestones = activeProject.milestones.slice(0, limit);
                            items.push(...projectMilestones.map((m: any) => ({ 
                                type: 'milestone', 
                                id: m.id, 
                                name: m.name, 
                                description: m.description,
                                status: m.status, 
                                dueDate: m.dueDate,
                                linkedTaskIds: m.linkedTaskIds || [],
                                linkedTaskCount: (m.linkedTaskIds || []).length
                            })));
                        }
                    }
                    if (toolInput.type === 'overdue') {
                        const overdue = dataService.getOverdueTasks();
                        items.push(...overdue.map(t => ({ type: 'task', id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })));
                    }
                    if (toolInput.type === 'notes') {
                        const notes = dataService.getNotes().slice(0, limit);
                        items.push(...notes.map(n => ({ type: 'note', id: n.id, title: n.title, category: n.category })));
                    }
                    if (toolInput.type === 'projects') {
                        const projects = dataService.getProjects();
                        items.push(...projects.map(p => ({ 
                            type: 'project', 
                            id: p.id, 
                            name: p.name, 
                            status: p.status, 
                            progress: p.progress,
                            milestoneCount: p.milestones?.length || 0,
                            startDate: p.startDate,
                            targetEndDate: p.targetEndDate
                        })));
                    }
                    
                    return JSON.stringify({ items, count: items.length });
                }
                
                case 'muxpanel_createBaseline': {
                    const reqKeys = toolInput.requirementKeys || [];
                    const reqIds = reqKeys.length > 0 
                        ? dataService.getRequirements().filter(r => reqKeys.includes(r.key)).map(r => r.id)
                        : dataService.getRequirements().map(r => r.id);
                    
                    const baseline = dataService.createBaseline(
                        toolInput.name,
                        reqIds,
                        toolInput.description || ''
                    );
                    return JSON.stringify({ success: true, id: baseline.id, name: baseline.name, requirementCount: reqIds.length });
                }
                
                case 'muxpanel_analyzeImpact': {
                    const req = dataService.getRequirements().find(r => r.key === toolInput.requirementKey);
                    if (!req) {
                        return JSON.stringify({ success: false, error: `Requirement ${toolInput.requirementKey} not found` });
                    }
                    const impact = dataService.analyzeImpact(req.id);
                    const directItems = impact.impactedItems.filter(i => i.depth === 1);
                    const transitiveItems = impact.impactedItems.filter(i => i.depth > 1);
                    return JSON.stringify({
                        requirement: toolInput.requirementKey,
                        directImpact: directItems.length,
                        transitiveImpact: transitiveItems.length,
                        totalImpact: impact.impactedItems.length,
                        impactedItems: impact.impactedItems.map(i => ({ title: i.title, depth: i.depth, linkType: i.linkType }))
                    });
                }
                
                // ============================================================
                // SCHEDULE & MILESTONE TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_linkTaskToMilestone': {
                    const task = dataService.getTask(toolInput.taskId);
                    if (!task) {
                        return JSON.stringify({ success: false, error: `Task ${toolInput.taskId} not found` });
                    }
                    
                    const activeProject = dataService.activeProject;
                    if (!activeProject) {
                        return JSON.stringify({ success: false, error: 'No active project. Select a project first.' });
                    }
                    
                    const milestone = activeProject.milestones.find((m: any) => m.id === toolInput.milestoneId);
                    if (!milestone) {
                        return JSON.stringify({ 
                            success: false, 
                            error: `Milestone ${toolInput.milestoneId} not found`,
                            availableMilestones: activeProject.milestones.map((m: any) => ({ id: m.id, name: m.name }))
                        });
                    }
                    
                    // Update task's linkedMilestoneId
                    dataService.updateTask(toolInput.taskId, { linkedMilestoneId: toolInput.milestoneId });
                    
                    // Update milestone's linkedTaskIds
                    const currentLinks = milestone.linkedTaskIds || [];
                    if (!currentLinks.includes(toolInput.taskId)) {
                        dataService.updateMilestone(activeProject.id, toolInput.milestoneId, {
                            linkedTaskIds: [...currentLinks, toolInput.taskId]
                        });
                    }
                    
                    vscode.commands.executeCommand('muxpanel.refreshAll');
                    return JSON.stringify({ 
                        success: true, 
                        taskId: toolInput.taskId, 
                        taskTitle: task.title,
                        milestoneId: toolInput.milestoneId,
                        milestoneName: milestone.name
                    });
                }
                
                case 'muxpanel_unlinkTaskFromMilestone': {
                    const task = dataService.getTask(toolInput.taskId);
                    if (!task) {
                        return JSON.stringify({ success: false, error: `Task ${toolInput.taskId} not found` });
                    }
                    
                    if (!task.linkedMilestoneId) {
                        return JSON.stringify({ success: false, error: 'Task is not linked to any milestone' });
                    }
                    
                    const activeProject = dataService.activeProject;
                    if (activeProject) {
                        const milestone = activeProject.milestones.find((m: any) => m.id === task.linkedMilestoneId);
                        if (milestone) {
                            const newLinks = (milestone.linkedTaskIds || []).filter((id: string) => id !== toolInput.taskId);
                            dataService.updateMilestone(activeProject.id, milestone.id, { linkedTaskIds: newLinks });
                        }
                    }
                    
                    dataService.updateTask(toolInput.taskId, { linkedMilestoneId: undefined });
                    vscode.commands.executeCommand('muxpanel.refreshAll');
                    return JSON.stringify({ success: true, taskId: toolInput.taskId });
                }
                
                case 'muxpanel_updateMilestone': {
                    const activeProject = dataService.activeProject;
                    if (!activeProject) {
                        return JSON.stringify({ success: false, error: 'No active project. Select a project first.' });
                    }
                    
                    const milestone = activeProject.milestones.find((m: any) => m.id === toolInput.milestoneId);
                    if (!milestone) {
                        return JSON.stringify({ 
                            success: false, 
                            error: `Milestone ${toolInput.milestoneId} not found`,
                            availableMilestones: activeProject.milestones.map((m: any) => ({ id: m.id, name: m.name }))
                        });
                    }
                    
                    const updates: any = {};
                    if (toolInput.name) updates.name = toolInput.name;
                    if (toolInput.description) updates.description = toolInput.description;
                    if (toolInput.dueDate) updates.dueDate = new Date(toolInput.dueDate).toISOString();
                    if (toolInput.status) updates.status = mapMilestoneStatus(toolInput.status);
                    
                    const result = dataService.updateMilestone(activeProject.id, toolInput.milestoneId, updates);
                    
                    if (result) {
                        dataService.forceSave();
                        vscode.commands.executeCommand('muxpanel.refreshAll');
                        return JSON.stringify({ 
                            success: true, 
                            milestone: { id: result.id, name: result.name, dueDate: result.dueDate, status: result.status },
                            updated: Object.keys(updates)
                        });
                    }
                    vscode.commands.executeCommand('muxpanel.refreshAll');
                    return JSON.stringify({ success: false, error: 'Failed to update milestone' });
                }
                
                case 'muxpanel_getSchedule': {
                    const activeProject = dataService.activeProject;
                    if (!activeProject) {
                        return JSON.stringify({ 
                            success: false, 
                            error: 'No active project',
                            availableProjects: dataService.getProjects().map(p => ({ id: p.id, name: p.name }))
                        });
                    }
                    
                    const tasks = dataService.getTasksByActiveProject();
                    const includeCompleted = toolInput.includeCompleted || false;
                    
                    const filteredTasks = includeCompleted 
                        ? tasks 
                        : tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
                    
                    const filteredMilestones = includeCompleted
                        ? activeProject.milestones
                        : activeProject.milestones.filter((m: any) => m.status !== 'completed' && m.status !== 'cancelled');
                    
                    const schedule = {
                        project: {
                            id: activeProject.id,
                            name: activeProject.name,
                            startDate: activeProject.startDate,
                            targetEndDate: activeProject.targetEndDate,
                            status: activeProject.status,
                            progress: activeProject.progress
                        },
                        milestones: filteredMilestones.map((m: any) => {
                            const linkedTasks = filteredTasks.filter(t => t.linkedMilestoneId === m.id);
                            const completedTasks = linkedTasks.filter(t => t.status === 'done').length;
                            return {
                                id: m.id,
                                name: m.name,
                                dueDate: m.dueDate,
                                status: m.status,
                                linkedTaskCount: linkedTasks.length,
                                completedTaskCount: completedTasks,
                                linkedTasks: linkedTasks.map(t => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate }))
                            };
                        }).sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
                        unassignedTasks: filteredTasks.filter(t => !t.linkedMilestoneId).map(t => ({
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            dueDate: t.dueDate,
                            priority: t.priority
                        })),
                        totalTasks: filteredTasks.length,
                        totalMilestones: filteredMilestones.length
                    };
                    
                    return JSON.stringify({ success: true, schedule });
                }
                
                case 'muxpanel_getTasksByMilestone': {
                    const activeProject = dataService.activeProject;
                    if (!activeProject) {
                        return JSON.stringify({ success: false, error: 'No active project' });
                    }
                    
                    const milestone = activeProject.milestones.find((m: any) => m.id === toolInput.milestoneId);
                    if (!milestone) {
                        return JSON.stringify({ success: false, error: `Milestone ${toolInput.milestoneId} not found` });
                    }
                    
                    const tasks = dataService.getTasksByMilestone(toolInput.milestoneId);
                    return JSON.stringify({
                        success: true,
                        milestone: { id: milestone.id, name: milestone.name, dueDate: milestone.dueDate, status: milestone.status },
                        tasks: tasks.map(t => ({
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            priority: t.priority,
                            dueDate: t.dueDate,
                            assignee: t.assignee
                        })),
                        taskCount: tasks.length
                    });
                }
                
                case 'muxpanel_analyzeScheduleRisks': {
                    const activeProject = dataService.activeProject;
                    if (!activeProject) {
                        return JSON.stringify({ success: false, error: 'No active project' });
                    }
                    
                    const tasks = dataService.getTasksByActiveProject();
                    const now = new Date();
                    
                    // Overdue tasks
                    const overdueTasks = tasks.filter(t => {
                        if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') return false;
                        return new Date(t.dueDate) < now;
                    });
                    
                    // Tasks due soon (within 7 days)
                    const dueSoonTasks = tasks.filter(t => {
                        if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') return false;
                        const dueDate = new Date(t.dueDate);
                        const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                        return daysUntilDue >= 0 && daysUntilDue <= 7;
                    });
                    
                    // Milestones at risk
                    const milestonesAtRisk = activeProject.milestones.filter((m: any) => {
                        if (m.status === 'completed' || m.status === 'cancelled') return false;
                        const linkedTasks = tasks.filter(t => t.linkedMilestoneId === m.id);
                        const incompleteTasks = linkedTasks.filter(t => t.status !== 'done');
                        const overdueInMilestone = incompleteTasks.filter(t => t.dueDate && new Date(t.dueDate) < now);
                        return overdueInMilestone.length > 0 || (incompleteTasks.length > 0 && new Date(m.dueDate) < now);
                    });
                    
                    // Blocked tasks
                    const blockedTasks = tasks.filter(t => t.status === 'blocked');
                    
                    // Unassigned tasks with due dates
                    const unassignedWithDueDate = tasks.filter(t => 
                        !t.linkedMilestoneId && 
                        t.dueDate && 
                        t.status !== 'done' && 
                        t.status !== 'cancelled'
                    );
                    
                    return JSON.stringify({
                        success: true,
                        risks: {
                            overdueTasks: overdueTasks.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
                            dueSoonTasks: dueSoonTasks.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
                            milestonesAtRisk: milestonesAtRisk.map((m: any) => ({ id: m.id, name: m.name, dueDate: m.dueDate })),
                            blockedTasks: blockedTasks.map(t => ({ id: t.id, title: t.title })),
                            unassignedTasks: unassignedWithDueDate.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate }))
                        },
                        summary: {
                            overdueCount: overdueTasks.length,
                            dueSoonCount: dueSoonTasks.length,
                            milestonesAtRiskCount: milestonesAtRisk.length,
                            blockedCount: blockedTasks.length,
                            unassignedCount: unassignedWithDueDate.length,
                            totalRiskItems: overdueTasks.length + milestonesAtRisk.length + blockedTasks.length
                        }
                    });
                }
                
                // ============================================================
                // PROJECT MANAGEMENT TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_updateProject': {
                    const projectId = toolInput.projectId || dataService.activeProjectId;
                    if (!projectId) {
                        return JSON.stringify({ success: false, error: 'No project specified and no active project' });
                    }
                    
                    const project = dataService.getProject(projectId);
                    if (!project) {
                        return JSON.stringify({ success: false, error: `Project ${projectId} not found` });
                    }
                    
                    const updates: any = {};
                    if (toolInput.name) updates.name = toolInput.name;
                    if (toolInput.description) updates.description = toolInput.description;
                    if (toolInput.status) updates.status = toolInput.status;
                    if (toolInput.startDate) updates.startDate = new Date(toolInput.startDate).toISOString();
                    if (toolInput.targetEndDate) updates.targetEndDate = new Date(toolInput.targetEndDate).toISOString();
                    
                    const result = dataService.updateProject(projectId, updates);
                    
                    if (result) {
                        dataService.forceSave();
                        vscode.commands.executeCommand('muxpanel.refreshAll');
                        return JSON.stringify({ 
                            success: true, 
                            project: { id: result.id, name: result.name, status: result.status },
                            updated: Object.keys(updates)
                        });
                    }
                    vscode.commands.executeCommand('muxpanel.refreshAll');
                    return JSON.stringify({ success: false, error: 'Failed to update project' });
                }
                
                case 'muxpanel_getProject': {
                    const projectId = toolInput.projectId || dataService.activeProjectId;
                    if (!projectId) {
                        return JSON.stringify({ 
                            success: false, 
                            error: 'No project specified and no active project',
                            availableProjects: dataService.getProjects().map(p => ({ id: p.id, name: p.name }))
                        });
                    }
                    
                    const project = dataService.getProject(projectId);
                    if (!project) {
                        return JSON.stringify({ success: false, error: `Project ${projectId} not found` });
                    }
                    
                    const tasks = dataService.getTasksByProject(projectId);
                    const requirements = dataService.getRequirementsByProject(projectId);
                    
                    return JSON.stringify({
                        success: true,
                        project: {
                            id: project.id,
                            name: project.name,
                            description: project.description,
                            status: project.status,
                            startDate: project.startDate,
                            targetEndDate: project.targetEndDate,
                            progress: project.progress,
                            milestones: project.milestones.map((m: any) => ({
                                id: m.id,
                                name: m.name,
                                dueDate: m.dueDate,
                                status: m.status,
                                linkedTaskCount: (m.linkedTaskIds || []).length
                            })),
                            taskCount: tasks.length,
                            completedTaskCount: tasks.filter(t => t.status === 'done').length,
                            requirementCount: requirements.length
                        }
                    });
                }
                
                // ============================================================
                // SUBTASK TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_createSubtask': {
                    const parentTask = dataService.getTask(toolInput.parentTaskId);
                    if (!parentTask) {
                        return JSON.stringify({ success: false, error: `Parent task ${toolInput.parentTaskId} not found` });
                    }
                    
                    const subtask = dataService.addTask({
                        title: toolInput.title,
                        description: toolInput.description || '',
                        priority: mapTaskPriority(toolInput.priority || 'medium'),
                        dueDate: toolInput.dueDate ? new Date(toolInput.dueDate).toISOString() : undefined,
                        assignee: toolInput.assignee,
                        parentTaskId: toolInput.parentTaskId,
                        projectId: parentTask.projectId
                    });
                    
                    vscode.commands.executeCommand('muxpanel.refreshTasks');
                    return JSON.stringify({ 
                        success: true, 
                        id: subtask.id, 
                        title: subtask.title,
                        parentTaskId: subtask.parentTaskId
                    });
                }
                
                case 'muxpanel_getSubtasks': {
                    const parentTask = dataService.getTask(toolInput.parentTaskId);
                    if (!parentTask) {
                        return JSON.stringify({ success: false, error: `Parent task ${toolInput.parentTaskId} not found` });
                    }
                    
                    const subtasks = dataService.getSubtasks(toolInput.parentTaskId);
                    return JSON.stringify({
                        success: true,
                        parentTask: { id: parentTask.id, title: parentTask.title },
                        subtasks: subtasks.map(t => ({
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            priority: t.priority,
                            dueDate: t.dueDate
                        })),
                        count: subtasks.length
                    });
                }
                
                // ============================================================
                // REQUIREMENT TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_getRequirement': {
                    const req = dataService.getRequirements().find(r => r.key === toolInput.key);
                    if (!req) {
                        return JSON.stringify({ success: false, error: `Requirement ${toolInput.key} not found` });
                    }
                    
                    return JSON.stringify({
                        success: true,
                        requirement: {
                            id: req.id,
                            key: req.key,
                            title: req.title,
                            description: req.description,
                            type: req.type,
                            status: req.status,
                            priority: req.priority,
                            rationale: req.rationale,
                            acceptanceCriteria: req.acceptanceCriteria,
                            parentId: req.parentId,
                            children: req.children,
                            traces: req.traces?.map(t => ({
                                targetId: t.targetId,
                                linkType: t.linkType,
                                targetType: t.targetType,
                                isSuspect: t.isSuspect
                            })) || [],
                            projectId: req.projectId
                        }
                    });
                }
                
                case 'muxpanel_getChildRequirements': {
                    const parentReq = dataService.getRequirements().find(r => r.key === toolInput.parentKey);
                    if (!parentReq) {
                        return JSON.stringify({ success: false, error: `Requirement ${toolInput.parentKey} not found` });
                    }
                    
                    const children = dataService.getChildRequirements(parentReq.id);
                    return JSON.stringify({
                        success: true,
                        parentRequirement: { key: parentReq.key, title: parentReq.title },
                        children: children.map(r => ({
                            key: r.key,
                            title: r.title,
                            status: r.status,
                            type: r.type
                        })),
                        count: children.length
                    });
                }
                
                // ============================================================
                // FOLLOW-UP TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_completeFollowUp': {
                    const result = dataService.completeFollowUp(toolInput.taskId, toolInput.followUpId);
                    if (result) {
                        vscode.commands.executeCommand('muxpanel.refreshTasks');
                        return JSON.stringify({ success: true, taskId: toolInput.taskId, followUpId: toolInput.followUpId });
                    }
                    return JSON.stringify({ success: false, error: 'Follow-up not found or already completed' });
                }
                
                case 'muxpanel_getFollowUps': {
                    const allFollowUps = dataService.getPendingFollowUps();
                    const tasks = dataService.getTasks();
                    
                    let followUps = allFollowUps;
                    if (!toolInput.includeCompleted) {
                        followUps = allFollowUps.filter(f => !f.followUp.completed);
                    }
                    
                    return JSON.stringify({
                        success: true,
                        followUps: followUps.map(f => ({
                            followUpId: f.followUp.id,
                            content: f.followUp.content,
                            dueDate: f.followUp.dueDate,
                            completed: f.followUp.completed,
                            taskId: f.task.id,
                            taskTitle: f.task.title
                        })),
                        count: followUps.length
                    });
                }
                
                // ============================================================
                // NOTE TOOL HANDLERS
                // ============================================================
                
                case 'muxpanel_updateNote': {
                    const note = dataService.getNote(toolInput.noteId);
                    if (!note) {
                        return JSON.stringify({ success: false, error: `Note ${toolInput.noteId} not found` });
                    }
                    
                    const updates: any = {};
                    if (toolInput.title) updates.title = toolInput.title;
                    if (toolInput.content !== undefined) updates.content = toolInput.content;
                    if (toolInput.category) updates.category = mapNoteCategory(toolInput.category);
                    if (toolInput.tags) updates.tags = toolInput.tags;
                    if (toolInput.isPinned !== undefined) updates.isPinned = toolInput.isPinned;
                    
                    // Handle requirement linking
                    if (toolInput.linkedRequirementKeys) {
                        const reqIds = toolInput.linkedRequirementKeys
                            .map((key: string) => dataService.getRequirements().find(r => r.key === key)?.id)
                            .filter((id: string | undefined) => id);
                        updates.linkedRequirementIds = reqIds;
                    }
                    
                    // Handle task linking
                    if (toolInput.linkedTaskIds) {
                        updates.linkedTaskIds = toolInput.linkedTaskIds;
                    }
                    
                    const result = dataService.updateNote(toolInput.noteId, updates);
                    
                    if (result) {
                        dataService.forceSave();
                        vscode.commands.executeCommand('muxpanel.refreshNotes');
                        return JSON.stringify({ 
                            success: true, 
                            noteId: result.id, 
                            title: result.title,
                            updated: Object.keys(updates)
                        });
                    }
                    vscode.commands.executeCommand('muxpanel.refreshNotes');
                    return JSON.stringify({ success: false, error: 'Failed to update note' });
                }
                
                default:
                    return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
            }
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }

    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> => {
        
        // Check workspace
        if (!dataService.hasWorkspace()) {
            stream.markdown('⚠️ **No workspace folder open.** Please open a folder first to use Muxpanel.\n\n');
            stream.markdown('Use `File > Open Folder` or `Cmd+O` to open a workspace.');
            return { metadata: { command: 'error' } };
        }

        // ====================================================================
        // UNIFIED INTELLIGENT HANDLER
        // All requests go through the smart handler - no command required!
        // The handler automatically understands intent from natural language.
        // ====================================================================
        
        try {
            // Always use the intelligent handler - it understands natural language
            // Commands are still supported for users who prefer them, but not required
            return await handleSmartRequest(request, chatContext, stream, dataService, token, executeToolCall);
        } catch (error) {
            stream.markdown(`❌ **Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
            return { metadata: { command: 'error' } };
        }
    };

    // Create the chat participant
    const participant = vscode.chat.createChatParticipant('muxpanel.assistant', handler);
    participant.iconPath = new vscode.ThemeIcon('project');

    // Register followup provider for contextual suggestions (no commands required!)
    participant.followupProvider = {
        provideFollowups(result: vscode.ChatResult, _context: vscode.ChatContext, _token: vscode.CancellationToken) {
            const followups: vscode.ChatFollowup[] = [];
            const intent = result.metadata?.intent;
            const command = result.metadata?.command;
            
            // Suggest natural language follow-ups based on what was just done
            if (intent === 'create' || command === 'create' || command === 'bulk' || command === 'plan') {
                followups.push({ prompt: 'Show me all my tasks' });
                followups.push({ prompt: 'What\'s the project status?' });
                followups.push({ prompt: 'Add milestones to this project' });
            } else if (intent === 'update' || command === 'update') {
                followups.push({ prompt: 'Show me all requirements' });
                followups.push({ prompt: 'What tasks are still pending?' });
            } else if (intent === 'query' || command === 'list' || command === 'status') {
                followups.push({ prompt: 'Show overdue tasks' });
                followups.push({ prompt: 'What\'s the schedule looking like?' });
                followups.push({ prompt: 'Create a new task' });
            } else if (intent === 'delete') {
                followups.push({ prompt: 'Show me all tasks' });
                followups.push({ prompt: 'What requirements do we have?' });
            } else if (command === 'schedule') {
                followups.push({ prompt: 'Add another milestone' });
                followups.push({ prompt: 'Create tasks for the next milestone' });
                followups.push({ prompt: 'What are the schedule risks?' });
            } else if (command === 'trace') {
                followups.push({ prompt: 'Check test coverage' });
                followups.push({ prompt: 'Find suspect trace links' });
            } else {
                // Default suggestions
                followups.push({ prompt: 'What\'s my project status?' });
                followups.push({ prompt: 'Show me overdue tasks' });
                followups.push({ prompt: 'Create a new task' });
            }
            
            return followups;
        }
    };

    context.subscriptions.push(participant);
    return participant;
}

// Helper to create a single requirement
function createSingleRequirement(data: any, dataService: DataService): { key: string; title: string; type: string } {
    const req = dataService.addRequirement({
        title: data.title,
        description: data.description || '',
        type: mapRequirementType(data.reqType || data.type),
        priority: mapPriority(data.priority),
        rationale: data.rationale || '',
        acceptanceCriteria: data.acceptanceCriteria || ''
    });
    return { key: req.key, title: req.title, type: req.type };
}

// Helper to create a single task
function createSingleTask(data: any, dataService: DataService): { title: string; priority: string } {
    const task = dataService.addTask({
        title: data.title,
        description: data.description || '',
        priority: mapTaskPriority(data.priority),
        dueDate: data.dueDate || undefined
    });
    return { title: task.title, priority: task.priority };
}

// Handle /create command - supports single or multiple items
async function handleCreate(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    
    stream.progress('Analyzing your request...');
    
    // Use LLM to parse the creation request - support arrays for multiple items
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are helping create items in a systems engineering tool.
Parse this request and return ONLY a JSON object or array.

Request: "${request.prompt}"

IMPORTANT: If the user asks to create MULTIPLE items, return an ARRAY of objects.
If creating a single item, return a single object.

Return JSON in these formats:

For single requirement:
{"type": "requirement", "title": "...", "description": "...", "reqType": "functional|non-functional|interface|constraint|business|system|software|hardware|performance|safety|security", "priority": "critical|high|medium|low", "rationale": "...", "acceptanceCriteria": "..."}

For MULTIPLE requirements (return as array):
[
  {"type": "requirement", "title": "...", "description": "...", "reqType": "functional", "priority": "high"},
  {"type": "requirement", "title": "...", "description": "...", "reqType": "functional", "priority": "medium"},
  ...
]

For task: {"type": "task", "title": "...", "description": "...", "priority": "urgent|high|medium|low", "dueDate": "YYYY-MM-DD or null"}
For note: {"type": "note", "title": "...", "content": "...", "category": "general|meeting-notes|decision|technical-note|review|idea|issue"}
For project: {"type": "project", "name": "...", "description": "...", "startDate": "YYYY-MM-DD", "targetEndDate": "YYYY-MM-DD"}

Be thorough - if the user asks for a complete set of requirements (e.g., "requirements for a login system"), generate ALL relevant requirements (authentication, authorization, session management, password policies, etc.).

Only return the JSON, no explanation.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        // Parse the JSON response - could be array or object
        const jsonMatch = responseText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (!jsonMatch) {
            stream.markdown('I couldn\'t understand what you want to create. Please try:\n\n');
            stream.markdown('- `@muxpanel /create a requirement for user login functionality`\n');
            stream.markdown('- `@muxpanel /create all requirements for a user authentication system`\n');
            stream.markdown('- `@muxpanel /create 5 tasks for sprint planning`\n');
            return { metadata: { command: 'create' } };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        
        const createdItems: { type: string; key?: string; title: string }[] = [];
        
        stream.progress(`Creating ${items.length} item(s)...`);
        
        for (const item of items) {
            switch (item.type) {
                case 'requirement': {
                    const result = createSingleRequirement(item, dataService);
                    createdItems.push({ type: 'requirement', key: result.key, title: result.title });
                    break;
                }
                case 'task': {
                    const result = createSingleTask(item, dataService);
                    createdItems.push({ type: 'task', title: result.title });
                    break;
                }
                case 'note': {
                    const note = dataService.addNote({
                        title: item.title,
                        content: item.content || '',
                        category: mapNoteCategory(item.category)
                    });
                    createdItems.push({ type: 'note', title: note.title });
                    break;
                }
                case 'project': {
                    const project = dataService.addProject({
                        name: item.name,
                        description: item.description || '',
                        startDate: item.startDate || new Date().toISOString(),
                        targetEndDate: item.targetEndDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
                    });
                    createdItems.push({ type: 'project', title: project.name });
                    break;
                }
            }
        }
        
        // Display results
        if (createdItems.length === 1) {
            const item = createdItems[0];
            stream.markdown(`✅ **${item.type.charAt(0).toUpperCase() + item.type.slice(1)} Created!**\n\n`);
            if (item.key) {
                stream.markdown(`- **Key:** \`${item.key}\`\n`);
            }
            stream.markdown(`- **Title:** ${item.title}\n`);
        } else {
            stream.markdown(`✅ **Created ${createdItems.length} items!**\n\n`);
            
            const byType: Record<string, typeof createdItems> = {};
            for (const item of createdItems) {
                if (!byType[item.type]) { byType[item.type] = []; }
                byType[item.type].push(item);
            }
            
            for (const [type, typeItems] of Object.entries(byType)) {
                stream.markdown(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s (${typeItems.length})\n\n`);
                stream.markdown('| Key | Title |\n|-----|-------|\n');
                for (const item of typeItems) {
                    stream.markdown(`| \`${item.key || '-'}\` | ${item.title} |\n`);
                }
                stream.markdown('\n');
            }
        }

        // Refresh views
        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'create' } };
}

// Handle /bulk command - for large-scale operations
async function handleBulk(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    
    stream.progress('Analyzing bulk operation request...');
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are a systems engineering expert creating items in Muxpanel.
Parse this bulk operation request and return a JSON object with an "items" array.

Request: "${request.prompt}"

Return JSON with this structure:
{
  "operation": "create" | "update" | "delete",
  "items": [
    { "type": "requirement", "title": "...", "description": "...", "reqType": "functional|non-functional|interface|constraint|business|system|software|hardware|performance|safety|security", "priority": "critical|high|medium|low", "rationale": "...", "acceptanceCriteria": "..." },
    ...
  ]
}

GUIDELINES for generating requirements:
- Be comprehensive - if asked for requirements for a feature, think of ALL aspects
- Include functional requirements (what the system does)
- Include non-functional requirements (performance, security, usability)
- Include interface requirements (how it connects to other systems)
- Include constraint requirements (limitations, regulations)
- Each requirement should be atomic and verifiable
- Use clear, testable language
- Number them logically within the JSON

For a typical feature, generate 10-20 requirements covering:
1. Core functionality (3-5 requirements)
2. Input validation (2-3 requirements)
3. Security aspects (2-3 requirements)
4. Performance (1-2 requirements)
5. Error handling (2-3 requirements)
6. User interface (1-2 requirements)
7. Integration points (1-2 requirements)

Only return the JSON, no explanation.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not parse bulk operation. Please describe what items you want to create.\n\n');
            stream.markdown('Example: `@muxpanel /bulk create all requirements for a user registration system`');
            return { metadata: { command: 'bulk' } };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const items = parsed.items || [];
        
        if (items.length === 0) {
            stream.markdown('❌ No items found in the request. Please be more specific.');
            return { metadata: { command: 'bulk' } };
        }

        stream.progress(`Processing ${items.length} items...`);
        
        const created: { type: string; key?: string; title: string }[] = [];
        
        for (const item of items) {
            if (item.type === 'requirement') {
                const result = createSingleRequirement(item, dataService);
                created.push({ type: 'requirement', key: result.key, title: result.title });
            } else if (item.type === 'task') {
                const result = createSingleTask(item, dataService);
                created.push({ type: 'task', title: result.title });
            } else if (item.type === 'note') {
                const note = dataService.addNote({
                    title: item.title,
                    content: item.content || '',
                    category: mapNoteCategory(item.category)
                });
                created.push({ type: 'note', title: note.title });
            }
        }

        stream.markdown(`## ✅ Bulk Operation Complete!\n\n`);
        stream.markdown(`**Created ${created.length} items**\n\n`);
        
        // Group by type
        const byType: Record<string, typeof created> = {};
        for (const item of created) {
            if (!byType[item.type]) { byType[item.type] = []; }
            byType[item.type].push(item);
        }
        
        for (const [type, typeItems] of Object.entries(byType)) {
            stream.markdown(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s (${typeItems.length})\n\n`);
            stream.markdown('| # | Key | Title |\n|---|-----|-------|\n');
            typeItems.forEach((item, i) => {
                stream.markdown(`| ${i + 1} | \`${item.key || '-'}\` | ${item.title} |\n`);
            });
            stream.markdown('\n');
        }

        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'bulk' } };
}

// Handle /update command - modify existing items
async function handleUpdate(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    
    stream.progress('Analyzing update request...');
    
    // Get current items for context
    const requirements = dataService.getRequirements();
    const tasks = dataService.getTasks();
    
    const reqList = requirements.slice(0, 30).map(r => `${r.key}: ${r.title}`).join('\n');
    const taskList = tasks.slice(0, 20).map(t => `${t.id}: ${t.title}`).join('\n');
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are updating items in Muxpanel.

EXISTING REQUIREMENTS:
${reqList || 'None'}

EXISTING TASKS:
${taskList || 'None'}

Parse this update request: "${request.prompt}"

Return JSON with updates to apply:
{
  "updates": [
    {
      "type": "requirement" | "task",
      "key": "REQ-001" | "task-id",
      "changes": {
        "title": "new title (optional)",
        "description": "new description (optional)",
        "status": "draft|in-review|approved|active|deprecated|rejected (optional)",
        "priority": "critical|high|medium|low (optional)"
      }
    }
  ]
}

If user says "mark all requirements as approved", update ALL requirements.
If user says "set priority to high for all security requirements", find security-related ones and update.

Only return the JSON.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not parse update request.\n\n');
            stream.markdown('Examples:\n');
            stream.markdown('- `@muxpanel /update mark REQ-001 as approved`\n');
            stream.markdown('- `@muxpanel /update set all security requirements to high priority`\n');
            stream.markdown('- `@muxpanel /update change status of all draft requirements to in-review`\n');
            return { metadata: { command: 'update' } };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const updates = parsed.updates || [];
        
        if (updates.length === 0) {
            stream.markdown('❌ No updates identified. Please specify which items to update.');
            return { metadata: { command: 'update' } };
        }

        stream.progress(`Applying ${updates.length} update(s)...`);
        
        let successCount = 0;
        const results: { key: string; changes: string[] }[] = [];
        
        for (const update of updates) {
            if (update.type === 'requirement') {
                const req = requirements.find(r => r.key === update.key || r.id === update.key);
                if (req) {
                    const changes: string[] = [];
                    const updates: Partial<typeof req> = {};
                    
                    if (update.changes.title) {
                        updates.title = update.changes.title;
                        changes.push(`title → "${update.changes.title}"`);
                    }
                    if (update.changes.description) {
                        updates.description = update.changes.description;
                        changes.push('description updated');
                    }
                    if (update.changes.status) {
                        updates.status = mapRequirementStatus(update.changes.status);
                        changes.push(`status → ${update.changes.status}`);
                    }
                    if (update.changes.priority) {
                        updates.priority = mapPriority(update.changes.priority);
                        changes.push(`priority → ${update.changes.priority}`);
                    }
                    
                    dataService.updateRequirement(req.id, updates, 'chat-participant');
                    successCount++;
                    results.push({ key: req.key, changes });
                }
            } else if (update.type === 'task') {
                const task = tasks.find(t => t.id === update.key);
                if (task) {
                    const changes: string[] = [];
                    const updates: Partial<typeof task> = {};
                    
                    if (update.changes.title) {
                        updates.title = update.changes.title;
                        changes.push(`title → "${update.changes.title}"`);
                    }
                    if (update.changes.status) {
                        updates.status = mapTaskStatus(update.changes.status);
                        changes.push(`status → ${update.changes.status}`);
                    }
                    if (update.changes.priority) {
                        updates.priority = mapTaskPriority(update.changes.priority);
                        changes.push(`priority → ${update.changes.priority}`);
                    }
                    
                    dataService.updateTask(task.id, updates);
                    successCount++;
                    results.push({ key: task.id, changes });
                }
            }
        }

        stream.markdown(`## ✅ Updated ${successCount} item(s)\n\n`);
        stream.markdown('| Item | Changes |\n|------|--------|\n');
        for (const result of results) {
            stream.markdown(`| \`${result.key}\` | ${result.changes.join(', ')} |\n`);
        }

        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'update' } };
}

// Handle /delete command - remove items
async function handleDelete(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    
    stream.progress('Analyzing delete request...');
    
    const requirements = dataService.getRequirements();
    const tasks = dataService.getTasks();
    const notes = dataService.getNotes();
    
    const reqList = requirements.slice(0, 30).map(r => `${r.key}: ${r.title}`).join('\n');
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are deleting items in Muxpanel.

EXISTING REQUIREMENTS:
${reqList || 'None'}

Parse this delete request: "${request.prompt}"

Return JSON with items to delete:
{
  "items": [
    { "type": "requirement", "key": "REQ-001" },
    { "type": "task", "id": "..." },
    { "type": "note", "id": "..." }
  ],
  "deleteAll": false,
  "deleteAllType": null
}

If user wants to delete ALL items of a type, set deleteAll: true and deleteAllType to "requirements", "tasks", or "notes".

Only return the JSON.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not parse delete request.\n\n');
            stream.markdown('Examples:\n');
            stream.markdown('- `@muxpanel /delete REQ-001`\n');
            stream.markdown('- `@muxpanel /delete all deprecated requirements`\n');
            return { metadata: { command: 'delete' } };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        let deletedCount = 0;
        const deletedItems: string[] = [];
        
        if (parsed.deleteAll && parsed.deleteAllType) {
            // Bulk delete all of a type
            switch (parsed.deleteAllType) {
                case 'requirements':
                    for (const req of [...requirements]) {
                        dataService.deleteRequirement(req.id);
                        deletedItems.push(req.key);
                        deletedCount++;
                    }
                    break;
                case 'tasks':
                    for (const task of [...tasks]) {
                        dataService.deleteTask(task.id);
                        deletedItems.push(task.title);
                        deletedCount++;
                    }
                    break;
                case 'notes':
                    for (const note of [...notes]) {
                        dataService.deleteNote(note.id);
                        deletedItems.push(note.title);
                        deletedCount++;
                    }
                    break;
            }
        } else {
            // Delete specific items
            for (const item of (parsed.items || [])) {
                if (item.type === 'requirement') {
                    const req = requirements.find(r => r.key === item.key || r.id === item.key);
                    if (req) {
                        dataService.deleteRequirement(req.id);
                        deletedItems.push(req.key);
                        deletedCount++;
                    }
                } else if (item.type === 'task') {
                    const task = tasks.find(t => t.id === item.id);
                    if (task) {
                        dataService.deleteTask(task.id);
                        deletedItems.push(task.title);
                        deletedCount++;
                    }
                } else if (item.type === 'note') {
                    const note = notes.find(n => n.id === item.id);
                    if (note) {
                        dataService.deleteNote(note.id);
                        deletedItems.push(note.title);
                        deletedCount++;
                    }
                }
            }
        }

        if (deletedCount === 0) {
            stream.markdown('❌ No items were deleted. Make sure the items exist.');
        } else {
            stream.markdown(`## 🗑️ Deleted ${deletedCount} item(s)\n\n`);
            for (const item of deletedItems) {
                stream.markdown(`- ~~${item}~~\n`);
            }
        }

        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'delete' } };
}

// Handle /schedule command - comprehensive schedule management
async function handleSchedule(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    
    const prompt = request.prompt.toLowerCase();
    const activeProject = dataService.activeProject;
    
    // Get all projects and their milestones for context
    const projects = dataService.getProjects();
    const tasks = dataService.getTasks();
    
    // Determine what the user wants to do
    if (prompt.includes('timeline') || prompt.includes('view') || prompt.includes('show') || prompt.includes('gantt')) {
        return await showScheduleTimeline(stream, dataService, activeProject, projects, tasks);
    }
    
    if (prompt.includes('risk') || prompt.includes('delay') || prompt.includes('overdue') || prompt.includes('late')) {
        return await analyzeScheduleRisks(stream, dataService, activeProject, projects, tasks);
    }
    
    if (prompt.includes('shift') || prompt.includes('move') || prompt.includes('reschedule') || prompt.includes('postpone') || prompt.includes('adjust date')) {
        return await rescheduleItems(request, stream, dataService, token, activeProject, projects);
    }
    
    if (prompt.includes('link') || prompt.includes('assign task') || prompt.includes('connect task')) {
        return await linkTasksToMilestones(request, stream, dataService, token, activeProject, tasks);
    }
    
    // Handle empty prompt - show help
    if (!request.prompt.trim()) {
        return showScheduleHelp(stream, activeProject);
    }
    
    // Default: create/set milestones or manage schedule
    stream.progress('Analyzing schedule request...');
    
    const projectList = projects.map(p => `${p.id}: ${p.name} (${p.startDate} to ${p.targetEndDate})`).join('\n');
    const projectTasks = activeProject ? tasks.filter(t => t.projectId === activeProject.id) : tasks;
    const taskList = projectTasks.slice(0, 30).map(t => `${t.id}: ${t.title} (due: ${t.dueDate || 'none'})`).join('\n');
    
    const existingMilestones = activeProject 
        ? activeProject.milestones.map(m => `${m.id}: ${m.name} (${m.dueDate}) - ${m.status}, linked tasks: ${m.linkedTaskIds?.length || 0}`).join('\n')
        : 'No active project selected';
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are managing schedules in a systems engineering project tool.

ACTIVE PROJECT: ${activeProject ? `${activeProject.name} (${activeProject.id})` : 'None selected'}
Project dates: ${activeProject ? `${activeProject.startDate} to ${activeProject.targetEndDate}` : 'N/A'}

EXISTING MILESTONES:
${existingMilestones || 'None'}

ALL PROJECTS:
${projectList || 'None'}

TASKS (for linking):
${taskList || 'None'}

Parse this schedule request: "${request.prompt}"

Return JSON for one of these operations:

1. SET/CREATE single milestone:
{
  "operation": "set_milestone",
  "projectId": "${activeProject?.id || 'specify-project-id'}",
  "milestone": { "name": "...", "description": "...", "dueDate": "YYYY-MM-DD" }
}

2. CREATE multiple milestones:
{
  "operation": "create_milestones",
  "projectId": "${activeProject?.id || 'specify-project-id'}",
  "milestones": [
    { "name": "...", "description": "...", "dueDate": "YYYY-MM-DD" },
    ...
  ]
}

3. UPDATE existing milestone (use when user says "change", "update", "set X milestone to date Y"):
{
  "operation": "update_milestone",
  "projectId": "${activeProject?.id || 'specify-project-id'}",
  "milestoneName": "name to find",
  "milestoneId": "id if known, or null",
  "updates": { "name": "new name (optional)", "dueDate": "YYYY-MM-DD (optional)", "status": "not-started|in-progress|completed|delayed|cancelled (optional)" }
}

4. DELETE milestone:
{
  "operation": "delete_milestone",
  "projectId": "${activeProject?.id || 'specify-project-id'}",
  "milestoneName": "name to find",
  "milestoneId": "id if known, or null"
}

5. UPDATE project dates:
{
  "operation": "update_project_dates",
  "projectId": "...",
  "startDate": "YYYY-MM-DD",
  "targetEndDate": "YYYY-MM-DD"
}

6. CREATE complete schedule (project with milestones and tasks):
{
  "operation": "create_schedule",
  "project": { "name": "...", "description": "...", "startDate": "YYYY-MM-DD", "targetEndDate": "YYYY-MM-DD" },
  "milestones": [
    { "name": "...", "description": "...", "dueDate": "YYYY-MM-DD" },
    ...
  ],
  "tasks": [
    { "title": "...", "dueDate": "YYYY-MM-DD", "milestoneIndex": 0 },
    ...
  ]
}

GUIDELINES:
- If user says "set milestone X for date Y" → use set_milestone or update_milestone
- If user says "add milestone" or "create milestone" → use set_milestone
- If user says "create milestones for project" → use create_milestones with multiple
- If user mentions updating an existing milestone → use update_milestone
- Space milestones evenly when creating multiple
- For software projects include: Requirements, Design, Development, Testing, Release
- Today's date is ${new Date().toISOString().split('T')[0]}

Only return the JSON.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return showScheduleHelp(stream, activeProject);
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        switch (parsed.operation) {
            case 'set_milestone': {
                if (!parsed.projectId || parsed.projectId === 'specify-project-id') {
                    stream.markdown('❌ No active project. Please select a project first.\n');
                    stream.markdown('Use: `@muxpanel /create a project named "My Project"`');
                    return { metadata: { command: 'schedule' } };
                }
                
                const project = dataService.getProject(parsed.projectId);
                if (!project) {
                    stream.markdown('❌ Project not found.');
                    return { metadata: { command: 'schedule' } };
                }
                
                const ms = parsed.milestone;
                const milestone = dataService.addMilestone(project.id, {
                    name: ms.name,
                    description: ms.description || '',
                    dueDate: ms.dueDate
                });
                
                // Force immediate save to ensure data is persisted
                dataService.forceSave();
                
                if (milestone) {
                    stream.markdown(`## ✅ Milestone Set\n\n`);
                    stream.markdown(`**Project:** ${project.name}\n\n`);
                    stream.markdown(`| Field | Value |\n|-------|-------|\n`);
                    stream.markdown(`| Name | ${milestone.name} |\n`);
                    stream.markdown(`| Due Date | ${formatDate(milestone.dueDate)} |\n`);
                    stream.markdown(`| Status | ${milestone.status} |\n`);
                    
                    if (ms.description) {
                        stream.markdown(`| Description | ${ms.description} |\n`);
                    }
                    
                    // Re-fetch project to get updated milestones for rendering
                    const updatedProject = dataService.getProject(parsed.projectId);
                    const projectTasks = tasks.filter(t => t.projectId === project.id);
                    if (updatedProject) {
                        renderTimelineWithTasks(stream, updatedProject, projectTasks);
                    }
                }
                break;
            }
            
            case 'create_milestones': {
                if (!parsed.projectId || parsed.projectId === 'specify-project-id') {
                    stream.markdown('❌ No active project. Please select a project first or specify a project name.\n');
                    stream.markdown('Use: `@muxpanel /create a project named "My Project"`');
                    return { metadata: { command: 'schedule' } };
                }
                
                const project = dataService.getProject(parsed.projectId);
                if (!project) {
                    stream.markdown('❌ Project not found.');
                    return { metadata: { command: 'schedule' } };
                }
                
                stream.progress(`Creating ${parsed.milestones.length} milestones...`);
                const created: { name: string; dueDate: string }[] = [];
                
                for (const ms of parsed.milestones) {
                    const milestone = dataService.addMilestone(project.id, {
                        name: ms.name,
                        description: ms.description || '',
                        dueDate: ms.dueDate,
                        linkedTaskIds: ms.linkedTaskIds || []
                    });
                    if (milestone) {
                        created.push({ name: milestone.name, dueDate: milestone.dueDate });
                    }
                }
                
                // Force immediate save to ensure data is persisted
                dataService.forceSave();
                
                stream.markdown(`## ✅ Created ${created.length} Milestones\n\n`);
                stream.markdown(`**Project:** ${project.name}\n\n`);
                stream.markdown('| # | Milestone | Due Date |\n|---|-----------|----------|\n');
                created.forEach((ms, i) => {
                    stream.markdown(`| ${i + 1} | ${ms.name} | ${formatDate(ms.dueDate)} |\n`);
                });
                
                // Re-fetch project to get updated milestones for rendering
                const updatedProject = dataService.getProject(parsed.projectId);
                const projectTasks = tasks.filter(t => t.projectId === project.id);
                if (updatedProject) {
                    renderTimelineWithTasks(stream, updatedProject, projectTasks);
                }
                break;
            }
            
            case 'update_project_dates': {
                const project = dataService.getProject(parsed.projectId);
                if (project) {
                    dataService.updateProject(project.id, {
                        startDate: parsed.startDate || project.startDate,
                        targetEndDate: parsed.targetEndDate || project.targetEndDate
                    });
                    dataService.forceSave();
                    stream.markdown(`## ✅ Updated Project Dates\n\n`);
                    stream.markdown(`**Project:** ${project.name}\n`);
                    stream.markdown(`- **Start:** ${formatDate(parsed.startDate || project.startDate)}\n`);
                    stream.markdown(`- **End:** ${formatDate(parsed.targetEndDate || project.targetEndDate)}\n`);
                }
                break;
            }
            
            case 'update_milestone': {
                const project = dataService.getProject(parsed.projectId);
                if (!project) {
                    stream.markdown('❌ Project not found.');
                    return { metadata: { command: 'schedule' } };
                }
                
                // Find milestone by ID or name
                let milestoneId = parsed.milestoneId;
                if (!milestoneId && parsed.milestoneName) {
                    const found = project.milestones.find((m: any) => 
                        m.name.toLowerCase().includes(parsed.milestoneName.toLowerCase())
                    );
                    milestoneId = found?.id;
                }
                
                if (!milestoneId) {
                    stream.markdown(`❌ Could not find milestone "${parsed.milestoneName || 'unknown'}"\n`);
                    stream.markdown(`\n**Existing milestones:**\n`);
                    project.milestones.forEach((m: any) => {
                        stream.markdown(`- ${m.name} (${formatDate(m.dueDate)})\n`);
                    });
                    return { metadata: { command: 'schedule' } };
                }
                
                const updates: any = {};
                if (parsed.updates.name) { updates.name = parsed.updates.name; }
                if (parsed.updates.dueDate) { updates.dueDate = parsed.updates.dueDate; }
                if (parsed.updates.status) { updates.status = mapMilestoneStatus(parsed.updates.status); }
                
                const result = dataService.updateMilestone(project.id, milestoneId, updates);
                
                if (result) {
                    dataService.forceSave();
                    stream.markdown(`## ✅ Milestone Updated\n\n`);
                    stream.markdown(`| Field | Value |\n|-------|-------|\n`);
                    stream.markdown(`| Name | ${result.name} |\n`);
                    stream.markdown(`| Due Date | ${formatDate(result.dueDate)} |\n`);
                    stream.markdown(`| Status | ${result.status} |\n`);
                    
                    // Re-fetch project to get updated data
                    const updatedProject = dataService.getProject(project.id);
                    const projectTasks = tasks.filter(t => t.projectId === project.id);
                    if (updatedProject) {
                        renderTimelineWithTasks(stream, updatedProject, projectTasks);
                    }
                } else {
                    stream.markdown('❌ Failed to update milestone.');
                }
                break;
            }
            
            case 'delete_milestone': {
                const project = dataService.getProject(parsed.projectId);
                if (!project) {
                    stream.markdown('❌ Project not found.');
                    return { metadata: { command: 'schedule' } };
                }
                
                // Find milestone by ID or name
                let milestoneId = parsed.milestoneId;
                let milestoneName = parsed.milestoneName;
                if (!milestoneId && milestoneName) {
                    const found = project.milestones.find((m: any) => 
                        m.name.toLowerCase().includes(milestoneName.toLowerCase())
                    );
                    milestoneId = found?.id;
                    milestoneName = found?.name || milestoneName;
                }
                
                if (milestoneId) {
                    const deleted = dataService.deleteMilestone(project.id, milestoneId);
                    if (deleted) {
                        dataService.forceSave();
                        stream.markdown(`## 🗑️ Milestone Deleted\n\n`);
                        stream.markdown(`Removed: **${milestoneName}**\n`);
                    } else {
                        stream.markdown('❌ Failed to delete milestone.');
                    }
                } else {
                    stream.markdown(`❌ Could not find milestone "${milestoneName}"\n`);
                }
                break;
            }
            
            case 'create_schedule': {
                // Create project first
                const project = dataService.addProject({
                    name: parsed.project.name,
                    description: parsed.project.description || '',
                    startDate: parsed.project.startDate,
                    targetEndDate: parsed.project.targetEndDate
                });
                
                stream.progress('Creating complete schedule...');
                
                // Create milestones
                const createdMilestones: any[] = [];
                for (const ms of parsed.milestones) {
                    const milestone = dataService.addMilestone(project.id, {
                        name: ms.name,
                        description: ms.description || '',
                        dueDate: ms.dueDate
                    });
                    if (milestone) {
                        createdMilestones.push(milestone);
                    }
                }
                
                // Create tasks and link to milestones
                const createdTasks: any[] = [];
                for (const t of (parsed.tasks || [])) {
                    const task = dataService.addTask({
                        title: t.title,
                        description: t.description || '',
                        dueDate: t.dueDate,
                        priority: mapTaskPriority(t.priority || 'medium'),
                        projectId: project.id
                    });
                    createdTasks.push(task);
                    
                    // Link to milestone if specified
                    if (t.milestoneIndex !== undefined && createdMilestones[t.milestoneIndex]) {
                        dataService.updateMilestone(project.id, createdMilestones[t.milestoneIndex].id, {
                            linkedTaskIds: [...createdMilestones[t.milestoneIndex].linkedTaskIds, task.id]
                        });
                    }
                }
                
                // Set as active project
                dataService.setActiveProject(project.id);
                
                // Force save to ensure all data is persisted
                dataService.forceSave();
                
                stream.markdown(`## ✅ Complete Schedule Created!\n\n`);
                stream.markdown(`### 📁 Project: ${project.name}\n`);
                stream.markdown(`- **Duration:** ${formatDate(project.startDate)} → ${formatDate(project.targetEndDate)}\n\n`);
                
                stream.markdown(`### 🎯 Milestones (${createdMilestones.length})\n\n`);
                stream.markdown('| # | Milestone | Due Date |\n|---|-----------|----------|\n');
                createdMilestones.forEach((ms, i) => {
                    stream.markdown(`| ${i + 1} | ${ms.name} | ${formatDate(ms.dueDate)} |\n`);
                });
                
                if (createdTasks.length > 0) {
                    stream.markdown(`\n### 📋 Tasks Created: ${createdTasks.length}\n`);
                }
                
                // Re-fetch the project to get updated data with all milestones
                const updatedProject = dataService.getProject(project.id);
                if (updatedProject) {
                    renderTimeline(stream, updatedProject, dataService);
                }
                break;
            }
        }

        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'schedule' } };
}

// Link tasks to milestones
async function linkTasksToMilestones(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken,
    activeProject: any,
    tasks: any[]
): Promise<vscode.ChatResult> {
    
    if (!activeProject) {
        stream.markdown('❌ No active project selected. Please select a project first.\n');
        return { metadata: { command: 'schedule' } };
    }
    
    if (activeProject.milestones.length === 0) {
        stream.markdown('❌ No milestones found. Create milestones first with:\n');
        stream.markdown('`@muxpanel /schedule create milestones for this project`\n');
        return { metadata: { command: 'schedule' } };
    }
    
    const projectTasks = tasks.filter(t => t.projectId === activeProject.id);
    
    if (projectTasks.length === 0) {
        stream.markdown('❌ No tasks found in this project. Create tasks first with:\n');
        stream.markdown('`@muxpanel /create tasks for this project`\n');
        return { metadata: { command: 'schedule' } };
    }
    
    stream.progress('Analyzing task-milestone relationships...');
    
    const milestoneList = activeProject.milestones.map((m: any) => 
        `${m.id}: "${m.name}" (due: ${m.dueDate})`
    ).join('\n');
    
    const taskListStr = projectTasks.map(t => 
        `${t.id}: "${t.title}" (due: ${t.dueDate || 'no date'})`
    ).join('\n');
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are linking tasks to milestones in a project management tool.

PROJECT: ${activeProject.name}

MILESTONES:
${milestoneList}

TASKS TO ASSIGN:
${taskListStr}

Request: "${request.prompt}"

Analyze each task and determine which milestone it should be linked to based on:
1. Task due date vs milestone due date (task should be due before or on milestone date)
2. Task title/description relevance to milestone name
3. Logical workflow (requirements tasks → design milestone, etc.)

Return JSON:
{
  "assignments": [
    { "taskId": "...", "milestoneId": "...", "reason": "brief reason" },
    ...
  ],
  "autoAssign": true // true if user wants automatic assignment, false if specific
}

If autoAssign is true, assign ALL unlinked tasks to appropriate milestones.
Only return the JSON.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not determine task assignments.\n');
            return { metadata: { command: 'schedule' } };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const assignments = parsed.assignments || [];
        
        if (assignments.length === 0) {
            stream.markdown('ℹ️ No task assignments identified. Tasks may already be linked or no suitable matches found.\n');
            return { metadata: { command: 'schedule' } };
        }

        stream.progress(`Linking ${assignments.length} tasks to milestones...`);
        
        // Group assignments by milestone
        const byMilestone: Record<string, { taskId: string; reason: string }[]> = {};
        
        for (const assignment of assignments) {
            const milestone = activeProject.milestones.find((m: any) => m.id === assignment.milestoneId);
            if (milestone) {
                // Update milestone with linked task
                const currentLinks = milestone.linkedTaskIds || [];
                if (!currentLinks.includes(assignment.taskId)) {
                    dataService.updateMilestone(activeProject.id, milestone.id, {
                        linkedTaskIds: [...currentLinks, assignment.taskId]
                    });
                    
                    if (!byMilestone[milestone.name]) {
                        byMilestone[milestone.name] = [];
                    }
                    byMilestone[milestone.name].push({ taskId: assignment.taskId, reason: assignment.reason });
                }
            }
        }

        stream.markdown(`## ✅ Tasks Linked to Milestones\n\n`);
        
        for (const [milestoneName, linkedTasks] of Object.entries(byMilestone)) {
            stream.markdown(`### 🎯 ${milestoneName}\n\n`);
            stream.markdown('| Task | Reason |\n');
            stream.markdown('|------|--------|\n');
            
            for (const link of linkedTasks) {
                const task = projectTasks.find(t => t.id === link.taskId);
                if (task) {
                    stream.markdown(`| ${task.title.substring(0, 40)}${task.title.length > 40 ? '...' : ''} | ${link.reason} |\n`);
                }
            }
            stream.markdown('\n');
        }
        
        const totalLinked = Object.values(byMilestone).flat().length;
        stream.markdown(`**Total:** ${totalLinked} task(s) linked\n\n`);
        
        stream.markdown('💡 *Use `@muxpanel /schedule show timeline` to see the updated schedule*\n');

        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'schedule' } };
}

// Show schedule help
function showScheduleHelp(stream: vscode.ChatResponseStream, activeProject: any): vscode.ChatResult {
    stream.markdown(`## 📅 Schedule Management\n\n`);
    
    if (activeProject) {
        stream.markdown(`**Active Project:** ${activeProject.name}\n`);
        stream.markdown(`**Milestones:** ${activeProject.milestones.length}\n\n`);
    } else {
        stream.markdown(`⚠️ *No active project selected*\n\n`);
    }
    
    stream.markdown(`### 🎯 Set Milestones\n`);
    stream.markdown(`- \`@muxpanel /schedule set milestone "Design Complete" for March 15\`\n`);
    stream.markdown(`- \`@muxpanel /schedule add milestone "Beta Release" on April 1st\`\n`);
    stream.markdown(`- \`@muxpanel /schedule create milestones for a 3-month project\`\n\n`);
    
    stream.markdown(`### ✏️ Update Milestones\n`);
    stream.markdown(`- \`@muxpanel /schedule update Design milestone to March 20\`\n`);
    stream.markdown(`- \`@muxpanel /schedule mark Testing milestone as completed\`\n`);
    stream.markdown(`- \`@muxpanel /schedule set Release milestone status to delayed\`\n\n`);
    
    stream.markdown(`### 🗑️ Delete Milestones\n`);
    stream.markdown(`- \`@muxpanel /schedule delete the Beta milestone\`\n`);
    stream.markdown(`- \`@muxpanel /schedule remove Design Review milestone\`\n\n`);
    
    stream.markdown(`### 📊 View & Analyze\n`);
    stream.markdown(`- \`@muxpanel /schedule show timeline\`\n`);
    stream.markdown(`- \`@muxpanel /schedule analyze risks\`\n`);
    stream.markdown(`- \`@muxpanel /schedule show overdue items\`\n\n`);
    
    stream.markdown(`### 🔗 Link Tasks\n`);
    stream.markdown(`- \`@muxpanel /schedule link tasks to milestones\`\n`);
    stream.markdown(`- \`@muxpanel /schedule assign tasks to appropriate milestones\`\n\n`);
    
    stream.markdown(`### ⏱️ Reschedule\n`);
    stream.markdown(`- \`@muxpanel /schedule shift all milestones by 2 weeks\`\n`);
    stream.markdown(`- \`@muxpanel /schedule postpone project by 1 month\`\n`);
    
    return { metadata: { command: 'schedule' } };
}

// Show schedule timeline
async function showScheduleTimeline(
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    activeProject: any,
    projects: any[],
    tasks: any[]
): Promise<vscode.ChatResult> {
    
    if (activeProject) {
        stream.markdown(`## 📅 Project Timeline: ${activeProject.name}\n\n`);
        stream.markdown(`**Duration:** ${formatDate(activeProject.startDate)} → ${formatDate(activeProject.targetEndDate)}\n`);
        stream.markdown(`**Status:** ${activeProject.status} | **Progress:** ${activeProject.progress}%\n\n`);
        
        // Get all project tasks
        const projectTasks = tasks.filter(t => t.projectId === activeProject.id);
        
        renderTimelineWithTasks(stream, activeProject, projectTasks);
        
        // Show milestones with their linked tasks
        const sortedMilestones = [...activeProject.milestones]
            .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        
        if (sortedMilestones.length > 0) {
            stream.markdown(`\n### 🎯 Milestones & Tasks\n\n`);
            
            for (const ms of sortedMilestones) {
                const daysLeft = Math.ceil((new Date(ms.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const daysStr = daysLeft < 0 ? `⚠️ ${Math.abs(daysLeft)} overdue` : `${daysLeft} days left`;
                const statusIcon = ms.status === 'completed' ? '✅' : ms.status === 'delayed' ? '⚠️' : ms.status === 'in-progress' ? '🔄' : '⬜';
                
                stream.markdown(`#### ${statusIcon} ${ms.name}\n`);
                stream.markdown(`📅 Due: ${formatDate(ms.dueDate)} (${daysStr}) | Status: ${ms.status}\n\n`);
                
                // Show tasks linked to this milestone
                const linkedTasks = projectTasks.filter(t => ms.linkedTaskIds?.includes(t.id));
                const tasksDueBeforeMilestone = projectTasks.filter(t => 
                    t.dueDate && 
                    new Date(t.dueDate) <= new Date(ms.dueDate) &&
                    !ms.linkedTaskIds?.includes(t.id)
                );
                
                if (linkedTasks.length > 0) {
                    const completedTasks = linkedTasks.filter(t => t.status === 'done').length;
                    stream.markdown(`**Linked Tasks:** ${completedTasks}/${linkedTasks.length} complete\n\n`);
                    stream.markdown('| Task | Due | Status | Priority |\n');
                    stream.markdown('|------|-----|--------|----------|\n');
                    for (const task of linkedTasks) {
                        const taskIcon = task.status === 'done' ? '✅' : task.status === 'blocked' ? '🚫' : task.status === 'in-progress' ? '🔄' : '⬜';
                        stream.markdown(`| ${taskIcon} ${task.title.substring(0, 30)}${task.title.length > 30 ? '...' : ''} | ${task.dueDate ? formatDateShort(task.dueDate) : '-'} | ${task.status} | ${task.priority} |\n`);
                    }
                    stream.markdown('\n');
                } else if (tasksDueBeforeMilestone.length > 0) {
                    stream.markdown(`*No tasks linked - ${tasksDueBeforeMilestone.length} task(s) due before this milestone*\n\n`);
                } else {
                    stream.markdown(`*No tasks linked to this milestone*\n\n`);
                }
            }
        }
        
        // Show unassigned tasks (not linked to any milestone)
        const allLinkedTaskIds = activeProject.milestones.flatMap((m: any) => m.linkedTaskIds || []);
        const unassignedTasks = projectTasks.filter(t => !allLinkedTaskIds.includes(t.id) && t.status !== 'done');
        
        if (unassignedTasks.length > 0) {
            stream.markdown(`\n### 📋 Unassigned Tasks (${unassignedTasks.length})\n`);
            stream.markdown(`*These tasks are not linked to any milestone*\n\n`);
            stream.markdown('| Task | Due Date | Priority | Status |\n');
            stream.markdown('|------|----------|----------|--------|\n');
            for (const task of unassignedTasks.slice(0, 10)) {
                stream.markdown(`| ${task.title.substring(0, 35)}${task.title.length > 35 ? '...' : ''} | ${task.dueDate ? formatDate(task.dueDate) : '-'} | ${task.priority} | ${task.status} |\n`);
            }
            if (unassignedTasks.length > 10) {
                stream.markdown(`\n*...and ${unassignedTasks.length - 10} more*\n`);
            }
        }
    } else {
        stream.markdown(`## 📅 All Project Schedules\n\n`);
        
        if (projects.length === 0) {
            stream.markdown('No projects found. Create one with:\n');
            stream.markdown('`@muxpanel /schedule create a 3-month software development project`');
        } else {
            for (const project of projects) {
                const projectTasks = tasks.filter(t => t.projectId === project.id);
                const completedTasks = projectTasks.filter(t => t.status === 'done').length;
                
                stream.markdown(`### 📁 ${project.name}\n`);
                stream.markdown(`**${formatDate(project.startDate)} → ${formatDate(project.targetEndDate)}** | Status: ${project.status}\n`);
                stream.markdown(`📋 Tasks: ${completedTasks}/${projectTasks.length} complete`);
                
                if (project.milestones.length > 0) {
                    const completedMs = project.milestones.filter((m: any) => m.status === 'completed').length;
                    stream.markdown(` | 🎯 Milestones: ${completedMs}/${project.milestones.length}`);
                }
                stream.markdown('\n\n');
            }
        }
    }

    return { metadata: { command: 'schedule' } };
}

// Analyze schedule risks
async function analyzeScheduleRisks(
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    activeProject: any,
    projects: any[],
    tasks: any[]
): Promise<vscode.ChatResult> {
    
    stream.markdown(`## ⚠️ Schedule Risk Analysis\n\n`);
    
    const today = new Date();
    let totalRisks = 0;
    
    const projectsToAnalyze = activeProject ? [activeProject] : projects;
    
    for (const project of projectsToAnalyze) {
        const risks: string[] = [];
        const projectTasks = tasks.filter(t => t.projectId === project.id);
        
        // Check project end date
        const endDate = new Date(project.targetEndDate);
        const daysToEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysToEnd < 0) {
            risks.push(`🔴 **Project overdue** by ${Math.abs(daysToEnd)} days`);
        } else if (daysToEnd < 14 && project.progress < 80) {
            risks.push(`🟠 **At risk**: ${daysToEnd} days left but only ${project.progress}% complete`);
        }
        
        // Check milestones AND their linked tasks
        for (const ms of project.milestones) {
            const msDue = new Date(ms.dueDate);
            const daysToDue = Math.ceil((msDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            if (ms.status !== 'completed' && ms.status !== 'cancelled') {
                // Check milestone date
                if (daysToDue < 0) {
                    risks.push(`🔴 **Milestone overdue**: "${ms.name}" was due ${Math.abs(daysToDue)} days ago`);
                } else if (daysToDue < 7) {
                    risks.push(`🟠 **Milestone at risk**: "${ms.name}" due in ${daysToDue} days`);
                }
                
                // Check linked tasks for this milestone
                const linkedTasks = projectTasks.filter(t => ms.linkedTaskIds?.includes(t.id));
                if (linkedTasks.length > 0) {
                    const incompleteTasks = linkedTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
                    const blockedLinked = linkedTasks.filter(t => t.status === 'blocked');
                    const overdueLinked = linkedTasks.filter(t => 
                        t.dueDate && new Date(t.dueDate) < today && t.status !== 'done'
                    );
                    
                    if (incompleteTasks.length > 0 && daysToDue < 7 && daysToDue >= 0) {
                        risks.push(`🟠 **"${ms.name}"**: ${incompleteTasks.length} task(s) still incomplete, milestone due in ${daysToDue} days`);
                    }
                    
                    if (blockedLinked.length > 0) {
                        risks.push(`🟡 **"${ms.name}"**: ${blockedLinked.length} blocked task(s) may delay milestone`);
                    }
                    
                    if (overdueLinked.length > 0) {
                        risks.push(`🔴 **"${ms.name}"**: ${overdueLinked.length} task(s) overdue - milestone at risk`);
                    }
                } else if (daysToDue < 14 && daysToDue >= 0) {
                    // Milestone has no linked tasks
                    risks.push(`🟡 **"${ms.name}"**: No tasks linked - progress cannot be tracked`);
                }
            }
        }
        
        // Check overall overdue tasks
        const overdueTasks = projectTasks.filter(t => 
            t.dueDate && 
            new Date(t.dueDate) < today && 
            t.status !== 'done' && 
            t.status !== 'cancelled'
        );
        
        if (overdueTasks.length > 0) {
            // Group by how overdue
            const criticallyOverdue = overdueTasks.filter(t => {
                const days = Math.ceil((today.getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
                return days > 7;
            });
            
            if (criticallyOverdue.length > 0) {
                risks.push(`🔴 **${criticallyOverdue.length} task(s)** overdue by more than a week`);
            }
            if (overdueTasks.length > criticallyOverdue.length) {
                risks.push(`🟠 **${overdueTasks.length - criticallyOverdue.length} task(s)** recently overdue`);
            }
        }
        
        // Check blocked tasks
        const blockedTasks = projectTasks.filter(t => t.status === 'blocked');
        if (blockedTasks.length > 0) {
            risks.push(`🟡 **${blockedTasks.length} blocked task(s)** may cause cascading delays`);
        }
        
        // Check for tasks without due dates
        const noDueDateTasks = projectTasks.filter(t => !t.dueDate && t.status !== 'done' && t.status !== 'cancelled');
        if (noDueDateTasks.length > 3) {
            risks.push(`🟡 **${noDueDateTasks.length} task(s)** have no due date - schedule incomplete`);
        }
        
        if (risks.length > 0) {
            stream.markdown(`### 📁 ${project.name}\n\n`);
            for (const risk of risks) {
                stream.markdown(`- ${risk}\n`);
                totalRisks++;
            }
            stream.markdown('\n');
        }
    }
    
    if (totalRisks === 0) {
        stream.markdown('✅ **No schedule risks detected!**\n\n');
        stream.markdown('All milestones and tasks are on track.\n');
    } else {
        stream.markdown(`---\n**Total risks identified:** ${totalRisks}\n\n`);
        stream.markdown('**Recommendations:**\n');
        stream.markdown('- Link tasks to milestones with `@muxpanel /schedule link tasks to milestones`\n');
        stream.markdown('- Review overdue items and update their status\n');
        stream.markdown('- Add due dates to all tasks for accurate tracking\n');
        stream.markdown('- Address blocked tasks to prevent cascading delays\n');
    }

    return { metadata: { command: 'schedule' } };
}

// Reschedule items
async function rescheduleItems(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken,
    activeProject: any,
    projects: any[]
): Promise<vscode.ChatResult> {
    
    stream.progress('Analyzing reschedule request...');
    
    if (!activeProject) {
        stream.markdown('❌ No active project selected. Please select a project first.\n');
        return { metadata: { command: 'schedule' } };
    }
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are rescheduling items in a project.

PROJECT: ${activeProject.name}
Start: ${activeProject.startDate}
End: ${activeProject.targetEndDate}

CURRENT MILESTONES:
${activeProject.milestones.map((m: any) => `${m.id}: ${m.name} - ${m.dueDate}`).join('\n') || 'None'}

Request: "${request.prompt}"

Parse the shift amount and return JSON:
{
  "shiftDays": 14,
  "shiftDirection": "forward" | "backward",
  "affectedItems": "all" | "milestones" | "tasks",
  "specificIds": [] // empty for all, or list specific milestone IDs
}

Only return the JSON.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not parse reschedule request. Please specify:\n');
            stream.markdown('- `@muxpanel /schedule shift all milestones by 2 weeks`\n');
            stream.markdown('- `@muxpanel /schedule move deadline back 1 month`\n');
            return { metadata: { command: 'schedule' } };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const shiftMs = parsed.shiftDays * (parsed.shiftDirection === 'backward' ? -1 : 1) * 24 * 60 * 60 * 1000;
        
        let milestonesUpdated = 0;
        let tasksUpdated = 0;
        const projectTasks = dataService.getTasks().filter(t => t.projectId === activeProject.id);
        
        // Shift milestones and their linked tasks
        if (parsed.affectedItems === 'all' || parsed.affectedItems === 'milestones') {
            for (const ms of activeProject.milestones) {
                if (parsed.specificIds?.length === 0 || parsed.specificIds?.includes(ms.id)) {
                    const newDate = new Date(new Date(ms.dueDate).getTime() + shiftMs);
                    dataService.updateMilestone(activeProject.id, ms.id, {
                        dueDate: newDate.toISOString()
                    });
                    milestonesUpdated++;
                    
                    // Also shift linked tasks
                    const linkedTasks = projectTasks.filter(t => ms.linkedTaskIds?.includes(t.id));
                    for (const task of linkedTasks) {
                        if (task.dueDate) {
                            const newTaskDate = new Date(new Date(task.dueDate).getTime() + shiftMs);
                            dataService.updateTask(task.id, { dueDate: newTaskDate.toISOString() });
                            tasksUpdated++;
                        }
                    }
                }
            }
        }
        
        // Shift all tasks if requested
        if (parsed.affectedItems === 'all' || parsed.affectedItems === 'tasks') {
            const allLinkedIds = activeProject.milestones.flatMap((m: any) => m.linkedTaskIds || []);
            for (const task of projectTasks) {
                // Skip if already updated as part of milestone
                if (!allLinkedIds.includes(task.id) && task.dueDate) {
                    const newTaskDate = new Date(new Date(task.dueDate).getTime() + shiftMs);
                    dataService.updateTask(task.id, { dueDate: newTaskDate.toISOString() });
                    tasksUpdated++;
                }
            }
        }
        
        // Shift project end date if moving forward
        if (parsed.shiftDirection === 'forward') {
            const newEndDate = new Date(new Date(activeProject.targetEndDate).getTime() + shiftMs);
            dataService.updateProject(activeProject.id, {
                targetEndDate: newEndDate.toISOString()
            });
        }
        
        stream.markdown(`## ✅ Schedule Shifted\n\n`);
        stream.markdown(`**Direction:** ${parsed.shiftDirection === 'forward' ? '→ Forward' : '← Backward'}\n`);
        stream.markdown(`**Amount:** ${parsed.shiftDays} days\n`);
        stream.markdown(`**Milestones updated:** ${milestonesUpdated}\n`);
        stream.markdown(`**Tasks updated:** ${tasksUpdated}\n\n`);
        
        // Show new timeline
        const updatedProject = dataService.getProjects().find(p => p.id === activeProject.id);
        if (updatedProject) {
            renderTimeline(stream, updatedProject, dataService);
        }
        
        vscode.commands.executeCommand('muxpanel.refreshAll');
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'schedule' } };
}

// Helper: Render ASCII timeline with tasks
function renderTimelineWithTasks(stream: vscode.ChatResponseStream, project: any, tasks: any[]): void {
    const milestones = project.milestones.sort((a: any, b: any) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
    
    if (milestones.length === 0 && tasks.length === 0) {
        stream.markdown('\n*No milestones or tasks defined yet.*\n');
        return;
    }
    
    stream.markdown('\n### 📊 Timeline\n\n');
    stream.markdown('```\n');
    
    const startDate = new Date(project.startDate);
    const endDate = new Date(project.targetEndDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const barWidth = 50;
    
    // Draw timeline bar
    stream.markdown(`${formatDateShort(project.startDate)} `);
    stream.markdown('|');
    stream.markdown('='.repeat(barWidth));
    stream.markdown('|');
    stream.markdown(` ${formatDateShort(project.targetEndDate)}\n`);
    
    // Draw milestones with task counts
    for (const ms of milestones) {
        const msDate = new Date(ms.dueDate);
        const daysFromStart = Math.ceil((msDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const position = Math.min(Math.max(Math.round((daysFromStart / totalDays) * barWidth), 0), barWidth);
        
        const linkedTasks = tasks.filter(t => ms.linkedTaskIds?.includes(t.id));
        const completedTasks = linkedTasks.filter(t => t.status === 'done').length;
        const statusIcon = ms.status === 'completed' ? '✓' : ms.status === 'delayed' ? '!' : ms.status === 'in-progress' ? '▸' : '◆';
        const taskInfo = linkedTasks.length > 0 ? ` [${completedTasks}/${linkedTasks.length}]` : '';
        const line = ' '.repeat(position + formatDateShort(project.startDate).length + 2) + statusIcon + ' ' + ms.name + taskInfo;
        stream.markdown(line + '\n');
    }
    
    // Show today marker
    const today = new Date();
    if (today >= startDate && today <= endDate) {
        const todayDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const todayPos = Math.round((todayDays / totalDays) * barWidth);
        const todayLine = ' '.repeat(todayPos + formatDateShort(project.startDate).length + 2) + '▼ TODAY';
        stream.markdown(todayLine + '\n');
    }
    
    stream.markdown('```\n');
    
    // Summary stats
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const linkedTaskIds = milestones.flatMap((m: any) => m.linkedTaskIds || []);
    const unlinkedTasks = tasks.filter(t => !linkedTaskIds.includes(t.id)).length;
    
    stream.markdown(`\n📋 **Tasks:** ${completedTasks}/${totalTasks} complete`);
    if (unlinkedTasks > 0) {
        stream.markdown(` | ⚠️ ${unlinkedTasks} unlinked`);
    }
    stream.markdown('\n');
}

// Helper: Render ASCII timeline
function renderTimeline(stream: vscode.ChatResponseStream, project: any, _dataService: DataService): void {
    const milestones = project.milestones.sort((a: any, b: any) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
    
    if (milestones.length === 0) {
        stream.markdown('\n*No milestones defined yet.*\n');
        return;
    }
    
    stream.markdown('\n### 📊 Timeline\n\n');
    stream.markdown('```\n');
    
    const startDate = new Date(project.startDate);
    const endDate = new Date(project.targetEndDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const barWidth = 50;
    
    // Draw timeline bar
    stream.markdown(`${formatDateShort(project.startDate)} `);
    stream.markdown('|');
    stream.markdown('='.repeat(barWidth));
    stream.markdown('|');
    stream.markdown(` ${formatDateShort(project.targetEndDate)}\n`);
    
    // Draw milestones on timeline
    for (const ms of milestones) {
        const msDate = new Date(ms.dueDate);
        const daysFromStart = Math.ceil((msDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const position = Math.min(Math.max(Math.round((daysFromStart / totalDays) * barWidth), 0), barWidth);
        
        const statusIcon = ms.status === 'completed' ? '✓' : ms.status === 'delayed' ? '!' : '◆';
        const line = ' '.repeat(position + formatDateShort(project.startDate).length + 2) + statusIcon + ' ' + ms.name;
        stream.markdown(line + '\n');
    }
    
    // Show today marker
    const today = new Date();
    if (today >= startDate && today <= endDate) {
        const todayDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const todayPos = Math.round((todayDays / totalDays) * barWidth);
        const todayLine = ' '.repeat(todayPos + formatDateShort(project.startDate).length + 2) + '▼ TODAY';
        stream.markdown(todayLine + '\n');
    }
    
    stream.markdown('```\n');
}

// Helper: Format date
function formatDate(dateStr: string): string {
    if (!dateStr) { return 'N/A'; }
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr: string): string {
    if (!dateStr) { return 'N/A'; }
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Helper: Map milestone status
function mapMilestoneStatus(status: string): MilestoneStatus {
    const mapping: Record<string, MilestoneStatus> = {
        'not-started': MilestoneStatus.NotStarted,
        'in-progress': MilestoneStatus.InProgress,
        'completed': MilestoneStatus.Completed,
        'delayed': MilestoneStatus.Delayed,
        'cancelled': MilestoneStatus.Cancelled
    };
    return mapping[status?.toLowerCase()] || MilestoneStatus.NotStarted;
}

// Handle /list command
async function handleList(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();
    
    if (prompt.includes('requirement')) {
        const requirements = dataService.getRequirements();
        if (requirements.length === 0) {
            stream.markdown('📋 **No requirements found.** Create one with `/create`');
            return { metadata: { command: 'list' } };
        }
        
        stream.markdown(`## 📋 Requirements (${requirements.length})\n\n`);
        stream.markdown('| Key | Title | Type | Status | Priority |\n');
        stream.markdown('|-----|-------|------|--------|----------|\n');
        
        for (const req of requirements.slice(0, 20)) {
            stream.markdown(`| \`${req.key}\` | ${req.title.substring(0, 40)}${req.title.length > 40 ? '...' : ''} | ${req.type} | ${req.status} | ${req.priority} |\n`);
        }
        
        if (requirements.length > 20) {
            stream.markdown(`\n*...and ${requirements.length - 20} more*\n`);
        }
    } else if (prompt.includes('task') || prompt.includes('overdue')) {
        const isOverdue = prompt.includes('overdue');
        const tasks = isOverdue ? dataService.getOverdueTasks() : dataService.getTasks();
        
        if (tasks.length === 0) {
            stream.markdown(isOverdue ? '✅ **No overdue tasks!**' : '📋 **No tasks found.** Create one with `/create`');
            return { metadata: { command: 'list' } };
        }
        
        stream.markdown(`## ${isOverdue ? '⚠️ Overdue' : '📋'} Tasks (${tasks.length})\n\n`);
        stream.markdown('| Title | Status | Priority | Due Date |\n');
        stream.markdown('|-------|--------|----------|----------|\n');
        
        for (const task of tasks.slice(0, 20)) {
            const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-';
            stream.markdown(`| ${task.title.substring(0, 35)}${task.title.length > 35 ? '...' : ''} | ${task.status} | ${task.priority} | ${dueDate} |\n`);
        }
    } else if (prompt.includes('project')) {
        const projects = dataService.getProjects();
        if (projects.length === 0) {
            stream.markdown('📁 **No projects found.** Create one with `/create`');
            return { metadata: { command: 'list' } };
        }
        
        stream.markdown(`## 📁 Projects (${projects.length})\n\n`);
        stream.markdown('| Name | Status | Progress | Tasks |\n');
        stream.markdown('|------|--------|----------|-------|\n');
        
        for (const proj of projects) {
            stream.markdown(`| ${proj.name} | ${proj.status} | ${proj.progress}% | ${proj.taskIds.length} |\n`);
        }
    } else if (prompt.includes('note')) {
        const notes = dataService.getNotes();
        if (notes.length === 0) {
            stream.markdown('📝 **No notes found.** Create one with `/create`');
            return { metadata: { command: 'list' } };
        }
        
        stream.markdown(`## 📝 Notes (${notes.length})\n\n`);
        stream.markdown('| Title | Category | Updated |\n');
        stream.markdown('|-------|----------|----------|\n');
        
        for (const note of notes.slice(0, 15)) {
            stream.markdown(`| ${note.title.substring(0, 40)}${note.title.length > 40 ? '...' : ''} | ${note.category} | ${new Date(note.updatedAt).toLocaleDateString()} |\n`);
        }
    } else {
        // List summary of everything
        const stats = dataService.getStatistics();
        stream.markdown(`## 📊 Summary\n\n`);
        stream.markdown(`| Item | Count |\n|------|-------|\n`);
        stream.markdown(`| Requirements | ${stats.totalRequirements} |\n`);
        stream.markdown(`| Projects | ${stats.totalProjects} |\n`);
        stream.markdown(`| Tasks | ${stats.totalTasks} |\n`);
        stream.markdown(`| Notes | ${stats.totalNotes} |\n`);
        stream.markdown(`| Overdue Tasks | ${stats.overdueTasks} |\n`);
        stream.markdown(`| Pending Follow-ups | ${stats.pendingFollowUps} |\n`);
        stream.markdown(`\n*Use \`/list requirements\`, \`/list tasks\`, etc. for details*`);
    }

    return { metadata: { command: 'list' } };
}

// Handle /status command
async function handleStatus(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService
): Promise<vscode.ChatResult> {
    const stats = dataService.getStatistics();
    const activeProject = dataService.activeProject;
    const coverageReport = dataService.generateCoverageReport('Status Check');
    const suspectReqs = dataService.getSuspectRequirements();

    stream.markdown(`## 📊 Muxpanel Status\n\n`);
    
    if (activeProject) {
        stream.markdown(`### 📁 Active Project: ${activeProject.name}\n`);
        stream.markdown(`- Progress: **${activeProject.progress}%**\n`);
        stream.markdown(`- Status: ${activeProject.status}\n`);
        stream.markdown(`- Milestones: ${activeProject.milestones.length}\n\n`);
    }

    stream.markdown(`### 📈 Overall Statistics\n`);
    stream.markdown(`| Metric | Value |\n|--------|-------|\n`);
    stream.markdown(`| Total Requirements | ${stats.totalRequirements} |\n`);
    stream.markdown(`| Total Projects | ${stats.totalProjects} |\n`);
    stream.markdown(`| Total Tasks | ${stats.totalTasks} |\n`);
    stream.markdown(`| Completed Tasks | ${stats.tasksByStatus['done'] || 0} |\n`);
    stream.markdown(`| Overdue Tasks | ${stats.overdueTasks} |\n`);
    stream.markdown(`| Test Coverage | ${coverageReport.coveragePercentage.toFixed(1)}% |\n`);
    stream.markdown(`| Suspect Links | ${suspectReqs.length} |\n`);

    if (stats.overdueTasks > 0) {
        stream.markdown(`\n⚠️ **Warning:** You have ${stats.overdueTasks} overdue task(s)!\n`);
    }
    if (suspectReqs.length > 0) {
        stream.markdown(`\n⚠️ **Warning:** ${suspectReqs.length} requirement(s) have suspect links that need review.\n`);
    }

    stream.button({
        command: 'muxpanel.openDashboard',
        title: '📊 Open Dashboard'
    });

    return { metadata: { command: 'status' } };
}

// Handle /find command
async function handleFind(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();
    
    if (prompt.includes('suspect')) {
        const suspectReqs = dataService.getSuspectRequirements();
        if (suspectReqs.length === 0) {
            stream.markdown('✅ **No requirements with suspect links found!**');
            return { metadata: { command: 'find' } };
        }
        
        stream.markdown(`## ⚠️ Requirements with Suspect Links (${suspectReqs.length})\n\n`);
        for (const req of suspectReqs) {
            stream.markdown(`- **\`${req.key}\`** ${req.title} - ${req.suspectLinkIds.length} suspect link(s)\n`);
        }
    } else {
        // General search
        const searchTerm = request.prompt.trim();
        const requirements = dataService.getRequirements().filter(r => 
            r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.key.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const tasks = dataService.getTasks().filter(t =>
            t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (requirements.length === 0 && tasks.length === 0) {
            stream.markdown(`🔍 No results found for "${searchTerm}"`);
            return { metadata: { command: 'find' } };
        }
        
        if (requirements.length > 0) {
            stream.markdown(`## 📋 Requirements matching "${searchTerm}" (${requirements.length})\n\n`);
            for (const req of requirements.slice(0, 10)) {
                stream.markdown(`- **\`${req.key}\`** ${req.title}\n`);
            }
        }
        
        if (tasks.length > 0) {
            stream.markdown(`\n## 📋 Tasks matching "${searchTerm}" (${tasks.length})\n\n`);
            for (const task of tasks.slice(0, 10)) {
                stream.markdown(`- ${task.title} (${task.status})\n`);
            }
        }
    }

    return { metadata: { command: 'find' } };
}

// Handle /analyze command
async function handleAnalyze(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();
    
    if (prompt.includes('coverage')) {
        const report = dataService.generateCoverageReport('Analysis');
        stream.markdown(`## 📊 Test Coverage Analysis\n\n`);
        stream.markdown(`| Metric | Value |\n|--------|-------|\n`);
        stream.markdown(`| Total Requirements | ${report.totalRequirements} |\n`);
        stream.markdown(`| Covered | ${report.coveredRequirements} |\n`);
        stream.markdown(`| Coverage % | **${report.coveragePercentage.toFixed(1)}%** |\n`);
        
        if (report.uncoveredRequirements.length > 0) {
            stream.markdown(`\n### ❌ Uncovered Requirements\n`);
            for (const key of report.uncoveredRequirements.slice(0, 10)) {
                stream.markdown(`- \`${key}\`\n`);
            }
        }
    } else if (prompt.includes('impact')) {
        stream.markdown(`## 🔗 Impact Analysis\n\n`);
        stream.markdown(`To analyze impact, use the command palette:\n`);
        stream.markdown(`\`Cmd+Shift+P\` → "Muxpanel: Analyze Impact"\n`);
        stream.button({
            command: 'muxpanel.analyzeImpact',
            title: '🔗 Run Impact Analysis'
        });
    } else {
        // General analysis summary
        const requirements = dataService.getRequirements();
        const byType: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        
        for (const req of requirements) {
            byType[req.type] = (byType[req.type] || 0) + 1;
            byStatus[req.status] = (byStatus[req.status] || 0) + 1;
        }
        
        stream.markdown(`## 📊 Requirements Analysis\n\n`);
        stream.markdown(`### By Type\n`);
        stream.markdown(`| Type | Count |\n|------|-------|\n`);
        for (const [type, count] of Object.entries(byType)) {
            stream.markdown(`| ${type} | ${count} |\n`);
        }
        
        stream.markdown(`\n### By Status\n`);
        stream.markdown(`| Status | Count |\n|--------|-------|\n`);
        for (const [status, count] of Object.entries(byStatus)) {
            stream.markdown(`| ${status} | ${count} |\n`);
        }
    }

    return { metadata: { command: 'analyze' } };
}

// Handle /trace command - manage trace links
async function handleTrace(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();
    
    stream.progress('Analyzing trace link request...');
    
    // Use LLM to parse the trace link request
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are helping manage trace links in a systems engineering tool.
Parse this request and return ONLY a JSON object.

Request: "${request.prompt}"

Available requirements:
${dataService.getRequirements().slice(0, 30).map(r => `${r.key}: ${r.title}`).join('\n')}

Return JSON in this format:
{"action": "create|delete|list|show", "sourceKey": "REQ-xxx", "targetKey": "REQ-xxx or task id", "targetType": "requirement|task|test-case|code|document|external", "linkType": "derives-from|refines|satisfies|verifies|validates|implements|traces-to|conflicts-with|depends-on|related-to"}

For listing links on a requirement:
{"action": "list", "sourceKey": "REQ-xxx"}

For showing all trace links:
{"action": "show"}

For bulk linking (link multiple items):
{"action": "bulk", "links": [{"sourceKey": "...", "targetKey": "...", "targetType": "...", "linkType": "..."}]}`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not parse trace link request. Please specify source and target requirements.\n\n');
            stream.markdown('**Example:** "Create a trace link from REQ-001 to REQ-002 as derives-from"');
            return { metadata: { command: 'trace' } };
        }
        
        const data = JSON.parse(jsonMatch[0]);
        
        if (data.action === 'show' || (data.action === 'list' && !data.sourceKey)) {
            // Show all trace links
            const requirements = dataService.getRequirements();
            let totalLinks = 0;
            
            stream.markdown('## 🔗 Trace Links Overview\n\n');
            
            for (const req of requirements) {
                if (req.traces && req.traces.length > 0) {
                    stream.markdown(`### ${req.key}: ${req.title}\n`);
                    for (const link of req.traces) {
                        const targetReq = dataService.getRequirement(link.targetId);
                        const targetName = targetReq ? `${targetReq.key}: ${targetReq.title}` : link.targetId;
                        stream.markdown(`  - **${link.linkType}** → ${targetName} (${link.targetType})\n`);
                        totalLinks++;
                    }
                    stream.markdown('\n');
                }
            }
            
            if (totalLinks === 0) {
                stream.markdown('No trace links found. Use `/trace` to create links between requirements.\n');
            } else {
                stream.markdown(`\n**Total:** ${totalLinks} trace links\n`);
            }
            
        } else if (data.action === 'list' && data.sourceKey) {
            // List links for specific requirement
            const req = dataService.getRequirements().find(r => r.key === data.sourceKey);
            if (!req) {
                stream.markdown(`❌ Requirement ${data.sourceKey} not found.`);
                return { metadata: { command: 'trace' } };
            }
            
            stream.markdown(`## 🔗 Trace Links for ${req.key}: ${req.title}\n\n`);
            
            if (!req.traces || req.traces.length === 0) {
                stream.markdown('No trace links found for this requirement.\n');
            } else {
                for (const link of req.traces) {
                    const targetReq = dataService.getRequirement(link.targetId);
                    const targetName = targetReq ? `${targetReq.key}: ${targetReq.title}` : link.targetId;
                    const isSuspect = link.isSuspect;
                    stream.markdown(`- **${link.linkType}** → ${targetName} (${link.targetType})${isSuspect ? ' ⚠️ SUSPECT' : ''}\n`);
                }
            }
            
        } else if (data.action === 'delete') {
            const req = dataService.getRequirements().find(r => r.key === data.sourceKey);
            if (!req) {
                stream.markdown(`❌ Requirement ${data.sourceKey} not found.`);
                return { metadata: { command: 'trace' } };
            }
            
            const link = req.traces?.find((l: TraceLink) => {
                const targetReq = dataService.getRequirement(l.targetId);
                return l.targetId === data.targetKey || 
                       (targetReq && targetReq.key === data.targetKey) ||
                       (targetReq && targetReq.title.includes(data.targetKey));
            });
            
            if (link) {
                dataService.removeTraceLink(req.id, link.id);
                vscode.commands.executeCommand('muxpanel.refreshRequirements');
                stream.markdown(`✅ Removed trace link from ${data.sourceKey} to ${data.targetKey}\n`);
            } else {
                stream.markdown(`❌ Trace link not found.`);
            }
            
        } else if (data.action === 'bulk' && data.links) {
            // Bulk create links
            stream.markdown('## 🔗 Creating Trace Links\n\n');
            let created = 0;
            
            for (const linkData of data.links) {
                const sourceReq = dataService.getRequirements().find(r => r.key === linkData.sourceKey);
                if (!sourceReq) {
                    stream.markdown(`⚠️ Skipped: ${linkData.sourceKey} not found\n`);
                    continue;
                }
                
                const targetType = mapTraceLinkTargetType(linkData.targetType || 'requirement');
                let targetId = linkData.targetKey;
                
                if (targetType === TraceLinkTargetType.Requirement) {
                    const targetReq = dataService.getRequirements().find(r => r.key === linkData.targetKey);
                    if (targetReq) {
                        targetId = targetReq.id;
                    }
                }
                
                dataService.addTraceLink(
                    sourceReq.id,
                    targetId,
                    mapTraceLinkType(linkData.linkType || 'related-to'),
                    targetType
                );
                created++;
                stream.markdown(`✅ ${linkData.sourceKey} --${linkData.linkType}--> ${linkData.targetKey}\n`);
            }
            
            vscode.commands.executeCommand('muxpanel.refreshRequirements');
            stream.markdown(`\n**Created ${created} trace links.**\n`);
            
        } else if (data.action === 'create') {
            // Create single link
            const sourceReq = dataService.getRequirements().find(r => r.key === data.sourceKey);
            if (!sourceReq) {
                stream.markdown(`❌ Source requirement ${data.sourceKey} not found.`);
                return { metadata: { command: 'trace' } };
            }
            
            const targetType = mapTraceLinkTargetType(data.targetType || 'requirement');
            let targetId = data.targetKey;
            let targetTitle = data.targetKey;
            
            if (targetType === TraceLinkTargetType.Requirement) {
                const targetReq = dataService.getRequirements().find(r => r.key === data.targetKey);
                if (targetReq) {
                    targetId = targetReq.id;
                    targetTitle = `${targetReq.key}: ${targetReq.title}`;
                }
            } else if (targetType === TraceLinkTargetType.Task) {
                const targetTask = dataService.getTasks().find(t => 
                    t.id === data.targetKey || t.title.toLowerCase().includes(data.targetKey.toLowerCase())
                );
                if (targetTask) {
                    targetId = targetTask.id;
                    targetTitle = targetTask.title;
                }
            }
            
            dataService.addTraceLink(
                sourceReq.id,
                targetId,
                mapTraceLinkType(data.linkType || 'related-to'),
                targetType
            );
            
            vscode.commands.executeCommand('muxpanel.refreshRequirements');
            stream.markdown(`## ✅ Trace Link Created\n\n`);
            stream.markdown(`**${data.sourceKey}** --*${data.linkType}*--> **${targetTitle}**\n`);
        }
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'trace' } };
}

// Handle /review command - manage baselines and reviews
async function handleReview(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();
    
    stream.progress('Processing review request...');
    
    // Use LLM to parse review request
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are helping manage reviews and baselines in a systems engineering tool.
Parse this request and return ONLY a JSON object.

Request: "${request.prompt}"

Return JSON in one of these formats:

For creating a baseline:
{"action": "baseline", "name": "baseline name", "description": "optional description", "requirementKeys": ["REQ-001", "REQ-002"] or [] for all}

For listing baselines:
{"action": "list-baselines"}

For comparing baselines:
{"action": "compare", "baseline1": "baseline name or id", "baseline2": "baseline name or id"}

For starting a review:
{"action": "start-review", "name": "review name", "requirementKeys": ["REQ-001"]}

For clearing suspect links:
{"action": "clear-suspect", "requirementKey": "REQ-xxx"}`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('## 📋 Review & Baseline Commands\n\n');
            stream.markdown('- **Create baseline:** "Create a baseline called v1.0 release"\n');
            stream.markdown('- **List baselines:** "Show all baselines"\n');
            stream.markdown('- **Clear suspect:** "Clear suspect links on REQ-001"\n');
            return { metadata: { command: 'review' } };
        }
        
        const data = JSON.parse(jsonMatch[0]);
        
        if (data.action === 'baseline') {
            const reqKeys = data.requirementKeys || [];
            const requirements = dataService.getRequirements();
            const reqIds = reqKeys.length > 0 
                ? requirements.filter(r => reqKeys.includes(r.key)).map(r => r.id)
                : requirements.map(r => r.id);
            
            const baseline = dataService.createBaseline(
                data.name,
                reqIds,
                data.description || ''
            );
            
            stream.markdown(`## ✅ Baseline Created\n\n`);
            stream.markdown(`| Property | Value |\n|----------|-------|\n`);
            stream.markdown(`| Name | **${baseline.name}** |\n`);
            stream.markdown(`| Requirements | ${reqIds.length} |\n`);
            stream.markdown(`| Created | ${new Date(baseline.createdAt).toLocaleString()} |\n`);
            
        } else if (data.action === 'list-baselines') {
            const baselines = dataService.getBaselines();
            
            if (baselines.length === 0) {
                stream.markdown('## 📋 No Baselines Found\n\n');
                stream.markdown('Create a baseline with: "Create a baseline called v1.0"\n');
            } else {
                stream.markdown(`## 📋 Baselines (${baselines.length})\n\n`);
                stream.markdown(`| Name | Requirements | Created |\n|------|--------------|--------|\n`);
                for (const b of baselines) {
                    stream.markdown(`| ${b.name} | ${b.requirementSnapshots.length} | ${new Date(b.createdAt).toLocaleDateString()} |\n`);
                }
            }
            
        } else if (data.action === 'clear-suspect') {
            const req = dataService.getRequirements().find(r => r.key === data.requirementKey);
            if (!req) {
                stream.markdown(`❌ Requirement ${data.requirementKey} not found.`);
                return { metadata: { command: 'review' } };
            }
            
            // Clear all suspect links on this requirement
            const suspectLinkIds = [...req.suspectLinkIds];
            for (const linkId of suspectLinkIds) {
                dataService.clearSuspectLink(req.id, linkId);
            }
            vscode.commands.executeCommand('muxpanel.refreshRequirements');
            
            stream.markdown(`## ✅ Suspect Links Cleared\n\n`);
            stream.markdown(`All ${suspectLinkIds.length} suspect link(s) on **${req.key}** have been reviewed and cleared.\n`);
            
        } else if (data.action === 'start-review') {
            stream.markdown(`## 📋 Review Started: ${data.name}\n\n`);
            stream.markdown(`Requirements to review:\n`);
            for (const key of data.requirementKeys || []) {
                stream.markdown(`- ${key}\n`);
            }
            stream.markdown('\nUse the Requirements view to mark items as reviewed.\n');
            
            stream.button({
                command: 'muxpanel.openRequirementsView',
                title: '📋 Open Requirements'
            });
        }
        
    } catch (e) {
        stream.markdown(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return { metadata: { command: 'review' } };
}

// Handle /plan command - autonomous project planning
async function handleAutonomousPlan(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    stream.progress('🤖 Planning your project autonomously...');
    
    const messages = [
        vscode.LanguageModelChatMessage.User(`You are an expert systems engineer and project manager. Create a comprehensive project plan.

User request: "${request.prompt}"

Generate a complete project structure as JSON with ALL of these sections:

{
    "project": {
        "name": "Project Name",
        "description": "Description",
        "startDate": "YYYY-MM-DD",
        "targetEndDate": "YYYY-MM-DD"
    },
    "milestones": [
        {"title": "Milestone 1", "description": "...", "dueDate": "YYYY-MM-DD"},
        {"title": "Milestone 2", "description": "...", "dueDate": "YYYY-MM-DD"}
    ],
    "requirements": [
        {"title": "REQ Title", "description": "...", "type": "functional|system|interface|performance", "priority": "critical|high|medium|low", "rationale": "...", "acceptanceCriteria": "..."},
        ...
    ],
    "tasks": [
        {"title": "Task", "description": "...", "priority": "urgent|high|medium|low", "dueDate": "YYYY-MM-DD", "linkedMilestone": "Milestone 1"},
        ...
    ],
    "traceLinks": [
        {"source": 0, "target": 1, "linkType": "derives-from"},
        ...
    ],
    "notes": [
        {"title": "Project Kickoff Notes", "content": "...", "category": "meeting-notes"}
    ]
}

Create a realistic and thorough project plan with:
- 3-5 milestones
- 8-15 requirements covering functional, non-functional, and interface aspects
- 10-20 tasks linked to milestones
- Trace links between related requirements
- Initial project documentation notes

Use realistic dates starting from today.`)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        let responseText = '';
        for await (const fragment of chatResponse.text) {
            responseText += fragment;
        }
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            stream.markdown('❌ Could not generate project plan. Please try again with more details.\n');
            return { metadata: { command: 'plan' } };
        }
        
        const plan = JSON.parse(jsonMatch[0]);
        
        stream.markdown('## 🚀 Autonomous Project Creation\n\n');
        
        // Create project
        let projectId: string | undefined;
        if (plan.project) {
            const project = dataService.addProject({
                name: plan.project.name,
                description: plan.project.description || '',
                startDate: plan.project.startDate || new Date().toISOString(),
                targetEndDate: plan.project.targetEndDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
            });
            projectId = project.id;
            dataService.setActiveProject(project.id);
            stream.markdown(`### ✅ Project: ${project.name}\n\n`);
        }
        
        // Create milestones as project milestones (not tasks)
        const milestoneMap: Record<string, string> = {};
        if (plan.milestones && Array.isArray(plan.milestones) && projectId) {
            stream.markdown(`### 🎯 Milestones (${plan.milestones.length})\n`);
            for (const m of plan.milestones) {
                const milestone = dataService.addMilestone(projectId, {
                    name: m.title,
                    description: m.description || '',
                    dueDate: m.dueDate ? new Date(m.dueDate).toISOString() : new Date().toISOString()
                });
                if (milestone) {
                    milestoneMap[m.title] = milestone.id;
                    stream.markdown(`- **${m.title}** (${m.dueDate || 'No date'})\n`);
                }
            }
            stream.markdown('\n');
        }
        
        // Create requirements
        const reqMap: Record<number, string> = {};
        if (plan.requirements && Array.isArray(plan.requirements)) {
            stream.markdown(`### 📋 Requirements (${plan.requirements.length})\n`);
            for (let i = 0; i < plan.requirements.length; i++) {
                const r = plan.requirements[i];
                const req = dataService.addRequirement({
                    title: r.title,
                    description: r.description || '',
                    type: mapRequirementType(r.type || 'functional'),
                    priority: mapPriority(r.priority || 'medium'),
                    rationale: r.rationale || '',
                    acceptanceCriteria: r.acceptanceCriteria || ''
                });
                reqMap[i] = req.id;
                stream.markdown(`- **${req.key}**: ${r.title}\n`);
            }
            stream.markdown('\n');
        }
        
        // Create tasks
        if (plan.tasks && Array.isArray(plan.tasks)) {
            stream.markdown(`### ✅ Tasks (${plan.tasks.length})\n`);
            for (const t of plan.tasks) {
                const linkedMilestoneId = t.linkedMilestone ? milestoneMap[t.linkedMilestone] : undefined;
                const task = dataService.addTask({
                    title: t.title,
                    description: t.description || '',
                    type: TaskType.Task,
                    priority: mapTaskPriority(t.priority || 'medium'),
                    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
                    linkedMilestoneId
                });
                stream.markdown(`- ${t.title}${t.linkedMilestone ? ` → ${t.linkedMilestone}` : ''}\n`);
            }
            stream.markdown('\n');
        }
        
        // Create trace links
        if (plan.traceLinks && Array.isArray(plan.traceLinks)) {
            stream.markdown(`### 🔗 Trace Links (${plan.traceLinks.length})\n`);
            let linkCount = 0;
            for (const link of plan.traceLinks) {
                const sourceId = reqMap[link.source];
                const targetId = reqMap[link.target];
                if (sourceId && targetId) {
                    dataService.addTraceLink(
                        sourceId,
                        targetId,
                        mapTraceLinkType(link.linkType || 'related-to'),
                        TraceLinkTargetType.Requirement
                    );
                    linkCount++;
                }
            }
            stream.markdown(`Created ${linkCount} trace links between requirements.\n\n`);
        }
        
        // Create notes
        if (plan.notes && Array.isArray(plan.notes)) {
            stream.markdown(`### 📝 Notes (${plan.notes.length})\n`);
            for (const n of plan.notes) {
                const note = dataService.addNote({
                    title: n.title,
                    content: n.content || '',
                    category: mapNoteCategory(n.category || 'general')
                });
                stream.markdown(`- ${n.title}\n`);
            }
            stream.markdown('\n');
        }
        
        // Refresh all views
        vscode.commands.executeCommand('muxpanel.refreshAll');
        
        stream.markdown('---\n');
        stream.markdown('**🎉 Project created successfully!** All items have been added to Muxpanel.\n\n');
        
        stream.button({
            command: 'muxpanel.openDashboard',
            title: '📊 Open Dashboard'
        });
        stream.button({
            command: 'muxpanel.openGantt',
            title: '📅 View Timeline'
        });
        
    } catch (e) {
        stream.markdown(`❌ Error creating project: ${e instanceof Error ? e.message : 'Unknown error'}\n`);
        stream.markdown('Please try again with a clearer project description.\n');
    }

    return { metadata: { command: 'plan' } };
}

// Handle /switch command - switch active project
async function handleSwitchProject(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    dataService: DataService
): Promise<vscode.ChatResult> {
    const projects = dataService.getProjects();
    
    if (projects.length === 0) {
        stream.markdown('## ⚠️ No Projects Found\n\n');
        stream.markdown('Create a project first with `/create project: My Project`\n');
        return { metadata: { command: 'switch' } };
    }
    
    const searchTerm = request.prompt.trim().toLowerCase();
    
    if (!searchTerm) {
        // List all projects
        stream.markdown('## 📁 Available Projects\n\n');
        const activeProject = dataService.activeProject;
        
        for (const p of projects) {
            const isActive = activeProject?.id === p.id;
            stream.markdown(`- ${isActive ? '**[Active]** ' : ''}${p.name} (${p.status}, ${p.progress}% complete)\n`);
        }
        
        stream.markdown('\n**Usage:** `/switch project name`\n');
        return { metadata: { command: 'switch' } };
    }
    
    // Find matching project
    const project = projects.find(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        p.id === searchTerm
    );
    
    if (project) {
        dataService.setActiveProject(project.id);
        vscode.commands.executeCommand('muxpanel.refreshAll');
        
        stream.markdown(`## ✅ Switched to Project\n\n`);
        stream.markdown(`**${project.name}** is now the active project.\n\n`);
        stream.markdown(`| Property | Value |\n|----------|-------|\n`);
        stream.markdown(`| Status | ${project.status} |\n`);
        stream.markdown(`| Progress | ${project.progress}% |\n`);
        stream.markdown(`| Start | ${new Date(project.startDate).toLocaleDateString()} |\n`);
        stream.markdown(`| Target End | ${new Date(project.targetEndDate).toLocaleDateString()} |\n`);
    } else {
        stream.markdown(`## ❌ Project Not Found\n\n`);
        stream.markdown(`No project matching "${request.prompt}" was found.\n\n`);
        stream.markdown('**Available projects:**\n');
        for (const p of projects) {
            stream.markdown(`- ${p.name}\n`);
        }
    }

    return { metadata: { command: 'switch' } };
}

// ============================================================================
// SMART REQUEST HANDLER - The main intelligent handler for all requests
// ============================================================================
async function handleSmartRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken,
    executeToolCall: (toolName: string, toolInput: any) => Promise<string>
): Promise<vscode.ChatResult> {
    
    const userPrompt = request.prompt.trim();
    const command = request.command; // May be undefined if no slash command used
    
    // Build comprehensive workspace context
    const stats = dataService.getStatistics();
    const activeProject = dataService.activeProject;
    const projects = dataService.getProjects();
    const requirements = dataService.getRequirements();
    const tasks = dataService.getTasks();
    const notes = dataService.getNotes();
    
    // ========================================================================
    // Build rich context string for the LLM
    // ========================================================================
    let workspaceContext = `## MUXPANEL WORKSPACE STATE

### Quick Stats
- Projects: ${stats.totalProjects} | Requirements: ${stats.totalRequirements} | Tasks: ${stats.totalTasks} (${stats.overdueTasks} overdue)
- Active Project: ${activeProject ? `"${activeProject.name}"` : 'None'}
`;

    // Add active project details
    if (activeProject) {
        workspaceContext += `\n### Active Project: "${activeProject.name}"
- Status: ${activeProject.status} | Progress: ${activeProject.progress}%
- Milestones: ${activeProject.milestones?.length || 0}
`;
        if (activeProject.milestones?.length > 0) {
            workspaceContext += `\n**Milestones:**\n`;
            for (const m of activeProject.milestones.slice(0, 8)) {
                workspaceContext += `- ID:"${m.id}" | "${m.name}" | Due:${m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'N/A'} | ${m.status}\n`;
            }
        }
    }

    // Add tasks (prioritize active/upcoming)
    if (tasks.length > 0) {
        const activeTasks = tasks
            .filter(t => t.status !== 'done' && t.status !== 'cancelled')
            .sort((a, b) => {
                if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                return 0;
            })
            .slice(0, 12);
        
        workspaceContext += `\n**Tasks (${tasks.length} total, ${activeTasks.length} active):**\n`;
        for (const t of activeTasks) {
            workspaceContext += `- ID:"${t.id}" | "${t.title}" | ${t.status} | ${t.priority}${t.dueDate ? ` | Due:${new Date(t.dueDate).toLocaleDateString()}` : ''}\n`;
        }
    }

    // Add requirements
    if (requirements.length > 0) {
        workspaceContext += `\n**Requirements (${requirements.length} total):**\n`;
        for (const r of requirements.slice(0, 12)) {
            workspaceContext += `- Key:"${r.key}" ID:"${r.id}" | "${r.title}" | ${r.type} | ${r.status}\n`;
        }
    }

    // Add projects list
    if (projects.length > 1) {
        workspaceContext += `\n**All Projects:**\n`;
        for (const p of projects) {
            workspaceContext += `- ID:"${p.id}" | "${p.name}"${p.id === activeProject?.id ? ' [ACTIVE]' : ''} | ${p.status}\n`;
        }
    }

    // ========================================================================
    // Smart analysis prompt - understands natural language without commands
    // ========================================================================
    const smartPrompt = `You are an intelligent assistant for Muxpanel, a systems engineering tool. 
You DIRECTLY execute user requests without requiring special commands.

${workspaceContext}

USER REQUEST: "${userPrompt}"
${command ? `USER ALSO USED COMMAND: /${command}` : '(No specific command used - understand intent from natural language)'}

## YOUR TASK

Analyze the user's request and respond with a JSON object. You must determine:
1. What the user wants to do (create, update, delete, list, analyze, etc.)
2. Which items are involved (find them by name/title in the context above)
3. What tool calls to make

## RESPONSE FORMAT

Return JSON in this format:
{
  "intent": "create|update|delete|list|query|analyze|plan|other",
  "summary": "Brief description of what you'll do",
  "toolCalls": [
    {"tool": "muxpanel_toolName", "input": {...}}
  ],
  "responseText": "Optional text response if no tools needed or after tool execution"
}

## EXAMPLES

User: "create a task for implementing login"
{"intent":"create","summary":"Creating a new task","toolCalls":[{"tool":"muxpanel_createTask","input":{"title":"Implement login functionality","priority":"medium"}}]}

User: "mark the login task as done"  
(Find task with "login" in title from context, use its ID)
{"intent":"update","summary":"Marking login task complete","toolCalls":[{"tool":"muxpanel_updateTask","input":{"taskId":"<id-from-context>","status":"done"}}]}

User: "what tasks are overdue?"
{"intent":"query","summary":"Checking overdue tasks","toolCalls":[{"tool":"muxpanel_listItems","input":{"type":"overdue"}}],"responseText":"Let me check your overdue tasks..."}

User: "show me the project status"
{"intent":"query","summary":"Getting status","toolCalls":[{"tool":"muxpanel_getStatus","input":{}},{"tool":"muxpanel_getSchedule","input":{}}]}

User: "create a project for building a mobile app with milestones"
{"intent":"plan","summary":"Creating mobile app project with milestones","toolCalls":[
  {"tool":"muxpanel_createProject","input":{"name":"Mobile App Development","setAsActive":true}},
  {"tool":"muxpanel_createMilestone","input":{"title":"Design Complete","dueDate":"2026-03-01"}},
  {"tool":"muxpanel_createMilestone","input":{"title":"MVP Ready","dueDate":"2026-04-15"}}
]}

User: "delete REQ-003"
(Find requirement REQ-003 from context)
{"intent":"delete","summary":"Deleting requirement REQ-003","toolCalls":[{"tool":"muxpanel_deleteItem","input":{"type":"requirement","id":"REQ-003"}}]}

## AVAILABLE TOOLS

CREATE: muxpanel_createRequirement, muxpanel_createTask, muxpanel_createMilestone, muxpanel_createProject, muxpanel_createNote, muxpanel_createTraceLink, muxpanel_createSubtask
UPDATE: muxpanel_updateRequirement, muxpanel_updateTask, muxpanel_updateMilestone, muxpanel_updateProject, muxpanel_updateNote
DELETE: muxpanel_deleteItem (type: requirement|task|note|project)
QUERY: muxpanel_getStatus, muxpanel_getSchedule, muxpanel_listItems, muxpanel_getProject, muxpanel_getRequirement, muxpanel_getWorkspaceContext, muxpanel_searchItems, muxpanel_findTaskByName, muxpanel_findRequirementByName, muxpanel_findMilestoneByName
LINK: muxpanel_linkTaskToMilestone, muxpanel_unlinkTaskFromMilestone, muxpanel_createTraceLink
ANALYZE: muxpanel_analyzeScheduleRisks, muxpanel_analyzeImpact
OTHER: muxpanel_switchProject, muxpanel_createBaseline, muxpanel_addFollowUp, muxpanel_completeFollowUp

## IMPORTANT RULES

1. ALWAYS find items by matching names in the context - use the exact ID/key from context
2. If you can't find an item, use muxpanel_findTaskByName or muxpanel_searchItems first
3. For ambiguous requests, make reasonable assumptions and proceed
4. Chain multiple tool calls when needed (e.g., create project + milestones)
5. Be proactive - if user says "plan a project", create project + milestones + tasks

Return ONLY valid JSON.`;

    try {
        stream.progress('Understanding your request...');
        
        const analysisMessages = [
            vscode.LanguageModelChatMessage.User(smartPrompt)
        ];
        
        const analysisResponse = await request.model.sendRequest(analysisMessages, {}, token);
        let analysisText = '';
        for await (const fragment of analysisResponse.text) {
            analysisText += fragment;
        }
        
        // Parse the JSON response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            // Fallback to natural response
            stream.markdown('I understand you want to work with Muxpanel. Could you be more specific? For example:\n\n');
            stream.markdown('- "Create a task for implementing user authentication"\n');
            stream.markdown('- "Mark the login task as done"\n');
            stream.markdown('- "Show me overdue tasks"\n');
            stream.markdown('- "Create a project for Q1 planning"\n');
            return { metadata: { command: 'smart' } };
        }
        
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Show what we understood
        if (analysis.summary) {
            stream.markdown(`**${analysis.summary}**\n\n`);
        }
        
        // Execute tool calls if any
        if (analysis.toolCalls && Array.isArray(analysis.toolCalls) && analysis.toolCalls.length > 0) {
            const results: any[] = [];
            
            for (const call of analysis.toolCalls) {
                if (!call.tool || !call.input) continue;
                
                stream.progress(`${call.tool.replace('muxpanel_', '').replace(/([A-Z])/g, ' $1').trim()}...`);
                
                try {
                    const result = await executeToolCall(call.tool, call.input);
                    const resultObj = JSON.parse(result);
                    results.push({ tool: call.tool, input: call.input, result: resultObj });
                    
                    // Format output based on tool type
                    if (resultObj.success) {
                        const toolName = call.tool.replace('muxpanel_', '');
                        
                        if (toolName.startsWith('create')) {
                            stream.markdown(`✅ Created: **${resultObj.title || resultObj.name || resultObj.key || 'Item'}**`);
                            if (resultObj.key) stream.markdown(` (\`${resultObj.key}\`)`);
                            if (resultObj.id) stream.markdown(` [ID: ${resultObj.id.substring(0, 8)}...]`);
                            stream.markdown('\n');
                        } else if (toolName.startsWith('update')) {
                            stream.markdown(`✅ Updated: ${resultObj.updated?.join(', ') || 'Item'}\n`);
                        } else if (toolName.startsWith('delete')) {
                            stream.markdown(`✅ Deleted: ${resultObj.deleted || 'Item'}\n`);
                        } else if (toolName === 'getStatus') {
                            stream.markdown(`\n### 📊 Status\n`);
                            stream.markdown(`- Active Project: ${resultObj.activeProject?.name || 'None'}\n`);
                            stream.markdown(`- Requirements: ${resultObj.totalRequirements}\n`);
                            stream.markdown(`- Tasks: ${resultObj.totalTasks} (${resultObj.overdueTasks} overdue)\n`);
                        } else if (toolName === 'listItems') {
                            if (resultObj.items && resultObj.items.length > 0) {
                                stream.markdown(`\n### 📋 Items (${resultObj.count})\n`);
                                for (const item of resultObj.items.slice(0, 10)) {
                                    if (item.type === 'task') {
                                        stream.markdown(`- **${item.title}** [${item.status}] ${item.dueDate ? `Due: ${new Date(item.dueDate).toLocaleDateString()}` : ''}\n`);
                                    } else if (item.type === 'requirement') {
                                        stream.markdown(`- **${item.key}**: ${item.title} [${item.status}]\n`);
                                    } else {
                                        stream.markdown(`- ${item.title || item.name}\n`);
                                    }
                                }
                            } else {
                                stream.markdown('No items found.\n');
                            }
                        } else if (toolName === 'getSchedule' && resultObj.schedule) {
                            const sched = resultObj.schedule;
                            stream.markdown(`\n### 📅 Schedule\n`);
                            stream.markdown(`**Project:** ${sched.project.name} (${sched.project.progress}% complete)\n\n`);
                            if (sched.milestones?.length > 0) {
                                stream.markdown(`**Milestones:**\n`);
                                for (const m of sched.milestones) {
                                    stream.markdown(`- ${m.name} - ${new Date(m.dueDate).toLocaleDateString()} [${m.status}] (${m.completedTaskCount}/${m.linkedTaskCount} tasks)\n`);
                                }
                            }
                            if (sched.unassignedTasks?.length > 0) {
                                stream.markdown(`\n**Unassigned Tasks:** ${sched.unassignedTasks.length}\n`);
                            }
                        } else if (toolName === 'searchItems' || toolName.startsWith('find')) {
                            if (resultObj.results?.length > 0 || resultObj.bestMatch) {
                                const matches = resultObj.results || [resultObj.bestMatch];
                                stream.markdown(`\n### 🔍 Found ${matches.length} match(es)\n`);
                                for (const m of matches.slice(0, 5)) {
                                    stream.markdown(`- **${m.title || m.name || m.key}** [${m.type || m.status}]\n`);
                                }
                            }
                        } else if (toolName === 'switchProject') {
                            stream.markdown(`✅ Switched to project: **${resultObj.activeProject}**\n`);
                        } else if (toolName === 'linkTaskToMilestone') {
                            stream.markdown(`✅ Linked task "${resultObj.taskTitle}" to milestone "${resultObj.milestoneName}"\n`);
                        } else {
                            // Generic success
                            stream.markdown(`✅ Done\n`);
                        }
                    } else {
                        stream.markdown(`⚠️ ${resultObj.error || 'Operation failed'}\n`);
                        if (resultObj.availableTasks) {
                            stream.markdown(`   *Available tasks:* ${resultObj.availableTasks.slice(0, 3).map((t: any) => t.title).join(', ')}\n`);
                        }
                        if (resultObj.availableMilestones) {
                            stream.markdown(`   *Available milestones:* ${resultObj.availableMilestones.slice(0, 3).map((m: any) => m.name).join(', ')}\n`);
                        }
                    }
                } catch (toolError) {
                    stream.markdown(`❌ Error: ${toolError instanceof Error ? toolError.message : 'Unknown error'}\n`);
                }
            }
            
            // Refresh UI
            vscode.commands.executeCommand('muxpanel.refreshAll');
            
            // Add response text if provided
            if (analysis.responseText && !analysis.toolCalls.some((c: any) => c.tool?.includes('list') || c.tool?.includes('get'))) {
                stream.markdown(`\n${analysis.responseText}\n`);
            }
            
            return { metadata: { command: 'smart', intent: analysis.intent, results } };
        }
        
        // No tool calls - just respond with text
        if (analysis.responseText) {
            stream.markdown(analysis.responseText);
        } else {
            // Provide helpful guidance
            stream.markdown('I\'m not sure what action to take. Here are some things you can ask:\n\n');
            stream.markdown('**Create:** "create a task for...", "add a requirement for..."\n');
            stream.markdown('**Update:** "mark X as done", "update REQ-001 to approved"\n');
            stream.markdown('**Query:** "show overdue tasks", "what\'s the status?"\n');
            stream.markdown('**Plan:** "plan a project for...", "create milestones for..."\n');
        }
        
        return { metadata: { command: 'smart', intent: analysis.intent } };
        
    } catch (e) {
        // Graceful error handling
        stream.markdown('I can help you manage your project! Just tell me what you need:\n\n');
        stream.markdown('- **"Create a task for X"** - Adds a new task\n');
        stream.markdown('- **"Mark the login task as done"** - Updates task status\n');
        stream.markdown('- **"Show overdue tasks"** - Lists overdue items\n');
        stream.markdown('- **"Plan a project for..."** - Creates project with milestones\n');
        stream.markdown('- **"What\'s the status?"** - Shows project overview\n');
        
        if (e instanceof Error) {
            console.error('Muxpanel smart handler error:', e.message);
        }
        
        return { metadata: { command: 'smart', error: true } };
    }
}

// Handle general queries with tool execution capability (legacy - kept for backward compatibility)
async function handleGeneralWithTools(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken,
    executeToolCall: (toolName: string, toolInput: any) => Promise<string>
): Promise<vscode.ChatResult> {
    
    // ========================================================================
    // STEP 1: Build rich context about current workspace state
    // ========================================================================
    const stats = dataService.getStatistics();
    const activeProject = dataService.activeProject;
    const projects = dataService.getProjects();
    const requirements = dataService.getRequirements();
    const tasks = dataService.getTasks();
    
    // Build detailed context
    let contextInfo = `## CURRENT MUXPANEL WORKSPACE STATE

### Summary
- Total Projects: ${stats.totalProjects}
- Total Requirements: ${stats.totalRequirements}
- Total Tasks: ${stats.totalTasks} (${stats.overdueTasks} overdue)
- Pending Follow-ups: ${stats.pendingFollowUps}

### Active Project: ${activeProject ? `"${activeProject.name}" (${activeProject.status}, ${activeProject.progress}% complete)` : 'None selected'}
`;

    // Add project milestones to context
    if (activeProject && activeProject.milestones?.length > 0) {
        contextInfo += `\n### Active Project Milestones (${activeProject.milestones.length}):\n`;
        for (const m of activeProject.milestones.slice(0, 10)) {
            contextInfo += `- ID: "${m.id}" | Name: "${m.name}" | Due: ${m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'No date'} | Status: ${m.status}\n`;
        }
    }

    // Add recent/relevant tasks to context (limit to 15 for token efficiency)
    if (tasks.length > 0) {
        contextInfo += `\n### Tasks (${tasks.length} total, showing up to 15):\n`;
        const sortedTasks = [...tasks].sort((a, b) => {
            // Sort by: not done first, then by due date
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            return 0;
        });
        for (const t of sortedTasks.slice(0, 15)) {
            contextInfo += `- ID: "${t.id}" | Title: "${t.title}" | Status: ${t.status} | Priority: ${t.priority}${t.dueDate ? ` | Due: ${new Date(t.dueDate).toLocaleDateString()}` : ''}\n`;
        }
    }

    // Add requirements to context (limit to 15)
    if (requirements.length > 0) {
        contextInfo += `\n### Requirements (${requirements.length} total, showing up to 15):\n`;
        for (const r of requirements.slice(0, 15)) {
            contextInfo += `- Key: "${r.key}" | ID: "${r.id}" | Title: "${r.title}" | Type: ${r.type} | Status: ${r.status}\n`;
        }
    }

    // Add available projects
    if (projects.length > 0) {
        contextInfo += `\n### All Projects:\n`;
        for (const p of projects) {
            const isActive = p.id === activeProject?.id;
            contextInfo += `- ID: "${p.id}" | Name: "${p.name}"${isActive ? ' [ACTIVE]' : ''} | Status: ${p.status} | Milestones: ${p.milestones?.length || 0}\n`;
        }
    }

    contextInfo += `
### IMPORTANT INSTRUCTIONS

1. **Finding Items**: When user mentions an item by name (e.g., "update the login task"), use the item details above to find the correct ID/key. Match by title similarity.

2. **Operations**: Use the appropriate tool with the correct ID:
   - Tasks: use the task ID (uuid format)
   - Requirements: use the requirement key (e.g., REQ-001) or ID
   - Milestones: use the milestone ID from the active project

3. **If item not found above**: Use muxpanel_searchItems or muxpanel_findTaskByName to search.

4. **Tool Chaining**: For complex operations, call multiple tools in sequence.
`;

    // ========================================================================
    // STEP 2: Analyze request and determine tool calls needed
    // ========================================================================
    
    const analysisPrompt = `You are an intelligent assistant for Muxpanel. Analyze this user request and determine what actions to take.

${contextInfo}

USER REQUEST: "${request.prompt}"

INSTRUCTIONS:
1. If user mentions an item by name, find it in the context above and use its ID/key
2. If you can't find the item, use a search tool first (muxpanel_findTaskByName, muxpanel_findRequirementByName, muxpanel_searchItems)
3. For operations that modify data, return the tool calls needed

RESPOND WITH JSON:
- If actions needed: {"needsTools": true, "reasoning": "...", "toolCalls": [{"tool": "tool_name", "input": {...}}, ...]}
- If just information/chat: {"needsTools": false, "response": "Your helpful response here"}

AVAILABLE TOOLS:
- muxpanel_getWorkspaceContext - Get full workspace context
- muxpanel_searchItems - Search items by query (query, itemTypes?, status?, limit?)
- muxpanel_findTaskByName - Find task by name (name, includeCompleted?)
- muxpanel_findRequirementByName - Find requirement by name/key (name)
- muxpanel_findMilestoneByName - Find milestone by name (name)
- muxpanel_createRequirement - Create requirement (title, description?, type?, priority?, rationale?, acceptanceCriteria?, parentKey?)
- muxpanel_createTask - Create task (title, description?, priority?, dueDate?, startDate?, assignee?, linkedMilestoneId?)
- muxpanel_createMilestone - Create milestone (title, description?, dueDate, priority?, projectId?)
- muxpanel_createProject - Create project (name, description?, startDate?, targetEndDate?, setAsActive?)
- muxpanel_createNote - Create note (title, content?, category?, linkedRequirementKeys?, linkedTaskIds?, tags?, isPinned?)
- muxpanel_createTraceLink - Create trace link (sourceKey, targetKey, linkType, targetType?)
- muxpanel_updateRequirement - Update requirement (key, title?, description?, status?, priority?, type?, rationale?, acceptanceCriteria?)
- muxpanel_updateTask - Update task (taskId, title?, status?, priority?, dueDate?, startDate?, assignee?, linkedMilestoneId?)
- muxpanel_updateMilestone - Update milestone (milestoneId, name?, description?, dueDate?, status?)
- muxpanel_updateProject - Update project (projectId?, name?, description?, status?, startDate?, targetEndDate?)
- muxpanel_updateNote - Update note (noteId, title?, content?, category?, linkedRequirementKeys?, linkedTaskIds?, tags?, isPinned?)
- muxpanel_deleteItem - Delete item (type: requirement|task|note|project, id)
- muxpanel_switchProject - Switch active project (projectName)
- muxpanel_linkTaskToMilestone - Link task to milestone (taskId, milestoneId)
- muxpanel_unlinkTaskFromMilestone - Unlink task from milestone (taskId)
- muxpanel_getSchedule - Get project schedule (includeCompleted?)
- muxpanel_analyzeScheduleRisks - Analyze schedule risks
- muxpanel_getStatus - Get workspace status
- muxpanel_listItems - List items (type, status?, priority?, limit?)

Return ONLY valid JSON.`;

    try {
        const analysisMessages = [
            vscode.LanguageModelChatMessage.User(analysisPrompt)
        ];
        
        const analysisResponse = await request.model.sendRequest(analysisMessages, {}, token);
        let analysisText = '';
        for await (const fragment of analysisResponse.text) {
            analysisText += fragment;
        }
        
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            
            if (analysis.needsTools && analysis.toolCalls && Array.isArray(analysis.toolCalls)) {
                // Execute tool calls
                stream.markdown('## 🤖 Executing Actions\n\n');
                
                if (analysis.reasoning) {
                    stream.markdown(`*${analysis.reasoning}*\n\n`);
                }
                
                const results: any[] = [];
                
                for (const call of analysis.toolCalls) {
                    stream.progress(`Executing ${call.tool.replace('muxpanel_', '')}...`);
                    
                    try {
                        const result = await executeToolCall(call.tool, call.input);
                        const resultObj = JSON.parse(result);
                        results.push({ tool: call.tool, input: call.input, result: resultObj });
                        
                        if (resultObj.success) {
                            stream.markdown(`✅ **${call.tool.replace('muxpanel_', '')}**: Success\n`);
                            
                            // Show relevant details
                            if (resultObj.key) stream.markdown(`   - Key: \`${resultObj.key}\`\n`);
                            if (resultObj.id) stream.markdown(`   - ID: \`${resultObj.id}\`\n`);
                            if (resultObj.title || resultObj.name) stream.markdown(`   - Name: ${resultObj.title || resultObj.name}\n`);
                            if (resultObj.updated) stream.markdown(`   - Updated: ${resultObj.updated.join(', ')}\n`);
                        } else {
                            stream.markdown(`❌ **${call.tool.replace('muxpanel_', '')}**: ${resultObj.error}\n`);
                            
                            // Show available items if search failed
                            if (resultObj.availableTasks) {
                                stream.markdown(`   Available tasks: ${resultObj.availableTasks.slice(0, 5).map((t: any) => t.title).join(', ')}\n`);
                            }
                            if (resultObj.availableRequirements) {
                                stream.markdown(`   Available requirements: ${resultObj.availableRequirements.slice(0, 5).map((r: any) => r.key).join(', ')}\n`);
                            }
                            if (resultObj.availableMilestones) {
                                stream.markdown(`   Available milestones: ${resultObj.availableMilestones.slice(0, 5).map((m: any) => m.name).join(', ')}\n`);
                            }
                        }
                    } catch (toolError) {
                        stream.markdown(`❌ **${call.tool.replace('muxpanel_', '')}**: Error - ${toolError instanceof Error ? toolError.message : 'Unknown error'}\n`);
                    }
                }
                
                stream.markdown('\n---\n**Actions completed.**\n');
                
                // Refresh UI
                vscode.commands.executeCommand('muxpanel.refreshAll');
                
                return { metadata: { command: 'general', results } };
                
            } else if (!analysis.needsTools && analysis.response) {
                // Just a conversational response
                stream.markdown(analysis.response);
                return { metadata: { command: 'general' } };
            }
        }
        
        // Fallback: respond naturally
        const chatMessages = [
            vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT + '\n\n' + contextInfo),
            vscode.LanguageModelChatMessage.User(request.prompt)
        ];
        
        const chatResponse = await request.model.sendRequest(chatMessages, {}, token);
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
        }
        
    } catch (e) {
        stream.markdown(`I can help you manage your systems engineering project!\n\n`);
        stream.markdown(`**Quick Commands:**\n`);
        stream.markdown(`- \`@muxpanel /create\` - Create requirements, tasks, or notes\n`);
        stream.markdown(`- \`@muxpanel /plan\` - Autonomously plan a complete project\n`);
        stream.markdown(`- \`@muxpanel /list\` - List items\n`);
        stream.markdown(`- \`@muxpanel /status\` - Show status\n`);
        stream.markdown(`- \`@muxpanel /schedule\` - View schedule\n\n`);
        stream.markdown(`**Or just ask naturally:**\n`);
        stream.markdown(`- "Mark the login task as done"\n`);
        stream.markdown(`- "What tasks are overdue?"\n`);
        stream.markdown(`- "Update REQ-001 to approved"\n`);
    }

    return { metadata: { command: 'general' } };
}

// Handle general queries without specific command (legacy - kept for compatibility)
async function handleGeneral(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    dataService: DataService,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Build context about current state
    const stats = dataService.getStatistics();
    const activeProject = dataService.activeProject;
    
    const contextInfo = `Current Muxpanel state:
- Requirements: ${stats.totalRequirements}
- Projects: ${stats.totalProjects}  
- Tasks: ${stats.totalTasks} (${stats.overdueTasks} overdue)
- Active Project: ${activeProject?.name || 'None selected'}

Available commands:
- /create - Create requirements, tasks, notes, or projects
- /list - List items (requirements, tasks, projects, notes)
- /status - Show project status and statistics
- /find - Search for items or find suspect links
- /analyze - Analyze coverage or requirements`;

    const messages = [
        vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT + '\n\n' + contextInfo),
        vscode.LanguageModelChatMessage.User(request.prompt)
    ];

    try {
        const chatResponse = await request.model.sendRequest(messages, {}, token);
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
        }
    } catch (e) {
        stream.markdown(`I can help you manage your systems engineering project! Try these commands:\n\n`);
        stream.markdown(`- \`@muxpanel /create\` - Create new requirements, tasks, or notes\n`);
        stream.markdown(`- \`@muxpanel /list requirements\` - List all requirements\n`);
        stream.markdown(`- \`@muxpanel /status\` - Show project status\n`);
        stream.markdown(`- \`@muxpanel /find suspect\` - Find requirements with suspect links\n`);
        stream.markdown(`- \`@muxpanel /analyze coverage\` - Analyze test coverage\n`);
    }

    return { metadata: { command: 'general' } };
}

// Helper functions to map string values to enums
function mapRequirementType(type: string): RequirementType {
    const mapping: Record<string, RequirementType> = {
        'functional': RequirementType.Functional,
        'non-functional': RequirementType.NonFunctional,
        'interface': RequirementType.Interface,
        'constraint': RequirementType.Constraint,
        'business': RequirementType.Business,
        'stakeholder': RequirementType.Stakeholder,
        'system': RequirementType.System,
        'software': RequirementType.Software,
        'hardware': RequirementType.Hardware,
        'performance': RequirementType.Performance,
        'safety': RequirementType.Safety,
        'security': RequirementType.Security
    };
    return mapping[type?.toLowerCase()] || RequirementType.Functional;
}

function mapPriority(priority: string): Priority {
    const mapping: Record<string, Priority> = {
        'critical': Priority.Critical,
        'high': Priority.High,
        'medium': Priority.Medium,
        'low': Priority.Low
    };
    return mapping[priority?.toLowerCase()] || Priority.Medium;
}

function mapTaskPriority(priority: string): TaskPriority {
    const mapping: Record<string, TaskPriority> = {
        'urgent': TaskPriority.Urgent,
        'critical': TaskPriority.Urgent,
        'high': TaskPriority.High,
        'medium': TaskPriority.Medium,
        'low': TaskPriority.Low
    };
    return mapping[priority?.toLowerCase()] || TaskPriority.Medium;
}

function mapNoteCategory(category: string): NoteCategory {
    const mapping: Record<string, NoteCategory> = {
        'general': NoteCategory.General,
        'meeting-notes': NoteCategory.MeetingNotes,
        'decision': NoteCategory.Decision,
        'technical-note': NoteCategory.TechnicalNote,
        'review': NoteCategory.Review,
        'idea': NoteCategory.Idea,
        'issue': NoteCategory.Issue
    };
    return mapping[category?.toLowerCase()] || NoteCategory.General;
}

function mapRequirementStatus(status: string): RequirementStatus {
    const mapping: Record<string, RequirementStatus> = {
        'draft': RequirementStatus.Draft,
        'proposed': RequirementStatus.Proposed,
        'under-review': RequirementStatus.UnderReview,
        'reviewed': RequirementStatus.Reviewed,
        'approved': RequirementStatus.Approved,
        'active': RequirementStatus.Active,
        'implemented': RequirementStatus.Implemented,
        'verified': RequirementStatus.Verified,
        'validated': RequirementStatus.Validated,
        'released': RequirementStatus.Released,
        'rejected': RequirementStatus.Rejected,
        'deferred': RequirementStatus.Deferred,
        'deprecated': RequirementStatus.Deprecated
    };
    return mapping[status?.toLowerCase()] || RequirementStatus.Draft;
}

function mapTaskStatus(status: string): TaskStatus {
    const mapping: Record<string, TaskStatus> = {
        'todo': TaskStatus.Todo,
        'in-progress': TaskStatus.InProgress,
        'blocked': TaskStatus.Blocked,
        'in-review': TaskStatus.InReview,
        'done': TaskStatus.Done,
        'cancelled': TaskStatus.Cancelled
    };
    return mapping[status?.toLowerCase()] || TaskStatus.Todo;
}

function mapTraceLinkType(linkType: string): TraceLinkType {
    const mapping: Record<string, TraceLinkType> = {
        'derives-from': TraceLinkType.DerivedFrom,
        'derived-from': TraceLinkType.DerivedFrom,
        'refines': TraceLinkType.Refines,
        'satisfies': TraceLinkType.Satisfies,
        'verifies': TraceLinkType.Verifies,
        'validates': TraceLinkType.Verifies,
        'implements': TraceLinkType.Implements,
        'traces-to': TraceLinkType.RelatedTo,
        'conflicts-with': TraceLinkType.ConflictsWith,
        'depends-on': TraceLinkType.DependsOn,
        'related-to': TraceLinkType.RelatedTo
    };
    return mapping[linkType?.toLowerCase()] || TraceLinkType.RelatedTo;
}

function mapTraceLinkTargetType(targetType: string): TraceLinkTargetType {
    const mapping: Record<string, TraceLinkTargetType> = {
        'requirement': TraceLinkTargetType.Requirement,
        'task': TraceLinkTargetType.Task,
        'test-case': TraceLinkTargetType.TestCase,
        'code': TraceLinkTargetType.Component,
        'document': TraceLinkTargetType.Document,
        'external': TraceLinkTargetType.ExternalItem,
        'component': TraceLinkTargetType.Component,
        'defect': TraceLinkTargetType.Defect,
        'risk-item': TraceLinkTargetType.RiskItem
    };
    return mapping[targetType?.toLowerCase()] || TraceLinkTargetType.Requirement;
}
