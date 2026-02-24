import * as vscode from 'vscode';
import { StorageService, MuxpanelData } from './storageService';
import { 
    Requirement, createRequirement, setKeyCounter,
    Baseline, createBaseline, BaselineStatus,
    Review, createReview, ReviewStatus,
    RequirementDocument, createDocument,
    TraceLink, createTraceLink, TraceLinkType, TraceLinkTargetType,
    Comment, createComment,
    ChangeRecord, ChangeType,
    RequirementStatus, RequirementType,
    CustomFieldDefinition,
    ImpactAnalysis, ImpactedItem,
    CoverageReport, CoverageStats,
    getInverseLinkType,
    Project, createProject, Milestone, createMilestone,
    Task, createTask, FollowUp, createFollowUp, TaskType,
    Note, createNote
} from '../models';
import { debounce, LRUCache, IndexedCollection } from '../utils/performance';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Generic paginated result type for list queries
 */
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

// ============================================================================
// PERFORMANCE-OPTIMIZED DATA SERVICE
// ============================================================================

export class DataService {
    private static instance: DataService;
    private storage: StorageService;
    private data: MuxpanelData;
    private _activeProjectId: string | undefined;

    private _onDataChanged = new vscode.EventEmitter<void>();
    public readonly onDataChanged = this._onDataChanged.event;
    
    private _onActiveProjectChanged = new vscode.EventEmitter<string | undefined>();
    public readonly onActiveProjectChanged = this._onActiveProjectChanged.event;

    // ========================================================================
    // PERFORMANCE: Caching and Indexing
    // ========================================================================
    
    // LRU caches for frequently accessed items
    private requirementCache = new LRUCache<string, Requirement>(500);
    private projectCache = new LRUCache<string, Project>(100);
    private taskCache = new LRUCache<string, Task>(500);
    private noteCache = new LRUCache<string, Note>(200);
    
    // Indexed collections for fast lookups
    private requirementIndex: IndexedCollection<Requirement, 'id'>;
    private taskIndex: IndexedCollection<Task, 'id'>;
    
    // Computed results cache (invalidated on data change)
    private statsCache: { stats: ReturnType<DataService['computeStatistics']>; timestamp: number } | null = null;
    private readonly STATS_CACHE_TTL = 5000; // 5 seconds
    
    // Debounced save to prevent rapid writes
    private debouncedSave: () => void;
    private pendingSave = false;

    private constructor() {
        this.storage = StorageService.getInstance();
        this.data = this.storage.loadData();
        
        // Initialize indexes
        this.requirementIndex = new IndexedCollection<Requirement, 'id'>('id', ['projectId', 'parentId', 'status', 'type']);
        this.taskIndex = new IndexedCollection<Task, 'id'>('id', ['projectId', 'status']);
        
        // Build indexes from loaded data
        this.rebuildIndexes();
        
        // Restore key counter from saved data
        setKeyCounter(this.data.metadata.requirementKeyCounter || 0);
        // Restore active project
        this._activeProjectId = this.data.metadata.activeProjectId;
        
        // Create debounced save function (300ms delay)
        this.debouncedSave = debounce(() => this.executeSave(), 300);
    }

    public static getInstance(): DataService {
        if (!DataService.instance) {
            DataService.instance = new DataService();
        }
        return DataService.instance;
    }

    public hasWorkspace(): boolean {
        return this.storage.hasWorkspace();
    }

    // ========================================================================
    // PERFORMANCE: Index Management
    // ========================================================================
    
    private rebuildIndexes(): void {
        this.requirementIndex.setItems(this.data.requirements);
        this.taskIndex.setItems(this.data.tasks);
        this.invalidateCaches();
    }
    
    private invalidateCaches(): void {
        this.requirementCache.clear();
        this.projectCache.clear();
        this.taskCache.clear();
        this.noteCache.clear();
        this.statsCache = null;
    }
    
    private invalidateRequirementCache(id?: string): void {
        if (id) {
            this.requirementCache.delete(id);
        }
        this.statsCache = null;
    }
    
    private invalidateTaskCache(id?: string): void {
        if (id) {
            this.taskCache.delete(id);
        }
        this.statsCache = null;
    }

    // ========================================================================
    // ACTIVE PROJECT CONTEXT
    // ========================================================================

    public get activeProjectId(): string | undefined {
        return this._activeProjectId;
    }

    public get activeProject(): Project | undefined {
        return this._activeProjectId ? this.getProject(this._activeProjectId) : undefined;
    }

    public setActiveProject(projectId: string | undefined): void {
        this._activeProjectId = projectId;
        this.data.metadata.activeProjectId = projectId;
        this.save();
        this._onActiveProjectChanged.fire(projectId);
        // Update VS Code context for view visibility
        vscode.commands.executeCommand('setContext', 'muxpanel.hasActiveProject', !!projectId);
    }

