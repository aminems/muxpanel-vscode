export interface Project {
    id: string;
    name: string;
    description: string;
    status: ProjectStatus;
    startDate: string;
    targetEndDate: string;
    actualEndDate?: string;
    milestones: Milestone[];
    requirementIds: string[];
    taskIds: string[];
    noteIds: string[];
    createdAt: string;
    updatedAt: string;
    tags: string[];
    progress: number; // 0-100
}

export interface Milestone {
    id: string;
    name: string;
    description: string;
    dueDate: string;
    status: MilestoneStatus;
    linkedRequirementIds: string[];
    linkedTaskIds: string[];
}

export enum ProjectStatus {
    Planning = 'planning',
    Active = 'active',
    OnHold = 'on-hold',
    Completed = 'completed',
    Cancelled = 'cancelled'
}

export enum MilestoneStatus {
    NotStarted = 'not-started',
    InProgress = 'in-progress',
    Completed = 'completed',
    Delayed = 'delayed',
    Cancelled = 'cancelled'
}

export function createProject(partial: Partial<Project> & { name: string }): Project {
    const now = new Date().toISOString();
    return {
        id: partial.id || generateProjectId(),
        name: partial.name,
        description: partial.description || '',
        status: partial.status || ProjectStatus.Planning,
        startDate: partial.startDate || now,
        targetEndDate: partial.targetEndDate || getDefaultEndDate(),
        actualEndDate: partial.actualEndDate,
        milestones: partial.milestones || [],
        requirementIds: partial.requirementIds || [],
        taskIds: partial.taskIds || [],
        noteIds: partial.noteIds || [],
        createdAt: partial.createdAt || now,
        updatedAt: now,
        tags: partial.tags || [],
        progress: partial.progress || 0
    };
}

export function createMilestone(partial: Partial<Milestone> & { name: string; dueDate: string }): Milestone {
    return {
        id: partial.id || generateMilestoneId(),
        name: partial.name,
        description: partial.description || '',
        dueDate: partial.dueDate,
        status: partial.status || MilestoneStatus.NotStarted,
        linkedRequirementIds: partial.linkedRequirementIds || [],
        linkedTaskIds: partial.linkedTaskIds || []
    };
}

function generateProjectId(): string {
    return `PRJ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateMilestoneId(): string {
    return `MS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getDefaultEndDate(): string {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    return date.toISOString();
}
