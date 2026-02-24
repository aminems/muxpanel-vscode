// ============================================================================
// REQUIREMENT MODEL - Enterprise-grade Requirements Management
// Modeled after Jama Connect, IBM DOORS, and Polarion
// ============================================================================

export interface Requirement {
    // Core Identity
    id: string;
    key: string;                          // Human-readable key (e.g., REQ-001, SYS-042)
    globalId?: string;                    // External system ID for import/export
    
    // Content
    title: string;
    description: string;                  // Rich text/HTML content
    rationale?: string;                   // Why this requirement exists
    acceptanceCriteria?: string;          // How to verify completion
    assumptions?: string;                 // Underlying assumptions
    constraints?: string;                 // Known constraints
    
    // Classification
    type: RequirementType;
    category: RequirementCategory;
    status: RequirementStatus;
    priority: Priority;
    risk: RiskLevel;
    complexity: ComplexityLevel;
    
    // Hierarchy & Structure
    parentId?: string;
    children: string[];
    documentId?: string;                  // Parent document/specification
    sectionNumber?: string;               // Document section (e.g., "3.2.1")
    sortOrder: number;                    // Order within parent
    level: number;                        // Hierarchy depth level
    
    // Traceability - Jama-style relationships
    traces: TraceLink[];                  // All trace relationships
    
    // Verification & Validation
    verificationMethod: VerificationMethod[];
    verificationStatus: VerificationStatus;
    testCoverage: number;                 // 0-100 percentage
    linkedTestCases: string[];
    
    // Ownership & Assignment
    owner?: string;
    author: string;
    assignedTo?: string;
    stakeholders: string[];
    reviewers: string[];
    
    // Project Association
    projectId?: string;
    releaseId?: string;
    componentId?: string;
    
    // Lifecycle & Change Management
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    version: number;                      // Numeric version for tracking
    versionLabel: string;                 // Display version (e.g., "1.0", "2.1-draft")
    changeHistory: ChangeRecord[];
    
    // Baseline & Configuration Management
    baselineId?: string;                  // Current baseline if locked
    isLocked: boolean;
    lockedAt?: string;
    lockedBy?: string;
    
    // Suspect Links (Jama feature)
    hasSuspectLinks: boolean;
    suspectLinkIds: string[];
    
    // Review & Approval Workflow
    workflowState: WorkflowState;
    currentReviewId?: string;
    approvalHistory: ApprovalRecord[];
    
    // Comments & Discussions
    comments: Comment[];
    
    // Custom Attributes (extensible like Jama)
    customFields: Record<string, CustomFieldValue>;
    
    // Metadata
    tags: string[];
    attachments: Attachment[];
    source?: string;                      // Origin of requirement (customer, regulation, etc.)
    sourceReference?: string;             // External reference
    allocatedTo?: string[];               // System/subsystem allocation
    
    // Derived Metrics (calculated)
    derivedFrom: string[];                // Parent requirements this is derived from
    derivedTo: string[];                  // Child requirements derived from this
    implementedBy: string[];              // Components/code implementing this
    verifiedBy: string[];                 // Test cases verifying this
}

// ============================================================================
// ENUMERATIONS
// ============================================================================

export enum RequirementType {
    Stakeholder = 'stakeholder',          // User/stakeholder needs
    System = 'system',                    // System-level requirements
    Subsystem = 'subsystem',              // Subsystem requirements
    Software = 'software',                // Software requirements
    Hardware = 'hardware',                // Hardware requirements
    Interface = 'interface',              // Interface requirements
    Functional = 'functional',            // Functional requirements
    NonFunctional = 'non-functional',     // Non-functional requirements
    Performance = 'performance',          // Performance requirements
    Safety = 'safety',                    // Safety requirements
    Security = 'security',                // Security requirements
    Reliability = 'reliability',          // Reliability requirements
    Usability = 'usability',              // Usability requirements
    Constraint = 'constraint',            // Design constraints
    Assumption = 'assumption',            // Assumptions
    Regulatory = 'regulatory',            // Regulatory requirements
    Business = 'business',                // Business requirements
    Design = 'design'                     // Design requirements
}

export enum RequirementCategory {
    Need = 'need',                        // Stakeholder need
    Feature = 'feature',                  // Feature/capability
    Requirement = 'requirement',          // Formal requirement
    Specification = 'specification',      // Technical specification
    Constraint = 'constraint',            // Constraint
    Standard = 'standard'                 // Standard/regulation reference
}