    public restoreActiveProject(): void {
        // Restore active project from saved metadata on extension activation
        if (this.data.metadata.activeProjectId) {
            const project = this.getProject(this.data.metadata.activeProjectId);
            if (project) {
                this._activeProjectId = this.data.metadata.activeProjectId;
                vscode.commands.executeCommand('setContext', 'muxpanel.hasActiveProject', true);
            } else {
                // Project no longer exists, clear the reference
                this.data.metadata.activeProjectId = undefined;
                this.save();
            }
        }
    }

    public refresh(): void {
        this.storage.refreshWorkspace();
        this.data = this.storage.loadData();
        this.rebuildIndexes();
        setKeyCounter(this.data.metadata.requirementKeyCounter || 0);
        this._activeProjectId = this.data.metadata.activeProjectId;
        vscode.commands.executeCommand('setContext', 'muxpanel.hasActiveProject', !!this._activeProjectId);
        this._onDataChanged.fire();
    }

    private save(): void {
        this.pendingSave = true;
        this.debouncedSave();
    }
    
    private executeSave(): void {
        if (!this.pendingSave) {
            return;
        }
        this.pendingSave = false;
        this.storage.saveData(this.data);
        this._onDataChanged.fire();
    }
    
    /**
     * Force immediate save - use sparingly, only for critical operations
     */
    public forceSave(): void {
        this.pendingSave = false;
        this.storage.saveData(this.data);
        this._onDataChanged.fire();
    }

    // ========================================================================
    // PAGINATION SUPPORT
    // ========================================================================
    
