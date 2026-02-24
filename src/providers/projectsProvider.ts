import * as vscode from 'vscode';
import { DataService } from '../services';
import { Project, ProjectStatus, Milestone, MilestoneStatus } from '../models';

export class ProjectTreeItem extends vscode.TreeItem {
    constructor(
        public readonly project: Project,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isActive: boolean = false
    ) {
        super(project.name, collapsibleState);
        
        this.id = project.id;
        this.tooltip = this.createTooltip();
        this.description = this.createDescription();
        this.contextValue = isActive ? 'projectActive' : 'project';
        this.iconPath = this.getIcon();
        
        // Double-click to open, single click to select as active
        this.command = {
            command: 'muxpanel.selectProject',
            title: 'Select Project',
            arguments: [project.id]
        };
    }

    private createDescription(): string {
        const parts: string[] = [];
        if (this.isActive) {
            parts.push('✓ ACTIVE');
        }
        parts.push(`${this.project.status} - ${this.project.progress}%`);
        return parts.join(' | ');
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${this.project.name}**\n\n`);
        if (this.isActive) {
            md.appendMarkdown(`🔷 **Currently Active Project**\n\n`);
        }
        md.appendMarkdown(`**Status:** ${this.project.status}\n\n`);
        md.appendMarkdown(`**Progress:** ${this.project.progress}%\n\n`);
        md.appendMarkdown(`**Start:** ${new Date(this.project.startDate).toLocaleDateString()}\n\n`);
        md.appendMarkdown(`**Target End:** ${new Date(this.project.targetEndDate).toLocaleDateString()}\n\n`);
        md.appendMarkdown(`**Milestones:** ${this.project.milestones.length}\n\n`);
        md.appendMarkdown(`**Tasks:** ${this.project.taskIds.length}\n\n`);
        md.appendMarkdown(`---\n*Click to select as active project*`);
        return md;
    }

    private getIcon(): vscode.ThemeIcon {
        // If active, use a special color
        if (this.isActive) {
            return new vscode.ThemeIcon('folder-active', new vscode.ThemeColor('charts.green'));
        }
        
        switch (this.project.status) {
            case ProjectStatus.Planning:
                return new vscode.ThemeIcon('calendar', new vscode.ThemeColor('charts.blue'));
            case ProjectStatus.Active:
                return new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'));
            case ProjectStatus.OnHold:
                return new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow'));
            case ProjectStatus.Completed:
                return new vscode.ThemeIcon('check-all', new vscode.ThemeColor('charts.green'));
            case ProjectStatus.Cancelled:
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('project');
        }
    }
}

export class MilestoneTreeItem extends vscode.TreeItem {
    constructor(
        public readonly milestone: Milestone,
        public readonly projectId: string
    ) {
        super(milestone.name, vscode.TreeItemCollapsibleState.None);
        
        this.id = milestone.id;
        this.tooltip = this.createTooltip();
        this.description = `Due: ${new Date(milestone.dueDate).toLocaleDateString()}`;
        this.contextValue = 'milestone';
        this.iconPath = this.getIcon();
        
        this.command = {
            command: 'muxpanel.openMilestone',
            title: 'Open Milestone',
            arguments: [projectId, milestone.id]
        };
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${this.milestone.name}**\n\n`);
        md.appendMarkdown(`**Status:** ${this.milestone.status}\n\n`);
        md.appendMarkdown(`**Due:** ${new Date(this.milestone.dueDate).toLocaleDateString()}\n\n`);
        if (this.milestone.description) {
            md.appendMarkdown(`**Description:** ${this.milestone.description}\n\n`);
        }
        return md;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.milestone.status) {
            case MilestoneStatus.NotStarted:
                return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray'));
            case MilestoneStatus.InProgress:
                return new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.blue'));
            case MilestoneStatus.Completed:
                return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
            case MilestoneStatus.Delayed:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
            case MilestoneStatus.Cancelled:
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('milestone');
        }
    }
}

export class ProjectsProvider implements vscode.TreeDataProvider<ProjectTreeItem | MilestoneTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | MilestoneTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private dataService: DataService;

    constructor() {
        this.dataService = DataService.getInstance();
        this.dataService.onDataChanged(() => this.refresh());
        // Refresh when active project changes
        this.dataService.onActiveProjectChanged(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProjectTreeItem | MilestoneTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectTreeItem | MilestoneTreeItem): Thenable<(ProjectTreeItem | MilestoneTreeItem)[]> {
        if (!element) {
            // Root level - get all projects
            const projects = this.dataService.getProjects();
            const activeProjectId = this.dataService.activeProjectId;
            return Promise.resolve(
                projects.map(proj => new ProjectTreeItem(
                    proj,
                    proj.milestones.length > 0 
                        ? vscode.TreeItemCollapsibleState.Collapsed 
                        : vscode.TreeItemCollapsibleState.None,
                    proj.id === activeProjectId
                ))
            );
        } else if (element instanceof ProjectTreeItem) {
            // Get milestones for this project
            return Promise.resolve(
                element.project.milestones.map(ms => new MilestoneTreeItem(ms, element.project.id))
            );
        }
        return Promise.resolve([]);
    }

    getParent(element: ProjectTreeItem | MilestoneTreeItem): vscode.ProviderResult<ProjectTreeItem | MilestoneTreeItem> {
        if (element instanceof MilestoneTreeItem) {
            const project = this.dataService.getProject(element.projectId);
            if (project) {
                return new ProjectTreeItem(
                    project, 
                    vscode.TreeItemCollapsibleState.Collapsed,
                    project.id === this.dataService.activeProjectId
                );
            }
        }
        return null;
    }
}