export enum RequirementStatus {
    Draft = 'draft',
    Proposed = 'proposed',
    UnderReview = 'under-review',
    Reviewed = 'reviewed',
    Approved = 'approved',
    Active = 'active',
    Implemented = 'implemented',
    Verified = 'verified',
    Validated = 'validated',
    Released = 'released',
    Rejected = 'rejected',
    Deferred = 'deferred',
    Deprecated = 'deprecated',
    Deleted = 'deleted'
}

export enum Priority {
    Critical = 'critical',
    High = 'high',
    Medium = 'medium',
    Low = 'low',
    Optional = 'optional'
}

export enum RiskLevel {
    VeryHigh = 'very-high',
    High = 'high',
    Medium = 'medium',
    Low = 'low',
    VeryLow = 'very-low',
    Unknown = 'unknown'
}

export enum ComplexityLevel {
    VeryHigh = 'very-high',
    High = 'high',
    Medium = 'medium',
    Low = 'low',
    Trivial = 'trivial'
}

export enum VerificationMethod {
    Test = 'test',                        // T - Test
    Analysis = 'analysis',                // A - Analysis
    Inspection = 'inspection',            // I - Inspection
    Demonstration = 'demonstration',      // D - Demonstration
    Review = 'review',                    // R - Review
    Simulation = 'simulation',            // S - Simulation
    Certification = 'certification'       // C - Certification
}

export enum VerificationStatus {
    NotStarted = 'not-started',
    InProgress = 'in-progress',
    PartiallyVerified = 'partially-verified',
    Verified = 'verified',
    Failed = 'failed',
    Blocked = 'blocked',
    NotApplicable = 'not-applicable'
}

export enum WorkflowState {
    New = 'new',
    InProgress = 'in-progress',
    ReadyForReview = 'ready-for-review',
    InReview = 'in-review',
    Rework = 'rework',
    Approved = 'approved',
    Baselined = 'baselined',
    ChangeRequested = 'change-requested'
}

// ============================================================================
// TRACEABILITY (Jama-style)
// ============================================================================

export interface TraceLink {
    id: string;
    sourceId: string;                     // This requirement
    targetId: string;                     // Target item
    targetType: TraceLinkTargetType;      // Type of target
    linkType: TraceLinkType;              // Relationship type
    description?: string;
    isSuspect: boolean;                   // Link is suspect (target changed)
    suspectReason?: string;
    createdAt: string;
    createdBy: string;
    verifiedAt?: string;
    verifiedBy?: string;
}

export enum TraceLinkTargetType {
    Requirement = 'requirement',
    TestCase = 'test-case',
    Task = 'task',
    Defect = 'defect',
    RiskItem = 'risk-item',
    Component = 'component',
    Document = 'document',
    ExternalItem = 'external-item'
}

export enum TraceLinkType {
    // Hierarchical
    ParentOf = 'parent-of',
    ChildOf = 'child-of',
    
    // Derivation
    DerivedFrom = 'derived-from',
    DerivesTo = 'derives-to',
    
    // Satisfaction
    SatisfiedBy = 'satisfied-by',
    Satisfies = 'satisfies',
    
    // Verification
    VerifiedBy = 'verified-by',
    Verifies = 'verifies',
    
    // Implementation
    ImplementedBy = 'implemented-by',
    Implements = 'implements',
    
    // Allocation
    AllocatedTo = 'allocated-to',
    AllocatedFrom = 'allocated-from',
    
    // Refinement
    RefinedBy = 'refined-by',
    Refines = 'refines',
    
    // Copy/Reference
    CopyOf = 'copy-of',
    ReferencedBy = 'referenced-by',
    References = 'references',
    
    // Conflict/Dependency
    ConflictsWith = 'conflicts-with',
    DependsOn = 'depends-on',
    
    // Related
    RelatedTo = 'related-to',
    
    // Test relationships
    TestedBy = 'tested-by',
    Tests = 'tests',
    CoveredBy = 'covered-by',
    Covers = 'covers'
}

// ============================================================================
// CHANGE MANAGEMENT
// ============================================================================

export interface ChangeRecord {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    changeType: ChangeType;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    description?: string;
    version: number;
}