    /**
     * Get paginated requirements with optional filtering
     */
    public getRequirementsPaginated(
        page: number = 1,
        pageSize: number = 50,
        options?: {
            projectId?: string;
            status?: RequirementStatus;
            type?: RequirementType;
            search?: string;
            sortBy?: 'key' | 'title' | 'updatedAt' | 'createdAt';
            sortOrder?: 'asc' | 'desc';
        }
    ): PaginatedResult<Requirement> {
        let filtered = this.data.requirements;
        
        // Apply filters
        if (options?.projectId) {
            filtered = filtered.filter(r => r.projectId === options.projectId);
        }
        if (options?.status) {
            filtered = filtered.filter(r => r.status === options.status);
        }
        if (options?.type) {
            filtered = filtered.filter(r => r.type === options.type);
        }
        if (options?.search) {
            const searchLower = options.search.toLowerCase();
            filtered = filtered.filter(r => 
                r.title.toLowerCase().includes(searchLower) ||
                r.key.toLowerCase().includes(searchLower) ||
                r.description?.toLowerCase().includes(searchLower)
            );
        }
        
        // Apply sorting
        const sortBy = options?.sortBy || 'key';
        const sortOrder = options?.sortOrder || 'asc';
        filtered.sort((a, b) => {
            let aVal: string | number;
            let bVal: string | number;
            
            switch (sortBy) {
                case 'title':
                    aVal = a.title.toLowerCase();
                    bVal = b.title.toLowerCase();
                    break;
                case 'updatedAt':
                    aVal = new Date(a.updatedAt).getTime();
                    bVal = new Date(b.updatedAt).getTime();
                    break;
                case 'createdAt':
                    aVal = new Date(a.createdAt).getTime();
                    bVal = new Date(b.createdAt).getTime();
                    break;
                default:
                    aVal = a.key;
                    bVal = b.key;
            }
            
            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sortOrder === 'asc' ? comparison : -comparison;
        });
        
        // Calculate pagination
        const total = filtered.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const items = filtered.slice(startIndex, startIndex + pageSize);
        
        return {
            items,
            total,
            page,
            pageSize,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    }
    
    /**
     * Get paginated tasks with optional filtering
     */
    public getTasksPaginated(
        page: number = 1,
        pageSize: number = 50,
        options?: {
            projectId?: string;
            status?: string;
            search?: string;
            sortBy?: 'title' | 'dueDate' | 'priority' | 'createdAt';
            sortOrder?: 'asc' | 'desc';
        }
    ): PaginatedResult<Task> {
        let filtered = this.data.tasks;
        
        // Apply filters
        if (options?.projectId) {
            filtered = filtered.filter(t => t.projectId === options.projectId);
        }
        if (options?.status) {
            filtered = filtered.filter(t => t.status === options.status);
        }
        if (options?.search) {
            const searchLower = options.search.toLowerCase();
            filtered = filtered.filter(t => 
                t.title.toLowerCase().includes(searchLower) ||
                t.description?.toLowerCase().includes(searchLower)
            );
        }
        
        // Apply sorting
        const sortBy = options?.sortBy || 'createdAt';
        const sortOrder = options?.sortOrder || 'desc';
        filtered.sort((a, b) => {
            let aVal: string | number;
            let bVal: string | number;
            
            switch (sortBy) {
                case 'title':
                    aVal = a.title.toLowerCase();
                    bVal = b.title.toLowerCase();
                    break;
                case 'dueDate':
                    aVal = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                    bVal = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                    break;
                case 'priority':
                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                    aVal = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
                    bVal = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
                    break;
                default:
                    aVal = new Date(a.createdAt).getTime();
                    bVal = new Date(b.createdAt).getTime();
            }
            
            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sortOrder === 'asc' ? comparison : -comparison;
        });
        
        // Calculate pagination
        const total = filtered.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const items = filtered.slice(startIndex, startIndex + pageSize);
        
        return {
            items,
            total,
            page,
            pageSize,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    }

    // ========================================================================
    // REQUIREMENTS - Enhanced CRUD with Jama-like features
    // ========================================================================
    
    public getRequirements(): Requirement[] {
        return this.data.requirements;
    }

    public getRequirementsByActiveProject(): Requirement[] {
        if (!this._activeProjectId) { return []; }
        // Use indexed lookup for better performance
        return this.requirementIndex.getByField('projectId', this._activeProjectId);
    }

    public getRequirement(id: string): Requirement | undefined {
        // Check cache first
        const cached = this.requirementCache.get(id);
        if (cached) {
            return cached;
        }
        
        // Use indexed lookup
        const req = this.requirementIndex.getByPrimaryKey(id);
        if (req) {
            this.requirementCache.set(id, req);
        }
        return req;
    }

    public getRequirementByKey(key: string): Requirement | undefined {
        return this.data.requirements.find(r => r.key === key);
    }

    public getRootRequirements(): Requirement[] {
        // Use indexed lookup for parentId === undefined
        return this.data.requirements
            .filter(r => !r.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    public getRootRequirementsByActiveProject(): Requirement[] {
        if (!this._activeProjectId) { return []; }
        return this.requirementIndex
            .getByField('projectId', this._activeProjectId)
            .filter(r => !r.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    public getChildRequirements(parentId: string): Requirement[] {
        // Use indexed lookup
        return this.requirementIndex
            .getByField('parentId', parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    public getRequirementsByDocument(documentId: string): Requirement[] {
        return this.data.requirements.filter(r => r.documentId === documentId).sort((a, b) => {
            if (a.sectionNumber && b.sectionNumber) {
                return a.sectionNumber.localeCompare(b.sectionNumber, undefined, { numeric: true });
            }
            return a.sortOrder - b.sortOrder;
        });
    }

    public getRequirementsByType(type: RequirementType): Requirement[] {
        // Use indexed lookup
        return this.requirementIndex.getByField('type', type);
    }

    public getRequirementsByStatus(status: RequirementStatus): Requirement[] {
        // Use indexed lookup
        return this.requirementIndex.getByField('status', status);
    }

    public getRequirementsByProject(projectId: string): Requirement[] {
        return this.data.requirements.filter(r => r.projectId === projectId);
    }

    public getSuspectRequirements(): Requirement[] {
        return this.data.requirements.filter(r => r.hasSuspectLinks);
    }

    public addRequirement(partial: Partial<Requirement> & { title: string }): Requirement {
        // Auto-assign to active project if not specified
        if (!partial.projectId && this._activeProjectId) {
            partial.projectId = this._activeProjectId;
        }
        
        // Increment and save counter
        this.data.metadata.requirementKeyCounter = (this.data.metadata.requirementKeyCounter || 0) + 1;
        setKeyCounter(this.data.metadata.requirementKeyCounter);
        
        const requirement = createRequirement(partial);
        
        // Set level based on parent
        if (requirement.parentId) {
            const parent = this.getRequirement(requirement.parentId);
            if (parent) {
                requirement.level = parent.level + 1;
                parent.children.push(requirement.id);
                this.invalidateRequirementCache(parent.id);
            }
        }
        
        this.data.requirements.push(requirement);
        
        // Update index
        this.requirementIndex.add(requirement);
        this.invalidateRequirementCache();
        
        this.save();
        return requirement;
    }

    public updateRequirement(id: string, updates: Partial<Requirement>, userId: string = 'system'): Requirement | undefined {
        const index = this.data.requirements.findIndex(r => r.id === id);
        if (index === -1) { return undefined; }
        
        const oldReq = this.data.requirements[index];
        const now = new Date().toISOString();
        
        // Track changes for history
        const changeRecords: ChangeRecord[] = [];
        for (const [key, newValue] of Object.entries(updates)) {
            const oldValue = (oldReq as any)[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changeRecords.push({
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: now,
                    userId,
                    userName: userId,
                    changeType: key === 'status' ? ChangeType.StatusChanged : ChangeType.Updated,
                    fieldName: key,
                    oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue ?? ''),
                    newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue ?? ''),
                    version: oldReq.version + 1
                });
            }
        }
        
        // Mark linked requirements as suspect if significant changes
        if (updates.description || updates.title || updates.acceptanceCriteria) {
            this.markLinkedAsSuspect(id);
        }
        
        this.data.requirements[index] = {
            ...oldReq,
            ...updates,
            updatedAt: now,
            updatedBy: userId,
            version: oldReq.version + 1,
            changeHistory: [...oldReq.changeHistory, ...changeRecords]
        };
        
        // Invalidate cache for this requirement
        this.invalidateRequirementCache(id);
        
        this.save();
        return this.data.requirements[index];
    }

    public deleteRequirement(id: string): boolean {
        const requirement = this.getRequirement(id);
        if (!requirement) { return false; }

        // Remove from parent's children
        if (requirement.parentId) {
            const parent = this.getRequirement(requirement.parentId);
            if (parent) {
                parent.children = parent.children.filter(c => c !== id);
                this.invalidateRequirementCache(parent.id);
            }
        }

        // Remove trace links
        this.removeAllTraceLinks(id);

        // Delete children recursively
        for (const childId of requirement.children) {
            this.deleteRequirement(childId);
        }

        this.data.requirements = this.data.requirements.filter(r => r.id !== id);
        
        // Update index and cache
        this.requirementIndex.remove(id);
        this.invalidateRequirementCache(id);
        
        this.save();
        return true;
    }

    // ========================================================================
    // TRACEABILITY - Jama-style bidirectional linking
    // ========================================================================

    public addTraceLink(
        sourceId: string, 
        targetId: string, 
        linkType: TraceLinkType,
        targetType: TraceLinkTargetType = TraceLinkTargetType.Requirement,
        description?: string
    ): TraceLink | undefined {
        const source = this.getRequirement(sourceId);
        if (!source) { return undefined; }

        const link = createTraceLink({
            sourceId,
            targetId,
            linkType,
            targetType,
            description
        });

        source.traces.push(link);

        // Add inverse link for bidirectional tracing
        if (targetType === TraceLinkTargetType.Requirement) {
            const target = this.getRequirement(targetId);
            if (target) {
                const inverseLink = createTraceLink({
                    sourceId: targetId,
                    targetId: sourceId,
                    linkType: getInverseLinkType(linkType),
                    targetType: TraceLinkTargetType.Requirement,
                    description
                });
                target.traces.push(inverseLink);
            }
        }

        // Record change
        source.changeHistory.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            userId: 'system',
            userName: 'System',
            changeType: ChangeType.TraceLinkAdded,
            description: `Added ${linkType} link to ${targetId}`,
            version: source.version
        });

        this.save();
        return link;
    }

    public removeTraceLink(sourceId: string, linkId: string): boolean {
        const source = this.getRequirement(sourceId);
        if (!source) { return false; }

        const link = source.traces.find(t => t.id === linkId);
        if (!link) { return false; }

        // Remove from source
        source.traces = source.traces.filter(t => t.id !== linkId);

        // Remove inverse link
        if (link.targetType === TraceLinkTargetType.Requirement) {
            const target = this.getRequirement(link.targetId);
            if (target) {
                target.traces = target.traces.filter(t => 
                    !(t.targetId === sourceId && t.linkType === getInverseLinkType(link.linkType))
                );
            }
        }

        source.changeHistory.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            userId: 'system',
            userName: 'System',
            changeType: ChangeType.TraceLinkRemoved,
            description: `Removed ${link.linkType} link to ${link.targetId}`,
            version: source.version
        });

        this.save();
        return true;
    }

    private removeAllTraceLinks(reqId: string): void {
        // Remove links from other requirements pointing to this one
        for (const req of this.data.requirements) {
            req.traces = req.traces.filter(t => t.targetId !== reqId);
        }
    }

    public markLinkedAsSuspect(changedReqId: string): void {
        for (const req of this.data.requirements) {
            for (const trace of req.traces) {
                if (trace.targetId === changedReqId && !trace.isSuspect) {
                    trace.isSuspect = true;
                    trace.suspectReason = `Target requirement ${changedReqId} was modified`;
                    req.hasSuspectLinks = true;
                    if (!req.suspectLinkIds.includes(trace.id)) {
                        req.suspectLinkIds.push(trace.id);
                    }
                }
            }
        }
    }

    public clearSuspectLink(reqId: string, linkId: string): boolean {
        const req = this.getRequirement(reqId);
        if (!req) { return false; }

        const link = req.traces.find(t => t.id === linkId);
        if (link) {
            link.isSuspect = false;
            link.suspectReason = undefined;
            link.verifiedAt = new Date().toISOString();
            link.verifiedBy = 'system';
            req.suspectLinkIds = req.suspectLinkIds.filter(id => id !== linkId);
            req.hasSuspectLinks = req.suspectLinkIds.length > 0;
            this.save();
            return true;
        }
        return false;
    }

    public getUpstreamRequirements(reqId: string): Requirement[] {
        const req = this.getRequirement(reqId);
        if (!req) { return []; }

        const upstreamIds = req.traces
            .filter(t => t.linkType === TraceLinkType.DerivedFrom || t.linkType === TraceLinkType.ChildOf)
            .map(t => t.targetId);

        return upstreamIds.map(id => this.getRequirement(id)).filter((r): r is Requirement => !!r);
    }

    public getDownstreamRequirements(reqId: string): Requirement[] {
        const req = this.getRequirement(reqId);
        if (!req) { return []; }

        const downstreamIds = req.traces
            .filter(t => t.linkType === TraceLinkType.DerivesTo || t.linkType === TraceLinkType.ParentOf)
            .map(t => t.targetId);

        return downstreamIds.map(id => this.getRequirement(id)).filter((r): r is Requirement => !!r);
    }

    // ========================================================================
    // IMPACT ANALYSIS
    // ========================================================================

    public analyzeImpact(reqId: string, maxDepth: number = 5): ImpactAnalysis {
        const impactedItems: ImpactedItem[] = [];
        const visited = new Set<string>();

        const analyze = (currentId: string, depth: number, path: string[]) => {
            if (depth > maxDepth || visited.has(currentId)) { return; }
            visited.add(currentId);

            const req = this.getRequirement(currentId);
            if (!req) { return; }

            for (const trace of req.traces) {
                if (!visited.has(trace.targetId)) {
                    const target = this.getRequirement(trace.targetId);
                    if (target) {
                        impactedItems.push({
                            id: target.id,
                            type: TraceLinkTargetType.Requirement,
                            title: target.title,
                            linkType: trace.linkType,
                            depth,
                            path: [...path, trace.targetId]
                        });
                        analyze(trace.targetId, depth + 1, [...path, trace.targetId]);
                    }
                }
            }
        };

        analyze(reqId, 1, [reqId]);

        return {
            sourceRequirementId: reqId,
            impactedItems,
            generatedAt: new Date().toISOString(),
            depth: maxDepth
        };
    }

    // ========================================================================
    // COVERAGE ANALYSIS
    // ========================================================================

    public generateCoverageReport(name: string): CoverageReport {
        const requirements = this.data.requirements;
        const coveredReqs = requirements.filter(r => r.testCoverage >= 100);
        const partialReqs = requirements.filter(r => r.testCoverage > 0 && r.testCoverage < 100);
        const uncoveredReqs = requirements.filter(r => r.testCoverage === 0);

        const byType: Record<RequirementType, CoverageStats> = {} as any;
        const byStatus: Record<RequirementStatus, CoverageStats> = {} as any;

        for (const type of Object.values(RequirementType)) {
            const typeReqs = requirements.filter(r => r.type === type);
            const covered = typeReqs.filter(r => r.testCoverage >= 100).length;
            const partial = typeReqs.filter(r => r.testCoverage > 0 && r.testCoverage < 100).length;
            byType[type] = {
                total: typeReqs.length,
                covered,
                partial,
                uncovered: typeReqs.length - covered - partial,
                percentage: typeReqs.length > 0 ? Math.round((covered / typeReqs.length) * 100) : 0
            };
        }

        for (const status of Object.values(RequirementStatus)) {
            const statusReqs = requirements.filter(r => r.status === status);
            const covered = statusReqs.filter(r => r.testCoverage >= 100).length;
            const partial = statusReqs.filter(r => r.testCoverage > 0 && r.testCoverage < 100).length;
            byStatus[status] = {
                total: statusReqs.length,
                covered,
                partial,
                uncovered: statusReqs.length - covered - partial,
                percentage: statusReqs.length > 0 ? Math.round((covered / statusReqs.length) * 100) : 0
            };
        }

        return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            generatedAt: new Date().toISOString(),
            generatedBy: 'system',
            totalRequirements: requirements.length,
            coveredRequirements: coveredReqs.length,
            coveragePercentage: requirements.length > 0 ? Math.round((coveredReqs.length / requirements.length) * 100) : 0,
            byType,
            byStatus,
            uncoveredRequirements: uncoveredReqs.map(r => r.id),
            partiallyCoveredRequirements: partialReqs.map(r => r.id)
        };
    }

    // ========================================================================
    // BASELINES
    // ========================================================================

    public getBaselines(): Baseline[] {
        return this.data.baselines || [];
    }

    public getBaseline(id: string): Baseline | undefined {
        return this.data.baselines?.find(b => b.id === id);
    }

    public createBaseline(name: string, requirementIds: string[], description?: string): Baseline {
        const snapshots = requirementIds.map(id => {
            const req = this.getRequirement(id);
            return req ? {
                requirementId: id,
                version: req.version,
                snapshot: { ...req }
            } : null;
        }).filter((s): s is NonNullable<typeof s> => s !== null);

        const baseline = createBaseline({
            name,
            description,
            requirementSnapshots: snapshots
        });

        if (!this.data.baselines) { this.data.baselines = []; }
        this.data.baselines.push(baseline);
        this.save();
        return baseline;
    }

    public lockBaseline(baselineId: string): boolean {
        const baseline = this.getBaseline(baselineId);
        if (!baseline) { return false; }

        baseline.status = BaselineStatus.Locked;
        baseline.lockedAt = new Date().toISOString();

        // Mark all requirements in baseline as locked
        for (const snapshot of baseline.requirementSnapshots) {
            const req = this.getRequirement(snapshot.requirementId);
            if (req) {
                req.isLocked = true;
                req.lockedAt = baseline.lockedAt;
                req.baselineId = baselineId;
            }
        }

        this.save();
        return true;
    }

    // ========================================================================
    // REVIEWS
    // ========================================================================

    public getReviews(): Review[] {
        return this.data.reviews || [];
    }

    public getReview(id: string): Review | undefined {
        return this.data.reviews?.find(r => r.id === id);
    }

    public createReview(name: string, requirementIds: string[], dueDate?: string): Review {
        const review = createReview({
            name,
            requirementIds,
            dueDate
        });

        if (!this.data.reviews) { this.data.reviews = []; }
        this.data.reviews.push(review);

        // Update requirements with review ID
        for (const reqId of requirementIds) {
            const req = this.getRequirement(reqId);
            if (req) {
                req.currentReviewId = review.id;
                req.workflowState = 'in-review' as any;
            }
        }

        this.save();
        return review;
    }

    // ========================================================================
    // COMMENTS
    // ========================================================================

    public addComment(reqId: string, content: string, author: string, parentCommentId?: string): Comment | undefined {
        const req = this.getRequirement(reqId);
        if (!req) { return undefined; }

        const comment = createComment({
            content,
            author,
            parentCommentId
        });

        req.comments.push(comment);
        req.changeHistory.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            userId: author,
            userName: author,
            changeType: ChangeType.CommentAdded,
            description: 'Comment added',
            version: req.version
        });

