import * as vscode from 'vscode';
import { DataService } from '../services';
import { Task, TaskStatus, TaskPriority, FollowUp } from '../models';

export class TaskTreeItem extends vscode.TreeItem {
    constructor(
        public readonly task: Task,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(task.title, collapsibleState);
        
        this.id = task.id;
        this.tooltip = this.createTooltip();
        this.description = this.createDescription();
        this.contextValue = 'task';
        this.iconPath = this.getIcon();
        
        this.command = {
            command: 'muxpanel.openTask',
            title: 'Open Task',
            arguments: [task.id]
        };
    }

    private createDescription(): string {
        const parts: string[] = [];
        parts.push(`[${this.task.priority}]`);
        if (this.task.dueDate) {
            const due = new Date(this.task.dueDate);
            const now = new Date();
            if (due < now && this.task.status !== TaskStatus.Done) {
                parts.push('⚠️ OVERDUE');
            } else {
                parts.push(`Due: ${due.toLocaleDateString()}`);
            }
        }
        return parts.join(' ');
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**✅ Task: ${this.task.title}**\n\n`);
        md.appendMarkdown(`**Status:** ${this.task.status}\n\n`);
        md.appendMarkdown(`**Priority:** ${this.task.priority}\n\n`);
        if (this.task.dueDate) {
            md.appendMarkdown(`**Due:** ${new Date(this.task.dueDate).toLocaleDateString()}\n\n`);
        }
        if (this.task.assignee) {
            md.appendMarkdown(`**Assignee:** ${this.task.assignee}\n\n`);
        }
        if (this.task.description) {
            md.appendMarkdown(`**Description:** ${this.task.description}\n\n`);
        }
        if (this.task.followUps.length > 0) {
            const pending = this.task.followUps.filter(f => !f.completed).length;
            md.appendMarkdown(`**Follow-ups:** ${pending} pending\n\n`);
        }
        return md;
    }

    private getIcon(): vscode.ThemeIcon {
        // Task icons based on status
        switch (this.task.status) {
            case TaskStatus.Todo:
                return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray'));
            case TaskStatus.InProgress:
                return new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.blue'));
            case TaskStatus.Blocked:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case TaskStatus.InReview:
                return new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.purple'));
            case TaskStatus.Done:
                return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
            case TaskStatus.Cancelled:
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'));
            default:
                return new vscode.ThemeIcon('tasklist');
        }
    }
}

export class FollowUpTreeItem extends vscode.TreeItem {
    constructor(
        public readonly followUp: FollowUp,
        public readonly taskId: string
    ) {
        super(followUp.content, vscode.TreeItemCollapsibleState.None);
        
        this.id = followUp.id;
        this.tooltip = this.createTooltip();
        this.description = `Due: ${new Date(followUp.dueDate).toLocaleDateString()}`;
        this.contextValue = followUp.completed ? 'followUpCompleted' : 'followUp';
        this.iconPath = followUp.completed 
            ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'))
            : new vscode.ThemeIcon('bell', new vscode.ThemeColor('charts.orange'));
        
        this.command = {
            command: 'muxpanel.toggleFollowUp',
            title: 'Toggle Follow-up',
            arguments: [taskId, followUp.id]
        };
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${this.followUp.content}**\n\n`);
        md.appendMarkdown(`**Due:** ${new Date(this.followUp.dueDate).toLocaleDateString()}\n\n`);
        md.appendMarkdown(`**Status:** ${this.followUp.completed ? 'Completed' : 'Pending'}\n\n`);
        return md;
    }
}

export class TasksProvider implements vscode.TreeDataProvider<TaskTreeItem | FollowUpTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | FollowUpTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private dataService: DataService;
    private viewMode: 'all' | 'byProject' | 'byStatus' = 'all';

    constructor() {
        this.dataService = DataService.getInstance();
        this.dataService.onDataChanged(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setViewMode(mode: 'all' | 'byProject' | 'byStatus'): void {
        this.viewMode = mode;
        this.refresh();
    }

    getTreeItem(element: TaskTreeItem | FollowUpTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskTreeItem | FollowUpTreeItem): Thenable<(TaskTreeItem | FollowUpTreeItem)[]> {
        if (!element) {
            // Root level - get all root tasks filtered by active project
            const rootTasks = this.dataService.getRootTasksByActiveProject();
            return Promise.resolve(
                rootTasks.map(task => new TaskTreeItem(
                    task,
                    (task.subtaskIds.length > 0 || task.followUps.length > 0)
                        ? vscode.TreeItemCollapsibleState.Collapsed 
                        : vscode.TreeItemCollapsibleState.None
                ))
            );
        } else if (element instanceof TaskTreeItem) {
            // Get subtasks and follow-ups for this task
            const items: (TaskTreeItem | FollowUpTreeItem)[] = [];
            
            // Add subtasks
            const subtasks = this.dataService.getSubtasks(element.task.id);
            for (const subtask of subtasks) {
                items.push(new TaskTreeItem(
                    subtask,
                    (subtask.subtaskIds.length > 0 || subtask.followUps.length > 0)
                        ? vscode.TreeItemCollapsibleState.Collapsed 
                        : vscode.TreeItemCollapsibleState.None
                ));
            }
            
            // Add follow-ups
            for (const followUp of element.task.followUps) {
                items.push(new FollowUpTreeItem(followUp, element.task.id));
            }
            
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }

    getParent(element: TaskTreeItem | FollowUpTreeItem): vscode.ProviderResult<TaskTreeItem | FollowUpTreeItem> {
        if (element instanceof TaskTreeItem && element.task.parentTaskId) {
            const parent = this.dataService.getTask(element.task.parentTaskId);
            if (parent) {
                return new TaskTreeItem(parent, vscode.TreeItemCollapsibleState.Collapsed);
            }
        }
        if (element instanceof FollowUpTreeItem) {
            const task = this.dataService.getTask(element.taskId);
            if (task) {
                return new TaskTreeItem(task, vscode.TreeItemCollapsibleState.Collapsed);
            }
        }
        return null;
    }
}