export enum ChangeType {
    Created = 'created',
    Updated = 'updated',
    StatusChanged = 'status-changed',
    TraceLinkAdded = 'trace-link-added',
    TraceLinkRemoved = 'trace-link-removed',
    CommentAdded = 'comment-added',
    AttachmentAdded = 'attachment-added',
    AttachmentRemoved = 'attachment-removed',
    Baselined = 'baselined',
    Locked = 'locked',
    Unlocked = 'unlocked',
    Approved = 'approved',
    Rejected = 'rejected'
}

// ============================================================================
// REVIEW & APPROVAL
// ============================================================================

export interface ApprovalRecord {
    id: string;
    reviewId: string;
    userId: string;
    userName: string;
    decision: ApprovalDecision;
    comments?: string;
    timestamp: string;
    signatureData?: string;               // Digital signature
}

export enum ApprovalDecision {
    Pending = 'pending',
    Approved = 'approved',
    ApprovedWithComments = 'approved-with-comments',
    Rejected = 'rejected',
    Abstained = 'abstained'
}

export interface Review {
    id: string;
    name: string;
    description?: string;
    status: ReviewStatus;
    requirementIds: string[];
    reviewers: ReviewerInfo[];
    dueDate?: string;
    createdAt: string;
    createdBy: string;
    completedAt?: string;
}

export interface ReviewerInfo {
    userId: string;
    userName: string;
    role: ReviewerRole;
    status: ReviewerStatus;
    assignedAt: string;
    completedAt?: string;
}

export enum ReviewStatus {
    Draft = 'draft',
    Open = 'open',
    InProgress = 'in-progress',
    Completed = 'completed',
    Cancelled = 'cancelled'
}

export enum ReviewerRole {
    Reviewer = 'reviewer',
    Approver = 'approver',
    Observer = 'observer'
}

export enum ReviewerStatus {
    Pending = 'pending',
    InProgress = 'in-progress',
    Completed = 'completed'
}

// ============================================================================
// COMMENTS & DISCUSSIONS
// ============================================================================

export interface Comment {
    id: string;
    content: string;
    author: string;
    authorName: string;
    createdAt: string;
    updatedAt?: string;
    parentCommentId?: string;             // For threaded discussions
    isResolved: boolean;
    resolvedBy?: string;
    resolvedAt?: string;
    mentions: string[];                   // @mentioned users
}

// ============================================================================
// BASELINE & CONFIGURATION MANAGEMENT
// ============================================================================

export interface Baseline {
    id: string;
    name: string;
    description?: string;
    version: string;
    status: BaselineStatus;
    requirementSnapshots: RequirementSnapshot[];
    createdAt: string;
    createdBy: string;
    lockedAt?: string;
    tags: string[];
}

export interface RequirementSnapshot {
    requirementId: string;
    version: number;
    snapshot: Requirement;                // Full copy at baseline time
}

export enum BaselineStatus {
    Draft = 'draft',
    Active = 'active',
    Locked = 'locked',
    Archived = 'archived',
    Superseded = 'superseded'
}

// ============================================================================
// CUSTOM FIELDS (Jama-style extensibility)
// ============================================================================

export interface CustomFieldDefinition {
    id: string;
    name: string;
    key: string;
    fieldType: CustomFieldType;
    description?: string;
    isRequired: boolean;
    defaultValue?: CustomFieldValue;
    options?: string[];                   // For picklist types
    validation?: string;                  // Regex or validation rule
    applicableTypes: RequirementType[];   // Which req types can use this
}

export type CustomFieldValue = string | number | boolean | string[] | Date | null;

export enum CustomFieldType {
    Text = 'text',
    TextArea = 'text-area',
    RichText = 'rich-text',
    Integer = 'integer',
    Decimal = 'decimal',
    Boolean = 'boolean',
    Date = 'date',
    DateTime = 'date-time',
    SingleSelect = 'single-select',
    MultiSelect = 'multi-select',
    User = 'user',
    UserList = 'user-list',
    URL = 'url',
    Attachment = 'attachment'
}

// ============================================================================
// ATTACHMENTS
// ============================================================================

export interface Attachment {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    filePath: string;
    uploadedAt: string;
    uploadedBy: string;
    description?: string;
}

// ============================================================================
// DOCUMENT/SPECIFICATION STRUCTURE
// ============================================================================