        this.save();
        return comment;
    }

    public resolveComment(reqId: string, commentId: string, resolvedBy: string): boolean {
        const req = this.getRequirement(reqId);
        if (!req) { return false; }

        const comment = req.comments.find(c => c.id === commentId);
        if (comment) {
            comment.isResolved = true;
            comment.resolvedBy = resolvedBy;
            comment.resolvedAt = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    // ========================================================================
    // DOCUMENTS
    // ========================================================================

    public getDocuments(): RequirementDocument[] {
        return this.data.documents || [];
    }

    public getDocument(id: string): RequirementDocument | undefined {
        return this.data.documents?.find(d => d.id === id);
    }

    public createDocument(title: string, documentType: any): RequirementDocument {
        const doc = createDocument({ title, documentType });
        if (!this.data.documents) { this.data.documents = []; }
        this.data.documents.push(doc);
        this.save();
        return doc;
    }

    // ========================================================================
    // CUSTOM FIELDS
    // ========================================================================

    public getCustomFieldDefinitions(): CustomFieldDefinition[] {
        return this.data.customFieldDefinitions || [];
    }

    public addCustomFieldDefinition(definition: CustomFieldDefinition): void {
        if (!this.data.customFieldDefinitions) { this.data.customFieldDefinitions = []; }
        this.data.customFieldDefinitions.push(definition);
        this.save();
    }

    // ========================================================================
    // PROJECTS CRUD
    // ========================================================================

    public getProjects(): Project[] {
        return this.data.projects;
    }

    public getProject(id: string): Project | undefined {
        return this.data.projects.find(p => p.id === id);
    }

    public addProject(partial: Partial<Project> & { name: string }): Project {
        const project = createProject(partial);
        this.data.projects.push(project);
        this.save();
        return project;
    }

    public updateProject(id: string, updates: Partial<Project>): Project | undefined {
        const index = this.data.projects.findIndex(p => p.id === id);
        if (index !== -1) {
            this.data.projects[index] = {
                ...this.data.projects[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.save();
            return this.data.projects[index];
        }
        return undefined;
    }

    public deleteProject(id: string): boolean {
        this.data.projects = this.data.projects.filter(p => p.id !== id);
        this.save();
        return true;
    }

    public addMilestone(projectId: string, partial: Partial<Milestone> & { name: string; dueDate: string }): Milestone | undefined {
        const project = this.getProject(projectId);
        if (!project) {return undefined;}
        
        const milestone = createMilestone(partial);
        project.milestones.push(milestone);
        this.save();
        return milestone;
    }

    public updateMilestone(projectId: string, milestoneId: string, updates: Partial<Milestone>): Milestone | undefined {
        const project = this.getProject(projectId);
        if (!project) {return undefined;}
        
        const index = project.milestones.findIndex(m => m.id === milestoneId);
        if (index !== -1) {
            project.milestones[index] = { ...project.milestones[index], ...updates };
            this.save();
            return project.milestones[index];
        }
        return undefined;
    }

    public deleteMilestone(projectId: string, milestoneId: string): boolean {
        const project = this.getProject(projectId);
        if (!project) {return false;}
        
        project.milestones = project.milestones.filter(m => m.id !== milestoneId);
        this.save();
        return true;
    }

    // Tasks CRUD
    public getTasks(): Task[] {
        return this.data.tasks;
    }

    public getTasksByActiveProject(): Task[] {
        if (!this._activeProjectId) { return []; }
        return this.data.tasks.filter(t => t.projectId === this._activeProjectId);
    }

    public getRootTasksByActiveProject(): Task[] {
        if (!this._activeProjectId) { return []; }
        return this.data.tasks.filter(t => t.projectId === this._activeProjectId && !t.parentTaskId);
    }

    // Get all tasks (milestones are now stored in project.milestones, not as tasks)
    public getRegularTasks(): Task[] {
        return this.data.tasks;
    }

    // Get project milestones (not task-based)
    public getProjectMilestones(projectId?: string): Milestone[] {
        const pid = projectId || this._activeProjectId;
        if (!pid) { return []; }
        const project = this.getProject(pid);
        return project?.milestones || [];
    }

    // Get tasks linked to a milestone
    public getTasksByMilestone(milestoneId: string): Task[] {
        return this.data.tasks.filter(t => t.linkedMilestoneId === milestoneId);
    }

    public getTask(id: string): Task | undefined {
        return this.data.tasks.find(t => t.id === id);
    }

    public getRootTasks(): Task[] {
        return this.data.tasks.filter(t => !t.parentTaskId);
    }

    public getSubtasks(parentId: string): Task[] {
        return this.data.tasks.filter(t => t.parentTaskId === parentId);
    }

    public getTasksByProject(projectId: string): Task[] {
        return this.data.tasks.filter(t => t.projectId === projectId);
    }

    public getTasksDueSoon(days: number = 7): Task[] {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + days);
        
        const tasks = this._activeProjectId 
            ? this.data.tasks.filter(t => t.projectId === this._activeProjectId)
            : this.data.tasks;
        
        return tasks.filter(t => {
            if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') {return false;}
            const dueDate = new Date(t.dueDate);
            return dueDate >= now && dueDate <= future;
        });
    }

    public getOverdueTasks(): Task[] {
        const now = new Date();
        const tasks = this._activeProjectId 
            ? this.data.tasks.filter(t => t.projectId === this._activeProjectId)
            : this.data.tasks;
            
        return tasks.filter(t => {
            if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') {return false;}
            return new Date(t.dueDate) < now;
        });
    }

    public addTask(partial: Partial<Task> & { title: string }): Task {
        // Auto-assign to active project if not specified
        if (!partial.projectId && this._activeProjectId) {
            partial.projectId = this._activeProjectId;
        }
        const task = createTask(partial);
        this.data.tasks.push(task);

        // Update parent's subtasks array
        if (task.parentTaskId) {
            const parent = this.getTask(task.parentTaskId);
            if (parent) {
                parent.subtaskIds.push(task.id);
            }
        }

        // Update project's task list
        if (task.projectId) {
            const project = this.getProject(task.projectId);
            if (project) {
                project.taskIds.push(task.id);
            }
        }

        this.save();
        return task;
    }

    public updateTask(id: string, updates: Partial<Task>): Task | undefined {
        const index = this.data.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            this.data.tasks[index] = {
                ...this.data.tasks[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.save();
            return this.data.tasks[index];
        }
        return undefined;
    }

    public deleteTask(id: string): boolean {
        const task = this.getTask(id);
        if (!task) {return false;}

        // Remove from parent's subtasks
        if (task.parentTaskId) {
            const parent = this.getTask(task.parentTaskId);
            if (parent) {
                parent.subtaskIds = parent.subtaskIds.filter(s => s !== id);
            }
        }

        // Remove from project's task list
        if (task.projectId) {
            const project = this.getProject(task.projectId);
            if (project) {
                project.taskIds = project.taskIds.filter(t => t !== id);
            }
        }

        // Delete subtasks recursively
        for (const subtaskId of task.subtaskIds) {
            this.deleteTask(subtaskId);
        }

        this.data.tasks = this.data.tasks.filter(t => t.id !== id);
        this.save();
        return true;
    }

    public addFollowUp(taskId: string, partial: Partial<FollowUp> & { content: string; dueDate: string }): FollowUp | undefined {
        const task = this.getTask(taskId);
        if (!task) {return undefined;}
        
        const followUp = createFollowUp(partial);
        task.followUps.push(followUp);
        this.save();
        return followUp;
    }

    public completeFollowUp(taskId: string, followUpId: string): boolean {
        const task = this.getTask(taskId);
        if (!task) {return false;}
        
        const followUp = task.followUps.find(f => f.id === followUpId);
        if (followUp) {
            followUp.completed = true;
            followUp.completedDate = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    public getPendingFollowUps(): { task: Task; followUp: FollowUp }[] {
        const result: { task: Task; followUp: FollowUp }[] = [];
        for (const task of this.data.tasks) {
            for (const followUp of task.followUps) {
                if (!followUp.completed) {
                    result.push({ task, followUp });
                }
            }
        }
        return result.sort((a, b) => new Date(a.followUp.dueDate).getTime() - new Date(b.followUp.dueDate).getTime());
    }

    // Notes CRUD
    public getNotes(): Note[] {
        return this.data.notes;
    }

    public getNotesByActiveProject(): Note[] {
        if (!this._activeProjectId) { return []; }
        return this.data.notes.filter(n => n.projectId === this._activeProjectId);
    }

    public getNote(id: string): Note | undefined {
        return this.data.notes.find(n => n.id === id);
    }

    public getNotesByProject(projectId: string): Note[] {
        return this.data.notes.filter(n => n.projectId === projectId);
    }

    public getPinnedNotes(): Note[] {
        const notes = this._activeProjectId 
            ? this.data.notes.filter(n => n.projectId === this._activeProjectId)
            : this.data.notes;
        return notes.filter(n => n.isPinned);
    }

    public addNote(partial: Partial<Note> & { title: string }): Note {
        // Auto-assign to active project if not specified
        if (!partial.projectId && this._activeProjectId) {
            partial.projectId = this._activeProjectId;
        }
        const note = createNote(partial);
        this.data.notes.push(note);

        // Update project's note list
        if (note.projectId) {
            const project = this.getProject(note.projectId);
            if (project) {
                project.noteIds.push(note.id);
            }
        }

        this.save();
        return note;
    }

    public updateNote(id: string, updates: Partial<Note>): Note | undefined {
        const index = this.data.notes.findIndex(n => n.id === id);
        if (index !== -1) {
            this.data.notes[index] = {
                ...this.data.notes[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.save();
            return this.data.notes[index];
        }
        return undefined;
    }

    public deleteNote(id: string): boolean {
        const note = this.getNote(id);
        if (!note) {return false;}

        // Remove from project's note list
        if (note.projectId) {
            const project = this.getProject(note.projectId);
            if (project) {
                project.noteIds = project.noteIds.filter(n => n !== id);
            }
        }

        this.data.notes = this.data.notes.filter(n => n.id !== id);
        this.save();
        return true;
    }

    public toggleNotePin(id: string): boolean {
        const note = this.getNote(id);
        if (note) {
            note.isPinned = !note.isPinned;
            this.save();
            return true;
        }
        return false;
    }

    // Statistics with caching for performance
    public getStatistics(): {
        totalRequirements: number;
        requirementsByStatus: Record<string, number>;
        totalProjects: number;
        projectsByStatus: Record<string, number>;
        totalTasks: number;
        tasksByStatus: Record<string, number>;
        overdueTasks: number;
        pendingFollowUps: number;
        totalNotes: number;
    } {
        // Check if we have valid cached stats
        const now = Date.now();
        if (this.statsCache && (now - this.statsCache.timestamp) < this.STATS_CACHE_TTL) {
            return this.statsCache.stats;
        }
        
        // Compute new stats
        const stats = this.computeStatistics();
        this.statsCache = { stats, timestamp: now };
        return stats;
    }
    
    private computeStatistics(): {
        totalRequirements: number;
        requirementsByStatus: Record<string, number>;
        totalProjects: number;
        projectsByStatus: Record<string, number>;
        totalTasks: number;
        tasksByStatus: Record<string, number>;
        overdueTasks: number;
        pendingFollowUps: number;
        totalNotes: number;
    } {
        const requirementsByStatus: Record<string, number> = {};
        for (const req of this.data.requirements) {
            requirementsByStatus[req.status] = (requirementsByStatus[req.status] || 0) + 1;
        }

        const projectsByStatus: Record<string, number> = {};
        for (const proj of this.data.projects) {
            projectsByStatus[proj.status] = (projectsByStatus[proj.status] || 0) + 1;
        }

        const tasksByStatus: Record<string, number> = {};
        for (const task of this.data.tasks) {
            tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
        }

        return {
            totalRequirements: this.data.requirements.length,
            requirementsByStatus,
            totalProjects: this.data.projects.length,
            projectsByStatus,
            totalTasks: this.data.tasks.length,
            tasksByStatus,
            overdueTasks: this.getOverdueTasks().length,
            pendingFollowUps: this.getPendingFollowUps().length,
            totalNotes: this.data.notes.length
        };
    }
}
