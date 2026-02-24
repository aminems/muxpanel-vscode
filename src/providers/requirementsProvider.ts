import * as vscode from 'vscode';
import { DataService } from '../services';
import { 
    Requirement, 
    RequirementStatus, 
    RequirementType, 
    Priority,
    RiskLevel,
    VerificationStatus,
    WorkflowState
} from '../models';

export class RequirementTreeItem extends vscode.TreeItem {
    constructor(
        public readonly requirement: Requirement,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(requirement.title, collapsibleState);
        
        this.id = requirement.id;
        this.tooltip = this.createTooltip();
        this.description = this.createDescription();
        this.contextValue = this.getContextValue();
        this.iconPath = this.getIcon();
        
        this.command = {
            command: 'muxpanel.openRequirement',
            title: 'Open Requirement',
            arguments: [requirement.id]
        };
    }

    private createDescription(): string {
        const parts: string[] = [];
        parts.push(`[${this.requirement.key}]`);
        parts.push(this.requirement.type);
        
        if (this.requirement.hasSuspectLinks) {
            parts.push('⚠️ SUSPECT');
        }
        if (this.requirement.isLocked) {
            parts.push('🔒');
        }
        if (this.requirement.testCoverage > 0) {
            parts.push(`${this.requirement.testCoverage}% covered`);
        }
        
        return parts.join(' | ');
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${this.requirement.key}: ${this.requirement.title}\n\n`);
        md.appendMarkdown(`**Type:** ${this.requirement.type}\n\n`);
        md.appendMarkdown(`**Category:** ${this.requirement.category}\n\n`);
        md.appendMarkdown(`**Status:** ${this.requirement.status}\n\n`);
        md.appendMarkdown(`**Workflow:** ${this.requirement.workflowState}\n\n`);
        md.appendMarkdown(`**Priority:** ${this.requirement.priority}\n\n`);
        md.appendMarkdown(`**Risk:** ${this.requirement.risk}\n\n`);
        md.appendMarkdown(`**Verification:** ${this.requirement.verificationMethod.join(', ')}\n\n`);
        md.appendMarkdown(`**Test Coverage:** ${this.requirement.testCoverage}%\n\n`);
        
        if (this.requirement.hasSuspectLinks) {
            md.appendMarkdown(`⚠️ **Suspect Links:** ${this.requirement.suspectLinkIds.length}\n\n`);
        }
        
        if (this.requirement.traces.length > 0) {
            md.appendMarkdown(`**Trace Links:** ${this.requirement.traces.length}\n\n`);
        }
        
        if (this.requirement.comments.length > 0) {
            const unresolvedCount = this.requirement.comments.filter(c => !c.isResolved).length;
            md.appendMarkdown(`**Comments:** ${this.requirement.comments.length} (${unresolvedCount} unresolved)\n\n`);
        }
        
        if (this.requirement.description) {
            md.appendMarkdown(`---\n\n${this.requirement.description.substring(0, 300)}${this.requirement.description.length > 300 ? '...' : ''}\n\n`);
        }
        
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`*Version ${this.requirement.version} | Updated: ${new Date(this.requirement.updatedAt).toLocaleString()}*`);
        
        return md;
    }

    private getContextValue(): string {
        const contexts: string[] = ['requirement'];
        
        if (this.requirement.hasSuspectLinks) {
            contexts.push('suspect');
        }
        if (this.requirement.isLocked) {
            contexts.push('locked');
        }
        if (this.requirement.status === RequirementStatus.Draft) {
            contexts.push('draft');
        }
        if (this.requirement.status === RequirementStatus.Approved) {
            contexts.push('approved');
        }
        
        return contexts.join('-');
    }

    private getIcon(): vscode.ThemeIcon {
        // Priority color for suspect links
        if (this.requirement.hasSuspectLinks) {
            return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
        }
        
        // Locked indicator
        if (this.requirement.isLocked) {
            return new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.purple'));
        }
        
        // Status-based icons
        switch (this.requirement.status) {
            case RequirementStatus.Draft:
                return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.gray'));
            case RequirementStatus.Proposed:
                return new vscode.ThemeIcon('git-pull-request', new vscode.ThemeColor('charts.blue'));
            case RequirementStatus.UnderReview:
                return new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.blue'));
            case RequirementStatus.Reviewed:
                return new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('charts.blue'));
            case RequirementStatus.Approved:
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case RequirementStatus.Active:
                return new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'));
            case RequirementStatus.Implemented:
                return new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.purple'));
            case RequirementStatus.Verified:
                return new vscode.ThemeIcon('verified', new vscode.ThemeColor('charts.green'));
            case RequirementStatus.Validated:
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
            case RequirementStatus.Released:
                return new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.green'));
            case RequirementStatus.Rejected:
                return new vscode.ThemeIcon('x', new vscode.ThemeColor('charts.red'));
            case RequirementStatus.Deferred:
                return new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow'));
            case RequirementStatus.Deprecated:
                return new vscode.ThemeIcon('archive', new vscode.ThemeColor('charts.gray'));
            case RequirementStatus.Deleted:
                return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('file-text');
        }
    }
}

// Category node for grouping requirements
export class RequirementCategoryItem extends vscode.TreeItem {
    constructor(
        public readonly category: string,
        public readonly categoryType: 'type' | 'status' | 'document' | 'suspect' | 'unverified',
        public readonly count: number
    ) {
        super(
            formatCategoryName(category, categoryType),
            count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        
        this.id = `category-${categoryType}-${category}`;
        this.description = `${count} requirements`;
        this.contextValue = 'requirementCategory';
        this.iconPath = this.getIcon();
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.categoryType) {
            case 'suspect':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
            case 'unverified':
                return new vscode.ThemeIcon('beaker', new vscode.ThemeColor('charts.blue'));
            default:
                return new vscode.ThemeIcon('folder');
        }
    }
}

function formatCategoryName(category: string, type: string): string {
    if (type === 'suspect') { return '⚠️ Suspect Links'; }
    if (type === 'unverified') { return '🔬 Unverified'; }
    return category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export class RequirementsProvider implements vscode.TreeDataProvider<RequirementTreeItem | RequirementCategoryItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RequirementTreeItem | RequirementCategoryItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private dataService: DataService;
    private viewMode: 'hierarchy' | 'byType' | 'byStatus' | 'flat' = 'hierarchy';

    constructor() {
        this.dataService = DataService.getInstance();
        this.dataService.onDataChanged(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setViewMode(mode: 'hierarchy' | 'byType' | 'byStatus' | 'flat'): void {
        this.viewMode = mode;
        this.refresh();
    }

    getTreeItem(element: RequirementTreeItem | RequirementCategoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: RequirementTreeItem | RequirementCategoryItem): Thenable<(RequirementTreeItem | RequirementCategoryItem)[]> {
        if (!element) {
            return Promise.resolve(this.getRootElements());
        }
        
        if (element instanceof RequirementCategoryItem) {
            return Promise.resolve(this.getRequirementsForCategory(element));
        }
        
        if (element instanceof RequirementTreeItem) {
            const children = this.dataService.getChildRequirements(element.requirement.id);
            return Promise.resolve(
                children.map(req => new RequirementTreeItem(
                    req,
                    req.children.length > 0 
                        ? vscode.TreeItemCollapsibleState.Collapsed 
                        : vscode.TreeItemCollapsibleState.None
                ))
            );
        }
        
        return Promise.resolve([]);
    }

    private getRootElements(): (RequirementTreeItem | RequirementCategoryItem)[] {
        const items: (RequirementTreeItem | RequirementCategoryItem)[] = [];
        // Filter by active project
        const requirements = this.dataService.getRequirementsByActiveProject();
        
        // Always show suspect and unverified categories if they have items
        const suspectReqs = requirements.filter(r => r.hasSuspectLinks);
        if (suspectReqs.length > 0) {
            items.push(new RequirementCategoryItem('suspect', 'suspect', suspectReqs.length));
        }
        
        const unverifiedReqs = requirements.filter(r => 
            r.verificationStatus !== 'verified' && 
            r.status === RequirementStatus.Approved
        );
        if (unverifiedReqs.length > 0) {
            items.push(new RequirementCategoryItem('unverified', 'unverified', unverifiedReqs.length));
        }
        
        switch (this.viewMode) {
            case 'byType':
                for (const type of Object.values(RequirementType)) {
                    const count = requirements.filter(r => r.type === type).length;
                    if (count > 0) {
                        items.push(new RequirementCategoryItem(type, 'type', count));
                    }
                }
                break;
                
            case 'byStatus':
                for (const status of Object.values(RequirementStatus)) {
                    const count = requirements.filter(r => r.status === status).length;
                    if (count > 0) {
                        items.push(new RequirementCategoryItem(status, 'status', count));
                    }
                }
                break;
                
            case 'flat':
                return requirements
                    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
                    .map(req => new RequirementTreeItem(req, vscode.TreeItemCollapsibleState.None));
                
            case 'hierarchy':
            default:
                // Get root requirements filtered by active project
                const rootRequirements = this.dataService.getRootRequirementsByActiveProject();
                items.push(...rootRequirements.map(req => new RequirementTreeItem(
                    req,
                    req.children.length > 0 
                        ? vscode.TreeItemCollapsibleState.Collapsed 
                        : vscode.TreeItemCollapsibleState.None
                )));
                break;
        }
        
        return items;
    }

    private getRequirementsForCategory(category: RequirementCategoryItem): RequirementTreeItem[] {
        let requirements: Requirement[];
        const activeRequirements = this.dataService.getRequirementsByActiveProject();
        
        switch (category.categoryType) {
            case 'type':
                requirements = activeRequirements.filter(r => r.type === category.category as RequirementType);
                break;
            case 'status':
                requirements = activeRequirements.filter(r => r.status === category.category as RequirementStatus);
                break;
            case 'suspect':
                requirements = activeRequirements.filter(r => r.hasSuspectLinks);
                break;
            case 'unverified':
                requirements = activeRequirements.filter(r => 
                    r.verificationStatus !== 'verified' && 
                    r.status === RequirementStatus.Approved
                );
                break;
            default:
                requirements = [];
        }
        
        return requirements.map(req => new RequirementTreeItem(req, vscode.TreeItemCollapsibleState.None));
    }

    getParent(element: RequirementTreeItem | RequirementCategoryItem): vscode.ProviderResult<RequirementTreeItem | RequirementCategoryItem> {
        if (element instanceof RequirementTreeItem && element.requirement.parentId) {
            const parent = this.dataService.getRequirement(element.requirement.parentId);
            if (parent) {
                return new RequirementTreeItem(
                    parent,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
            }
        }
        return null;
    }
}