export interface RequirementDocument {
    id: string;
    key: string;
    title: string;
    description?: string;
    documentType: DocumentType;
    status: DocumentStatus;
    version: string;
    sections: DocumentSection[];
    requirementIds: string[];             // All requirements in this document
    projectId?: string;
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    template?: string;                    // Template used
}

export interface DocumentSection {
    id: string;
    number: string;                       // e.g., "3.2.1"
    title: string;
    description?: string;
    parentSectionId?: string;
    requirementIds: string[];
    sortOrder: number;
}

export enum DocumentType {
    SRS = 'srs',                           // Software Requirements Specification
    SyRS = 'syrs',                         // System Requirements Specification
    ConOps = 'conops',                     // Concept of Operations
    URD = 'urd',                           // User Requirements Document
    IRS = 'irs',                           // Interface Requirements Specification
    PRS = 'prs',                           // Product Requirements Specification
    FRS = 'frs',                           // Functional Requirements Specification
    HRS = 'hrs',                           // Hardware Requirements Specification
    Custom = 'custom'
}

export enum DocumentStatus {
    Draft = 'draft',
    InReview = 'in-review',
    Approved = 'approved',
    Released = 'released',
    Obsolete = 'obsolete'
}

// ============================================================================
// TRACEABILITY MATRIX
// ============================================================================

export interface TraceabilityMatrix {
    id: string;
    name: string;
    description?: string;
    sourceFilter: MatrixFilter;
    targetFilter: MatrixFilter;
    linkTypes: TraceLinkType[];
    createdAt: string;
    createdBy: string;
}

export interface MatrixFilter {
    types?: RequirementType[];
    statuses?: RequirementStatus[];
    documentIds?: string[];
    projectIds?: string[];
    tags?: string[];
}

export interface MatrixCell {
    sourceId: string;
    targetId: string;
    linkType: TraceLinkType;
    isSuspect: boolean;
}

// ============================================================================
// COVERAGE ANALYSIS
// ============================================================================

export interface CoverageReport {
    id: string;
    name: string;
    generatedAt: string;
    generatedBy: string;
    totalRequirements: number;
    coveredRequirements: number;
    coveragePercentage: number;
    byType: Record<RequirementType, CoverageStats>;
    byStatus: Record<RequirementStatus, CoverageStats>;
    uncoveredRequirements: string[];
    partiallyCoveredRequirements: string[];
}

export interface CoverageStats {
    total: number;
    covered: number;
    partial: number;
    uncovered: number;
    percentage: number;
}

// ============================================================================
// IMPACT ANALYSIS
// ============================================================================

export interface ImpactAnalysis {
    sourceRequirementId: string;
    impactedItems: ImpactedItem[];
    generatedAt: string;
    depth: number;                        // How many levels deep to analyze
}

