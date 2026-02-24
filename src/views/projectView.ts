import * as vscode from 'vscode';
import { DataService } from '../services';
import { Project, ProjectStatus, MilestoneStatus } from '../models';
import { formStyles, milestoneStyles, escapeHtml } from './styles';

export class ProjectPanel {
    public static currentPanels: Map<string, ProjectPanel> = new Map();
    public static readonly viewType = 'muxpanel.project';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private dataService: DataService;
    private projectId: string | undefined;

    public static createOrShow(extensionUri: vscode.Uri, projectId?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (projectId && ProjectPanel.currentPanels.has(projectId)) {
            ProjectPanel.currentPanels.get(projectId)!._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ProjectPanel.viewType,
            projectId ? 'Edit Project' : 'New Project',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        const projectPanel = new ProjectPanel(panel, extensionUri, projectId);
        if (projectId) {
            ProjectPanel.currentPanels.set(projectId, projectPanel);
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, projectId?: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.projectId = projectId;
        this.dataService = DataService.getInstance();

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await this.saveProject(message.data);
                        return;
                    case 'delete':
                        await this.deleteProject();
                        return;
                    case 'addMilestone':
                        await this.addMilestone(message.data);
                        return;
                    case 'deleteMilestone':
                        await this.deleteMilestone(message.milestoneId);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async saveProject(data: Partial<Project>) {
        if (this.projectId) {
            this.dataService.updateProject(this.projectId, data);
            vscode.window.showInformationMessage('Project updated successfully!');
        } else {
            const newProj = this.dataService.addProject(data as Partial<Project> & { name: string });
            this.projectId = newProj.id;
            ProjectPanel.currentPanels.set(newProj.id, this);
            this._panel.title = 'Edit Project';
            vscode.window.showInformationMessage('Project created successfully!');
        }
        this.update();
        vscode.commands.executeCommand('muxpanel.refreshProjects');
    }

    private async deleteProject() {
        if (this.projectId) {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to delete this project?',
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                this.dataService.deleteProject(this.projectId);
                vscode.window.showInformationMessage('Project deleted!');
                vscode.commands.executeCommand('muxpanel.refreshProjects');
                this.dispose();
            }
        }
    }

    private async addMilestone(data: { name: string; dueDate: string; description?: string }) {
        if (this.projectId) {
            this.dataService.addMilestone(this.projectId, data);
            vscode.window.showInformationMessage('Milestone added!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshProjects');
        }
    }

    private async deleteMilestone(milestoneId: string) {
        if (this.projectId) {
            this.dataService.deleteMilestone(this.projectId, milestoneId);
            vscode.window.showInformationMessage('Milestone deleted!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshProjects');
        }
    }

    public dispose() {
        if (this.projectId) {
            ProjectPanel.currentPanels.delete(this.projectId);
        }
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private update() {
        const project = this.projectId 
            ? this.dataService.getProject(this.projectId) 
            : undefined;
        this._panel.webview.html = this._getHtmlForWebview(project);
    }

    private _getHtmlForWebview(project?: Project) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project ? 'Edit' : 'New'} Project</title>
    <style>
        ${formStyles}
        ${milestoneStyles}
        
        /* Project-specific styles */
        .project-progress {
            padding: 24px;
            background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
            border-radius: var(--mux-radius-lg);
            border: 1px solid var(--vscode-panel-border);
            margin-bottom: 24px;
        }
        
        .progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        
        .progress-percentage {
            font-size: 2.5em;
            font-weight: 700;
            background: var(--mux-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .progress-status {
            padding: 6px 14px;
            border-radius: var(--mux-radius-md);
            font-size: 0.85em;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-active { background: rgba(40, 167, 69, 0.2); color: #28a745; }
        .status-planning { background: rgba(23, 162, 184, 0.2); color: #17a2b8; }
        .status-on-hold { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
        .status-completed { background: rgba(40, 167, 69, 0.2); color: #28a745; }
        .status-cancelled { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
        
        .large-progress-bar {
            width: 100%;
            height: 16px;
            background: var(--vscode-progressBar-background);
            border-radius: 8px;
            overflow: hidden;
        }
        
        .large-progress-fill {
            height: 100%;
            background: var(--mux-gradient-success);
            border-radius: 8px;
            transition: width 0.5s ease;
        }
        
        .project-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 20px;
        }
        
        .project-stat {
            text-align: center;
            padding: 12px;
            background: var(--vscode-editor-background);
            border-radius: var(--mux-radius-md);
        }
        
        .project-stat-value {
            font-size: 1.5em;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        
        .project-stat-label {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .milestone-status-pending { color: #ffc107; }
        .milestone-status-in-progress { color: #17a2b8; }
        .milestone-status-completed { color: #28a745; }
        .milestone-status-delayed { color: #dc3545; }
    </style>
</head>
<body>
    <h1>
        <span>📁</span>
        ${project ? 'Edit' : 'New'} Project
        ${project ? `<span class="progress-status status-${project.status.toLowerCase().replace(/\s/g, '-')}">${project.status}</span>` : ''}
    </h1>
    
    ${project ? `
    <div class="project-progress">
        <div class="progress-header">
            <div>
                <div class="progress-percentage">${project.progress}%</div>
                <div style="color: var(--vscode-descriptionForeground); font-size: 0.9em;">Project Progress</div>
            </div>
        </div>
        <div class="large-progress-bar">
            <div class="large-progress-fill" style="width: ${project.progress}%"></div>
        </div>
        <div class="project-stats">
            <div class="project-stat">
                <div class="project-stat-value">${project.milestones.length}</div>
                <div class="project-stat-label">🎯 Milestones</div>
            </div>
            <div class="project-stat">
                <div class="project-stat-value">${project.taskIds.length}</div>
                <div class="project-stat-label">✔️ Tasks</div>
            </div>
            <div class="project-stat">
                <div class="project-stat-value">${project.requirementIds.length}</div>
                <div class="project-stat-label">📋 Requirements</div>
            </div>
        </div>
    </div>
    
    <div class="meta-info">
        <div class="meta-item">
            <span class="meta-label">ID:</span>
            <span class="meta-value">${project.id.substring(0, 8)}...</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Created:</span>
            <span class="meta-value">${new Date(project.createdAt).toLocaleString()}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Updated:</span>
            <span class="meta-value">${new Date(project.updatedAt).toLocaleString()}</span>
        </div>
    </div>
    ` : ''}

    <form id="projectForm">
        <div class="form-group">
            <label for="name" class="required">Project Name</label>
            <input type="text" id="name" required value="${project?.name || ''}" placeholder="Enter project name..." />
        </div>

        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" placeholder="Describe the project goals and scope...">${project?.description || ''}</textarea>
        </div>

        <div class="row">
            <div class="form-group">
                <label for="status">Status</label>
                <select id="status">
                    ${Object.values(ProjectStatus).map(s => 
                        `<option value="${s}" ${project?.status === s ? 'selected' : ''}>${s}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="form-group">
                <label for="progress">Progress (%)</label>
                <input type="number" id="progress" min="0" max="100" value="${project?.progress || 0}" />
            </div>
        </div>

        <div class="row">
            <div class="form-group">
                <label for="startDate">Start Date</label>
                <input type="date" id="startDate" value="${project ? project.startDate.split('T')[0] : new Date().toISOString().split('T')[0]}" />
            </div>

            <div class="form-group">
                <label for="targetEndDate">Target End Date</label>
                <input type="date" id="targetEndDate" value="${project ? project.targetEndDate.split('T')[0] : ''}" />
            </div>
        </div>

        <div class="form-group">
            <label for="tags">Tags (comma-separated)</label>
            <input type="text" id="tags" value="${project?.tags.join(', ') || ''}" placeholder="e.g., Q1, frontend, critical" />
        </div>

        <div class="buttons">
            <button type="submit" class="btn-primary">💾 Save Project</button>
            ${project ? '<button type="button" class="btn-danger" onclick="deleteProject()">🗑️ Delete</button>' : ''}
        </div>
    </form>

    ${project ? `
    <div class="form-section" style="margin-top: 32px;">
        <div class="form-section-title">🎯 Milestones (${project.milestones.length})</div>
        
        ${project.milestones.length > 0 ? project.milestones.map(ms => `
            <div class="milestone-card">
                <div class="milestone-icon">🎯</div>
                <div class="milestone-info">
                    <div class="milestone-name">${escapeHtml(ms.name)}</div>
                    <div class="milestone-meta">
                        <span class="milestone-status-${ms.status.toLowerCase().replace(/\s/g, '-')}">${ms.status}</span>
                        <span>📅 ${new Date(ms.dueDate).toLocaleDateString()}</span>
                        ${ms.description ? `<span>${escapeHtml(ms.description)}</span>` : ''}
                    </div>
                </div>
                <button class="btn-danger btn-icon" onclick="deleteMilestone('${ms.id}')">🗑️</button>
            </div>
        `).join('') : `
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <div class="empty-state-title">No Milestones</div>
                <div class="empty-state-text">Add milestones to track project progress</div>
            </div>
        `}

        <div class="add-milestone-form">
            <h3>➕ Add Milestone</h3>
            <div class="row">
                <div class="form-group">
                    <label for="msName">Name *</label>
                    <input type="text" id="msName" placeholder="Milestone name..." />
                </div>
                <div class="form-group">
                    <label for="msDueDate">Due Date *</label>
                    <input type="date" id="msDueDate" />
                </div>
            </div>
            <div class="form-group">
                <label for="msDescription">Description</label>
                <input type="text" id="msDescription" placeholder="Optional description..." />
            </div>
            <button type="button" class="btn-secondary" onclick="addMilestone()">➕ Add Milestone</button>
        </div>
    </div>
    ` : ''}

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('projectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const data = {
                name: document.getElementById('name').value,
                description: document.getElementById('description').value,
                status: document.getElementById('status').value,
                progress: parseInt(document.getElementById('progress').value) || 0,
                startDate: new Date(document.getElementById('startDate').value).toISOString(),
                targetEndDate: new Date(document.getElementById('targetEndDate').value).toISOString(),
                tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t)
            };

            vscode.postMessage({ command: 'save', data });
        });

        function deleteProject() {
            vscode.postMessage({ command: 'delete' });
        }

        function addMilestone() {
            const name = document.getElementById('msName').value;
            const dueDate = document.getElementById('msDueDate').value;
            const description = document.getElementById('msDescription').value;

            if (!name || !dueDate) {
                alert('Name and Due Date are required');
                return;
            }

            vscode.postMessage({ 
                command: 'addMilestone', 
                data: { name, dueDate: new Date(dueDate).toISOString(), description }
            });

            document.getElementById('msName').value = '';
            document.getElementById('msDueDate').value = '';
            document.getElementById('msDescription').value = '';
        }

        function deleteMilestone(milestoneId) {
            if (confirm('Delete this milestone?')) {
                vscode.postMessage({ command: 'deleteMilestone', milestoneId });
            }
        }
    </script>
</body>
</html>`;
    }
}
