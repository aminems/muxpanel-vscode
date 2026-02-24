import * as vscode from 'vscode';
import { DataService } from '../services';
import { 
    Requirement, 
    RequirementType, 
    RequirementStatus, 
    Priority, 
    VerificationMethod,
    TraceLinkType,
    RiskLevel,
    VerificationStatus,
    WorkflowState,
    createTraceLink,
    TraceLink,
    Comment
} from '../models';
import { formStyles, traceLinkStyles, commentStyles, historyStyles, escapeHtml } from './styles';

export class RequirementPanel {
    public static currentPanels: Map<string, RequirementPanel> = new Map();
    public static readonly viewType = 'muxpanel.requirement';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private dataService: DataService;
    private requirementId: string | undefined;
    private activeTab: string = 'general';

    public static createOrShow(extensionUri: vscode.Uri, requirementId?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (requirementId && RequirementPanel.currentPanels.has(requirementId)) {
            RequirementPanel.currentPanels.get(requirementId)!._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            RequirementPanel.viewType,
            requirementId ? 'Edit Requirement' : 'New Requirement',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        const requirementPanel = new RequirementPanel(panel, extensionUri, requirementId);
        if (requirementId) {
            RequirementPanel.currentPanels.set(requirementId, requirementPanel);
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, requirementId?: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.requirementId = requirementId;
        this.dataService = DataService.getInstance();

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await this.saveRequirement(message.data);
                        return;
                    case 'delete':
                        await this.deleteRequirement();
                        return;
                    case 'addTraceLink':
                        await this.addTraceLink(message.data);
                        return;
                    case 'removeTraceLink':
                        await this.removeTraceLink(message.linkId);
                        return;
                    case 'clearSuspect':
                        await this.clearSuspectLink(message.linkId);
                        return;
                    case 'addComment':
                        await this.addComment(message.data);
                        return;
                    case 'resolveComment':
                        await this.resolveComment(message.commentId);
                        return;
                    case 'setTab':
                        this.activeTab = message.tab;
                        return;
                    case 'analyzeImpact':
                        await this.showImpactAnalysis();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async saveRequirement(data: Partial<Requirement>) {
        if (this.requirementId) {
            this.dataService.updateRequirement(this.requirementId, data);
            vscode.window.showInformationMessage('Requirement updated successfully!');
        } else {
            const newReq = this.dataService.addRequirement(data as Partial<Requirement> & { title: string });
            this.requirementId = newReq.id;
            RequirementPanel.currentPanels.set(newReq.id, this);
            this._panel.title = `REQ: ${newReq.key}`;
            vscode.window.showInformationMessage(`Requirement ${newReq.key} created successfully!`);
        }
        this.update();
        vscode.commands.executeCommand('muxpanel.refreshRequirements');
    }

    private async deleteRequirement() {
        if (this.requirementId) {
            const requirement = this.dataService.getRequirement(this.requirementId);
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${requirement?.key || 'this requirement'}? This may affect trace links.`,
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                this.dataService.deleteRequirement(this.requirementId);
                vscode.window.showInformationMessage('Requirement deleted!');
                vscode.commands.executeCommand('muxpanel.refreshRequirements');
                this.dispose();
            }
        }
    }

    private async addTraceLink(data: { targetId: string, linkType: TraceLinkType }) {
        if (this.requirementId) {
            this.dataService.addTraceLink(this.requirementId, data.targetId, data.linkType);
            vscode.window.showInformationMessage('Trace link added!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshRequirements');
        }
    }

    private async removeTraceLink(linkId: string) {
        if (this.requirementId) {
            this.dataService.removeTraceLink(this.requirementId, linkId);
            vscode.window.showInformationMessage('Trace link removed!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshRequirements');
        }
    }

    private async clearSuspectLink(linkId: string) {
        if (this.requirementId) {
            this.dataService.clearSuspectLink(this.requirementId, linkId);
            vscode.window.showInformationMessage('Suspect flag cleared!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshRequirements');
        }
    }

    private async addComment(data: { text: string }) {
        if (this.requirementId) {
            this.dataService.addComment(this.requirementId, data.text, 'Current User');
            vscode.window.showInformationMessage('Comment added!');
            this.update();
        }
    }

    private async resolveComment(commentId: string) {
        if (this.requirementId) {
            this.dataService.resolveComment(this.requirementId, commentId, 'Current User');
            vscode.window.showInformationMessage('Comment resolved!');
            this.update();
        }
    }

    private async showImpactAnalysis() {
        if (this.requirementId) {
            const impact = this.dataService.analyzeImpact(this.requirementId);
            const directCount = impact.impactedItems.filter(i => i.depth === 1).length;
            const indirectCount = impact.impactedItems.filter(i => i.depth > 1).length;
            const message = `
Impact Analysis:
- Direct Impact: ${directCount} requirements
- Indirect Impact: ${indirectCount} requirements
- Total Affected: ${impact.impactedItems.length} items
            `.trim();
            vscode.window.showInformationMessage(message);
        }
    }

    public dispose() {
        if (this.requirementId) {
            RequirementPanel.currentPanels.delete(this.requirementId);
        }
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) { x.dispose(); }
        }
    }

    private update() {
        const requirement = this.requirementId 
            ? this.dataService.getRequirement(this.requirementId) 
            : undefined;
        
        if (requirement) {
            this._panel.title = `REQ: ${requirement.key}`;
        }
        
        this._panel.webview.html = this._getHtmlForWebview(requirement);
    }

    private _getHtmlForWebview(requirement?: Requirement) {
        const projects = this.dataService.getProjects();
        const allRequirements = this.dataService.getRequirements();
        const requirements = allRequirements.filter(r => r.id !== this.requirementId);
        
        // Build trace link options
        const traceLinkOptions = requirements.map(r => 
            `<option value="${r.id}">[${r.key}] ${r.title}</option>`
        ).join('');

        // Build trace links display
        const traceLinksHtml = requirement?.traces.map(t => {
            const target = allRequirements.find(r => r.id === t.targetId);
            const isSuspect = requirement.suspectLinkIds.includes(t.id);
            return `
                <div class="trace-link ${isSuspect ? 'suspect' : ''}">
                    <span class="link-type">${t.linkType}</span>
                    <span class="link-target">${target ? `[${target.key}] ${target.title}` : 'Unknown'}</span>
                    ${isSuspect ? '<span class="suspect-badge">⚠️ SUSPECT</span>' : ''}
                    <div class="link-actions">
                        ${isSuspect ? `<button onclick="clearSuspect('${t.id}')" class="btn-small">Clear Suspect</button>` : ''}
                        <button onclick="removeTraceLink('${t.id}')" class="btn-small btn-danger">Remove</button>
                    </div>
                </div>
            `;
        }).join('') || '<p class="empty-state">No trace links defined</p>';

        // Build comments display
        const commentsHtml = requirement?.comments.map(c => `
            <div class="comment ${c.isResolved ? 'resolved' : ''}">
                <div class="comment-header">
                    <strong>${c.author}</strong>
                    <span>${new Date(c.createdAt).toLocaleString()}</span>
                    ${c.isResolved ? '<span class="resolved-badge">✓ Resolved</span>' : ''}
                </div>
                <div class="comment-text">${c.content}</div>
                ${!c.isResolved ? `<button onclick="resolveComment('${c.id}')" class="btn-small">Resolve</button>` : ''}
            </div>
        `).join('') || '<p class="empty-state">No comments</p>';

        // Build change history display
        const historyHtml = requirement?.changeHistory.slice(-10).reverse().map(h => `
            <div class="history-item">
                <span class="history-version">v${h.version}</span>
                <span class="history-field">${h.fieldName || h.changeType}</span>
                <span class="history-user">${h.userName}</span>
                <span class="history-date">${new Date(h.timestamp).toLocaleString()}</span>
            </div>
        `).join('') || '<p class="empty-state">No changes recorded</p>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${requirement ? `REQ: ${requirement.key}` : 'New Requirement'}</title>
    <style>
        ${formStyles}
        ${traceLinkStyles}
        ${commentStyles}
        ${historyStyles}
        
        /* Requirement-specific styles */
        .header-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding: 16px 20px;
            background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
            border-radius: var(--mux-radius-lg);
            border: 1px solid var(--vscode-panel-border);
        }
        
        .header-info {
            display: flex;
            gap: 12px;
            align-items: center;
        }
        
        .key-badge {
            background: var(--mux-gradient-primary);
            color: white;
            padding: 6px 14px;
            border-radius: var(--mux-radius-md);
            font-weight: 700;
            font-size: 1em;
            letter-spacing: 0.02em;
        }
        
        .status-badge {
            padding: 6px 12px;
            border-radius: var(--mux-radius-md);
            font-size: 0.85em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .status-draft { background: rgba(102, 102, 102, 0.2); color: #999; }
        .status-under-review { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
        .status-approved { background: rgba(40, 167, 69, 0.2); color: #28a745; }
        .status-verified { background: rgba(23, 162, 184, 0.2); color: #17a2b8; }
        .status-rejected { background: rgba(220, 53, 69, 0.2); color: #dc3545; }
        .status-deprecated { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
        
        .locked-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: rgba(255, 193, 7, 0.15);
            color: #ffc107;
            border-radius: var(--mux-radius-md);
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .suspect-warning {
            background: linear-gradient(135deg, rgba(240, 173, 78, 0.15), rgba(240, 173, 78, 0.05));
            border: 1px solid #f0ad4e;
            border-left: 4px solid #f0ad4e;
            color: var(--vscode-foreground);
            padding: 16px 20px;
            border-radius: var(--mux-radius-md);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .suspect-warning strong {
            color: #f0ad4e;
        }
        
        .coverage-bar {
            height: 8px;
            background: var(--vscode-progressBar-background);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
        }
        
        .coverage-fill {
            height: 100%;
            background: var(--mux-gradient-success);
            transition: width 0.3s ease;
        }
        
        .checkbox-group {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            padding: 16px;
            background: var(--vscode-sideBar-background);
            border-radius: var(--mux-radius-md);
            border: 1px solid var(--vscode-panel-border);
        }
        
        .checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border-radius: var(--mux-radius-sm);
            cursor: pointer;
            transition: var(--mux-transition);
        }
        
        .checkbox-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .checkbox-item input {
            width: auto;
            margin: 0;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="header-bar">
        <div class="header-info">
            ${requirement ? `<span class="key-badge">${requirement.key}</span>` : '<span class="key-badge">NEW</span>'}
            ${requirement ? `<span class="status-badge status-${requirement.status.toLowerCase().replace(/\s/g, '-')}">${requirement.status}</span>` : ''}
            ${requirement?.isLocked ? '<span class="locked-indicator">🔒 Locked</span>' : ''}
        </div>
        <div>
            ${requirement ? `<span>v${requirement.version}</span>` : ''}
        </div>
    </div>
    
    ${requirement?.hasSuspectLinks ? `
    <div class="suspect-warning">
        ⚠️ <strong>Suspect Links Detected!</strong> 
        Some linked requirements have changed. Please review the trace links.
    </div>
    ` : ''}

    ${requirement ? `
    <div class="meta-info">
        <div class="meta-item"><span class="meta-label">Created:</span> ${new Date(requirement.createdAt).toLocaleString()}</div>
        <div class="meta-item"><span class="meta-label">Updated:</span> ${new Date(requirement.updatedAt).toLocaleString()}</div>
        <div class="meta-item"><span class="meta-label">Author:</span> ${requirement.author}</div>
        <div class="meta-item"><span class="meta-label">Owner:</span> ${requirement.owner || 'Unassigned'}</div>
        <div class="meta-item"><span class="meta-label">Coverage:</span> ${requirement.testCoverage}%</div>
        <div class="meta-item"><span class="meta-label">Workflow:</span> ${requirement.workflowState}</div>
    </div>
    ` : ''}

    <div class="tabs">
        <button class="tab active" data-tab="general">📋 General</button>
        <button class="tab" data-tab="details">📝 Details</button>
        ${requirement ? '<button class="tab" data-tab="traces">🔗 Trace Links</button>' : ''}
        ${requirement ? '<button class="tab" data-tab="verification">✅ Verification</button>' : ''}
        ${requirement ? '<button class="tab" data-tab="comments">💬 Comments</button>' : ''}
        ${requirement ? '<button class="tab" data-tab="history">📜 History</button>' : ''}
    </div>

    <form id="requirementForm">
        <!-- GENERAL TAB -->
        <div id="tab-general" class="tab-content active">
            <div class="form-group">
                <label for="title">Title *</label>
                <input type="text" id="title" required value="${escapeHtml(requirement?.title || '')}" ${requirement?.isLocked ? 'disabled' : ''} />
            </div>

            <div class="form-group">
                <label for="description">Description</label>
                <textarea id="description" ${requirement?.isLocked ? 'disabled' : ''}>${escapeHtml(requirement?.description || '')}</textarea>
            </div>

            <div class="row">
                <div class="form-group">
                    <label for="type">Type</label>
                    <select id="type" ${requirement?.isLocked ? 'disabled' : ''}>
                        ${Object.values(RequirementType).map(t => 
                            `<option value="${t}" ${requirement?.type === t ? 'selected' : ''}>${t}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="category">Category</label>
                    <input type="text" id="category" value="${escapeHtml(requirement?.category || '')}" ${requirement?.isLocked ? 'disabled' : ''} />
                </div>
            </div>

            <div class="row-3">
                <div class="form-group">
                    <label for="status">Status</label>
                    <select id="status" ${requirement?.isLocked ? 'disabled' : ''}>
                        ${Object.values(RequirementStatus).map(s => 
                            `<option value="${s}" ${requirement?.status === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="priority">Priority</label>
                    <select id="priority" ${requirement?.isLocked ? 'disabled' : ''}>
                        ${Object.values(Priority).map(p => 
                            `<option value="${p}" ${requirement?.priority === p ? 'selected' : ''}>${p}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="risk">Risk Level</label>
                    <select id="risk" ${requirement?.isLocked ? 'disabled' : ''}>
                        ${Object.values(RiskLevel).map(r => 
                            `<option value="${r}" ${requirement?.risk === r ? 'selected' : ''}>${r}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>

            <div class="row">
                <div class="form-group">
                    <label for="parentId">Parent Requirement</label>
                    <select id="parentId" ${requirement?.isLocked ? 'disabled' : ''}>
                        <option value="">-- None (Root Level) --</option>
                        ${requirements.map(r => 
                            `<option value="${r.id}" ${requirement?.parentId === r.id ? 'selected' : ''}>[${r.key}] ${escapeHtml(r.title)}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="projectId">Project</label>
                    <select id="projectId" ${requirement?.isLocked ? 'disabled' : ''}>
                        <option value="">-- No Project --</option>
                        ${projects.map(p => 
                            `<option value="${p.id}" ${(requirement?.projectId === p.id) || (!requirement && this.dataService.activeProjectId === p.id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
        </div>

        <!-- DETAILS TAB -->
        <div id="tab-details" class="tab-content">
            <div class="form-group">
                <label for="rationale">Rationale / Justification</label>
                <textarea id="rationale" ${requirement?.isLocked ? 'disabled' : ''}>${escapeHtml(requirement?.rationale || '')}</textarea>
            </div>

            <div class="form-group">
                <label for="acceptanceCriteria">Acceptance Criteria</label>
                <textarea id="acceptanceCriteria" ${requirement?.isLocked ? 'disabled' : ''}>${escapeHtml(requirement?.acceptanceCriteria || '')}</textarea>
            </div>

            <div class="form-group">
                <label for="assumptions">Assumptions</label>
                <textarea id="assumptions" ${requirement?.isLocked ? 'disabled' : ''}>${escapeHtml(requirement?.assumptions || '')}</textarea>
            </div>

            <div class="form-group">
                <label for="constraints">Constraints</label>
                <textarea id="constraints" ${requirement?.isLocked ? 'disabled' : ''}>${escapeHtml(requirement?.constraints || '')}</textarea>
            </div>

            <div class="row">
                <div class="form-group">
                    <label for="source">Source</label>
                    <input type="text" id="source" value="${escapeHtml(requirement?.source || '')}" ${requirement?.isLocked ? 'disabled' : ''} />
                </div>

                <div class="form-group">
                    <label for="owner">Owner</label>
                    <input type="text" id="owner" value="${escapeHtml(requirement?.owner || '')}" ${requirement?.isLocked ? 'disabled' : ''} />
                </div>
            </div>

            <div class="row">
                <div class="form-group">
                    <label for="complexity">Complexity (1-10)</label>
                    <input type="number" id="complexity" min="1" max="10" value="${requirement?.complexity || 5}" ${requirement?.isLocked ? 'disabled' : ''} />
                </div>

                <div class="form-group">
                    <label for="effort">Effort (hours)</label>
                    <input type="number" id="effort" min="0" value="0" ${requirement?.isLocked ? 'disabled' : ''} />
                </div>
            </div>

            <div class="form-group">
                <label for="tags">Tags (comma-separated)</label>
                <input type="text" id="tags" value="${requirement?.tags.join(', ') || ''}" ${requirement?.isLocked ? 'disabled' : ''} />
            </div>
        </div>

        <!-- TRACE LINKS TAB -->
        ${requirement ? `
        <div id="tab-traces" class="tab-content">
            <h2>🔗 Trace Links (${requirement.traces.length})</h2>
            <p style="opacity: 0.7; font-size: 0.9em;">
                Define relationships to other requirements for traceability and impact analysis.
            </p>
            
            ${traceLinksHtml}
            
            <div class="add-trace-form">
                <select id="traceTarget">
                    <option value="">Select target requirement...</option>
                    ${traceLinkOptions}
                </select>
                <select id="traceLinkType">
                    ${Object.values(TraceLinkType).map(t => 
                        `<option value="${t}">${t}</option>`
                    ).join('')}
                </select>
                <button type="button" onclick="addTraceLink()" class="btn-primary">Add Link</button>
            </div>
            
            <div style="margin-top: 20px;">
                <button type="button" onclick="analyzeImpact()" class="btn-secondary">📊 Analyze Impact</button>
            </div>
        </div>
        ` : ''}

        <!-- VERIFICATION TAB -->
        ${requirement ? `
        <div id="tab-verification" class="tab-content">
            <h2>✅ Verification</h2>
            
            <div class="form-group">
                <label>Verification Methods</label>
                <div class="checkbox-group">
                    ${Object.values(VerificationMethod).map(v => `
                        <label class="checkbox-item">
                            <input type="checkbox" name="verificationMethod" value="${v}" 
                                ${requirement?.verificationMethod.includes(v) ? 'checked' : ''} 
                                ${requirement?.isLocked ? 'disabled' : ''} />
                            ${v}
                        </label>
                    `).join('')}
                </div>
            </div>

            <div class="row">
                <div class="form-group">
                    <label for="verificationStatus">Verification Status</label>
                    <select id="verificationStatus" ${requirement?.isLocked ? 'disabled' : ''}>
                        ${Object.values(VerificationStatus).map(s => 
                            `<option value="${s}" ${requirement?.verificationStatus === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="testCoverage">Test Coverage (%)</label>
                    <input type="number" id="testCoverage" min="0" max="100" 
                        value="${requirement?.testCoverage || 0}" ${requirement?.isLocked ? 'disabled' : ''} />
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${requirement?.testCoverage || 0}%"></div>
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label for="testReferences">Test References (one per line)</label>
                <textarea id="testReferences" ${requirement?.isLocked ? 'disabled' : ''}>${requirement?.linkedTestCases?.join('\n') || ''}</textarea>
            </div>
        </div>
        ` : ''}

        <!-- COMMENTS TAB -->
        ${requirement ? `
        <div id="tab-comments" class="tab-content">
            <h2>💬 Comments (${requirement.comments.length})</h2>
            
            ${commentsHtml}
            
            <div class="add-comment-form">
                <textarea id="newComment" placeholder="Add a comment..."></textarea>
                <button type="button" onclick="addComment()" class="btn-primary">Add</button>
            </div>
        </div>
        ` : ''}

        <!-- HISTORY TAB -->
        ${requirement ? `
        <div id="tab-history" class="tab-content">
            <h2>📜 Change History</h2>
            <p style="opacity: 0.7; font-size: 0.9em;">
                Showing last 10 changes. Total ${requirement.changeHistory.length} changes recorded.
            </p>
            ${historyHtml}
        </div>
        ` : ''}

        <div class="buttons">
            <button type="submit" class="btn-primary" ${requirement?.isLocked ? 'disabled' : ''}>💾 Save</button>
            ${requirement && !requirement.isLocked ? '<button type="button" class="btn-danger" onclick="deleteRequirement()">🗑️ Delete</button>' : ''}
        </div>
    </form>

    <script>
        const vscode = acquireVsCodeApi();

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
                vscode.postMessage({ command: 'setTab', tab: tab.dataset.tab });
            });
        });

        // Form submission
        document.getElementById('requirementForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const verificationMethods = Array.from(document.querySelectorAll('input[name="verificationMethod"]:checked'))
                .map(cb => cb.value);
            
            const testReferencesEl = document.getElementById('testReferences');
            const testReferences = testReferencesEl ? testReferencesEl.value.split('\\n').filter(t => t.trim()) : [];
            
            const data = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                type: document.getElementById('type').value,
                category: document.getElementById('category')?.value || '',
                status: document.getElementById('status').value,
                priority: document.getElementById('priority').value,
                risk: document.getElementById('risk')?.value,
                parentId: document.getElementById('parentId').value || undefined,
                projectId: document.getElementById('projectId').value || undefined,
                rationale: document.getElementById('rationale')?.value || undefined,
                acceptanceCriteria: document.getElementById('acceptanceCriteria')?.value || undefined,
                assumptions: document.getElementById('assumptions')?.value || undefined,
                constraints: document.getElementById('constraints')?.value || undefined,
                source: document.getElementById('source')?.value || undefined,
                owner: document.getElementById('owner')?.value || undefined,
                verificationMethod: verificationMethods.length > 0 ? verificationMethods : ['${VerificationMethod.Demonstration}'],
                verificationStatus: document.getElementById('verificationStatus')?.value,
                testCoverage: parseInt(document.getElementById('testCoverage')?.value || '0'),
                tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t)
            };

            vscode.postMessage({ command: 'save', data });
        });

        function deleteRequirement() {
            vscode.postMessage({ command: 'delete' });
        }

        function addTraceLink() {
            const targetId = document.getElementById('traceTarget').value;
            const linkType = document.getElementById('traceLinkType').value;
            if (targetId) {
                vscode.postMessage({ 
                    command: 'addTraceLink', 
                    data: { targetId, linkType }
                });
            }
        }

        function removeTraceLink(linkId) {
            vscode.postMessage({ command: 'removeTraceLink', linkId });
        }

        function clearSuspect(linkId) {
            vscode.postMessage({ command: 'clearSuspect', linkId });
        }

        function addComment() {
            const text = document.getElementById('newComment').value.trim();
            if (text) {
                vscode.postMessage({ command: 'addComment', data: { text } });
                document.getElementById('newComment').value = '';
            }
        }

        function resolveComment(commentId) {
            vscode.postMessage({ command: 'resolveComment', commentId });
        }

        function analyzeImpact() {
            vscode.postMessage({ command: 'analyzeImpact' });
        }
    </script>
</body>
</html>`;
    }
}