export interface ImpactedItem {
    id: string;
    type: TraceLinkTargetType;
    title: string;
    linkType: TraceLinkType;
    depth: number;                        // Distance from source
    path: string[];                       // Trace path to this item
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createRequirement(partial: Partial<Requirement> & { title: string }): Requirement {
    const now = new Date().toISOString();
    const id = partial.id || generateId();
    
    return {
        // Core Identity
        id,
        key: partial.key || generateKey(),
        globalId: partial.globalId,
        
        // Content
        title: partial.title,
        description: partial.description || '',
        rationale: partial.rationale,
        acceptanceCriteria: partial.acceptanceCriteria,
        assumptions: partial.assumptions,
        constraints: partial.constraints,
        
        // Classification
        type: partial.type || RequirementType.Functional,
        category: partial.category || RequirementCategory.Requirement,
        status: partial.status || RequirementStatus.Draft,
        priority: partial.priority || Priority.Medium,
        risk: partial.risk || RiskLevel.Unknown,
        complexity: partial.complexity || ComplexityLevel.Medium,
        
        // Hierarchy & Structure
        parentId: partial.parentId,
        children: partial.children || [],
        documentId: partial.documentId,
        sectionNumber: partial.sectionNumber,
        sortOrder: partial.sortOrder || 0,
        level: partial.level || 0,
        
        // Traceability
        traces: partial.traces || [],
        
        // Verification & Validation
        verificationMethod: partial.verificationMethod || [VerificationMethod.Test],
        verificationStatus: partial.verificationStatus || VerificationStatus.NotStarted,
        testCoverage: partial.testCoverage || 0,
        linkedTestCases: partial.linkedTestCases || [],
        
        // Ownership & Assignment
        owner: partial.owner,
        author: partial.author || 'system',
        assignedTo: partial.assignedTo,
        stakeholders: partial.stakeholders || [],
        reviewers: partial.reviewers || [],
        
        // Project Association
        projectId: partial.projectId,
        releaseId: partial.releaseId,
        componentId: partial.componentId,
        
        // Lifecycle & Change Management
        createdAt: partial.createdAt || now,
        createdBy: partial.createdBy || 'system',
        updatedAt: now,
        updatedBy: partial.updatedBy || 'system',
        version: partial.version || 1,
        versionLabel: partial.versionLabel || '1.0',
        changeHistory: partial.changeHistory || [{
            id: generateId(),
            timestamp: now,
            userId: 'system',
            userName: 'System',
            changeType: ChangeType.Created,
            description: 'Requirement created',
            version: 1
        }],
        
        // Baseline & Configuration Management
        baselineId: partial.baselineId,
        isLocked: partial.isLocked || false,
        lockedAt: partial.lockedAt,
        lockedBy: partial.lockedBy,
        
        // Suspect Links
        hasSuspectLinks: partial.hasSuspectLinks || false,
        suspectLinkIds: partial.suspectLinkIds || [],
        
        // Review & Approval Workflow
        workflowState: partial.workflowState || WorkflowState.New,
        currentReviewId: partial.currentReviewId,
        approvalHistory: partial.approvalHistory || [],
        
        // Comments & Discussions
        comments: partial.comments || [],
        
        // Custom Attributes
        customFields: partial.customFields || {},
        
        // Metadata
        tags: partial.tags || [],
        attachments: partial.attachments || [],
        source: partial.source,
        sourceReference: partial.sourceReference,
        allocatedTo: partial.allocatedTo || [],
        
        // Derived Metrics
        derivedFrom: partial.derivedFrom || [],
        derivedTo: partial.derivedTo || [],
        implementedBy: partial.implementedBy || [],
        verifiedBy: partial.verifiedBy || []
    };
}

export function createTraceLink(partial: Partial<TraceLink> & { sourceId: string; targetId: string; linkType: TraceLinkType }): TraceLink {
    return {
        id: partial.id || generateId(),
        sourceId: partial.sourceId,
        targetId: partial.targetId,
        targetType: partial.targetType || TraceLinkTargetType.Requirement,
        linkType: partial.linkType,
        description: partial.description,
        isSuspect: partial.isSuspect || false,
        suspectReason: partial.suspectReason,
        createdAt: partial.createdAt || new Date().toISOString(),
        createdBy: partial.createdBy || 'system',
        verifiedAt: partial.verifiedAt,
        verifiedBy: partial.verifiedBy
    };
}

export function createBaseline(partial: Partial<Baseline> & { name: string }): Baseline {
    return {
        id: partial.id || generateId(),
        name: partial.name,
        description: partial.description,
        version: partial.version || '1.0',
        status: partial.status || BaselineStatus.Draft,
        requirementSnapshots: partial.requirementSnapshots || [],
        createdAt: partial.createdAt || new Date().toISOString(),
        createdBy: partial.createdBy || 'system',
        lockedAt: partial.lockedAt,
        tags: partial.tags || []
    };
}

export function createReview(partial: Partial<Review> & { name: string }): Review {
    return {
        id: partial.id || generateId(),
        name: partial.name,
        description: partial.description,
        status: partial.status || ReviewStatus.Draft,
        requirementIds: partial.requirementIds || [],
        reviewers: partial.reviewers || [],
        dueDate: partial.dueDate,
        createdAt: partial.createdAt || new Date().toISOString(),
        createdBy: partial.createdBy || 'system',
        completedAt: partial.completedAt
    };
}

export function createComment(partial: Partial<Comment> & { content: string; author: string }): Comment {
    return {
        id: partial.id || generateId(),
        content: partial.content,
        author: partial.author,
        authorName: partial.authorName || partial.author,
        createdAt: partial.createdAt || new Date().toISOString(),
        updatedAt: partial.updatedAt,
        parentCommentId: partial.parentCommentId,
        isResolved: partial.isResolved || false,
        resolvedBy: partial.resolvedBy,
        resolvedAt: partial.resolvedAt,
        mentions: partial.mentions || []
    };
}

export function createDocument(partial: Partial<RequirementDocument> & { title: string }): RequirementDocument {
    const now = new Date().toISOString();
    return {
        id: partial.id || generateId(),
        key: partial.key || generateDocKey(),
        title: partial.title,
        description: partial.description,
        documentType: partial.documentType || DocumentType.Custom,
        status: partial.status || DocumentStatus.Draft,
        version: partial.version || '1.0',
        sections: partial.sections || [],
        requirementIds: partial.requirementIds || [],
        projectId: partial.projectId,
        createdAt: partial.createdAt || now,
        createdBy: partial.createdBy || 'system',
        updatedAt: now,
        updatedBy: partial.updatedBy || 'system',
        template: partial.template
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

let keyCounter = 0;

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateKey(): string {
    keyCounter++;
    return `REQ-${String(keyCounter).padStart(4, '0')}`;
}

function generateDocKey(): string {
    return `DOC-${Date.now().toString(36).toUpperCase()}`;
}

export function resetKeyCounter(startFrom: number = 0): void {
    keyCounter = startFrom;
}

export function setKeyCounter(value: number): void {
    keyCounter = value;
}

// Get inverse link type for bidirectional tracing
export function getInverseLinkType(linkType: TraceLinkType): TraceLinkType {
    const inverseMap: Record<TraceLinkType, TraceLinkType> = {
        [TraceLinkType.ParentOf]: TraceLinkType.ChildOf,
        [TraceLinkType.ChildOf]: TraceLinkType.ParentOf,
        [TraceLinkType.DerivedFrom]: TraceLinkType.DerivesTo,
        [TraceLinkType.DerivesTo]: TraceLinkType.DerivedFrom,
        [TraceLinkType.SatisfiedBy]: TraceLinkType.Satisfies,
        [TraceLinkType.Satisfies]: TraceLinkType.SatisfiedBy,
        [TraceLinkType.VerifiedBy]: TraceLinkType.Verifies,
        [TraceLinkType.Verifies]: TraceLinkType.VerifiedBy,
        [TraceLinkType.ImplementedBy]: TraceLinkType.Implements,
        [TraceLinkType.Implements]: TraceLinkType.ImplementedBy,
        [TraceLinkType.AllocatedTo]: TraceLinkType.AllocatedFrom,
        [TraceLinkType.AllocatedFrom]: TraceLinkType.AllocatedTo,
        [TraceLinkType.RefinedBy]: TraceLinkType.Refines,
        [TraceLinkType.Refines]: TraceLinkType.RefinedBy,
        [TraceLinkType.CopyOf]: TraceLinkType.CopyOf,
        [TraceLinkType.ReferencedBy]: TraceLinkType.References,
        [TraceLinkType.References]: TraceLinkType.ReferencedBy,
        [TraceLinkType.ConflictsWith]: TraceLinkType.ConflictsWith,
        [TraceLinkType.DependsOn]: TraceLinkType.DependsOn,
        [TraceLinkType.RelatedTo]: TraceLinkType.RelatedTo,
        [TraceLinkType.TestedBy]: TraceLinkType.Tests,
        [TraceLinkType.Tests]: TraceLinkType.TestedBy,
        [TraceLinkType.CoveredBy]: TraceLinkType.Covers,
        [TraceLinkType.Covers]: TraceLinkType.CoveredBy
    };
    return inverseMap[linkType] || linkType;
}

// Check if requirement has all required fields for a given status
export function validateRequirementForStatus(req: Requirement, targetStatus: RequirementStatus): string[] {
    const errors: string[] = [];
    
    if (targetStatus === RequirementStatus.Approved || 
        targetStatus === RequirementStatus.Active ||
        targetStatus === RequirementStatus.Released) {
        if (!req.description || req.description.trim().length < 10) {
            errors.push('Description is required and must be at least 10 characters');
        }
        if (req.verificationMethod.length === 0) {
            errors.push('At least one verification method must be specified');
        }
        if (!req.priority) {
            errors.push('Priority must be set');
        }
    }
    
    if (targetStatus === RequirementStatus.Verified || targetStatus === RequirementStatus.Validated) {
        if (req.testCoverage < 100) {
            errors.push('Requirement must have 100% test coverage before verification');
        }
        if (req.verificationStatus !== VerificationStatus.Verified) {
            errors.push('Verification status must be Verified');
        }
    }
    
    return errors;
}
