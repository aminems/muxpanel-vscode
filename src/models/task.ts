export interface Task {
    id: string;
    title: string;
    description: string;
    type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string;
    startDate?: string;
    completedDate?: string;
    estimatedHours?: number;
    actualHours?: number;
    assignee?: string;
    projectId?: string;
    parentTaskId?: string;
    subtaskIds: string[];
    linkedRequirementIds: string[];
    linkedMilestoneId?: string;  // For tasks linked to a milestone
    followUps: FollowUp[];
    tags: string[];
    createdAt: string;
    updatedAt: string;
    recurrence?: Recurrence;
}

export enum TaskType {
    Task = 'task'
}

export interface FollowUp {
    id: string;
    content: string;
    dueDate: string;
    completed: boolean;
    completedDate?: string;
    createdAt: string;
}

export interface Recurrence {
    type: RecurrenceType;
    interval: number;
    endDate?: string;
    nextOccurrence?: string;
}

export enum TaskStatus {
    Todo = 'todo',
    InProgress = 'in-progress',
    Blocked = 'blocked',
    InReview = 'in-review',
    Done = 'done',
    Cancelled = 'cancelled'
}

export enum TaskPriority {
    Urgent = 'urgent',
    High = 'high',
    Medium = 'medium',
    Low = 'low'
}

export enum RecurrenceType {
    Daily = 'daily',
    Weekly = 'weekly',
    Monthly = 'monthly',
    Yearly = 'yearly'
}

export function createTask(partial: Partial<Task> & { title: string }): Task {
    const now = new Date().toISOString();
    return {
        id: partial.id || generateTaskId(),
        title: partial.title,
        description: partial.description || '',
        type: partial.type || TaskType.Task,
        status: partial.status || TaskStatus.Todo,
        priority: partial.priority || TaskPriority.Medium,
        dueDate: partial.dueDate,
        startDate: partial.startDate,
        completedDate: partial.completedDate,
        estimatedHours: partial.estimatedHours,
        actualHours: partial.actualHours,
        assignee: partial.assignee,
        projectId: partial.projectId,
        parentTaskId: partial.parentTaskId,
        subtaskIds: partial.subtaskIds || [],
        linkedRequirementIds: partial.linkedRequirementIds || [],
        linkedMilestoneId: partial.linkedMilestoneId,
        followUps: partial.followUps || [],
        tags: partial.tags || [],
        createdAt: partial.createdAt || now,
        updatedAt: now,
        recurrence: partial.recurrence
    };
}

export function createFollowUp(partial: Partial<FollowUp> & { content: string; dueDate: string }): FollowUp {
    return {
        id: partial.id || generateFollowUpId(),
        content: partial.content,
        dueDate: partial.dueDate,
        completed: partial.completed || false,
        completedDate: partial.completedDate,
        createdAt: partial.createdAt || new Date().toISOString()
    };
}

function generateTaskId(): string {
    return `TSK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateFollowUpId(): string {
    return `FU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
