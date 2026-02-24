import * as vscode from 'vscode';
import { DataService } from '../services';
import { ProjectStatus } from '../models';
import { dashboardStyles, escapeHtml } from './styles';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    public static readonly viewType = 'muxpanel.dashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private dataService: DataService;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel.update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            'Muxpanel Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.dataService = DataService.getInstance();

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.update();
                        return;
                    case 'openRequirement':
                        vscode.commands.executeCommand('muxpanel.openRequirement', message.id);
                        return;
                    case 'openProject':
                        vscode.commands.executeCommand('muxpanel.openProject', message.id);
                        return;
                    case 'openTask':
                        vscode.commands.executeCommand('muxpanel.openTask', message.id);
                        return;
                    case 'openNote':
                        vscode.commands.executeCommand('muxpanel.openNote', message.id);
                        return;
                }
            },
            null,
            this._disposables
        );

        this.dataService.onDataChanged(() => this.update());
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        const stats = this.dataService.getStatistics();
        const overdueTasks = this.dataService.getOverdueTasks();
        const upcomingTasks = this.dataService.getTasksDueSoon(7);
        const pendingFollowUps = this.dataService.getPendingFollowUps().slice(0, 5);
        const recentNotes = this.dataService.getNotesByActiveProject()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5);
        const projects = this.dataService.getProjects();
        
        // Active project context
        const activeProject = this.dataService.activeProject;
        const activeProjectName = activeProject ? activeProject.name : 'All Projects';
        
        // Enhanced requirements stats - filtered by active project
        const requirements = this.dataService.getRequirementsByActiveProject();
        const allRequirements = this.dataService.getRequirements();
        const suspectRequirements = requirements.filter(r => r.hasSuspectLinks);
        const coverageReport = this.dataService.generateCoverageReport('Dashboard');
        const baselines = this.dataService.getBaselines();
        
        // Milestones count (from project.milestones, not tasks)
        const milestones = activeProject?.milestones || [];
        const regularTasks = this.dataService.getTasksByActiveProject();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Muxpanel Dashboard</title>
    <style>
        ${dashboardStyles}
    </style>
</head>
<body>
    <div class="dashboard-header">
        <h1>📊 Muxpanel Dashboard</h1>
        <button class="refresh-btn btn-ghost" onclick="refresh()">🔄 Refresh</button>
    </div>
    
    <div class="context-banner ${activeProject ? 'active' : ''}">
        <span class="context-banner-icon">${activeProject ? '📁' : '🌐'}</span>
        <span>${activeProject ? 'Active Project:' : 'Viewing:'}</span>
        <strong>${escapeHtml(activeProjectName)}</strong>
        ${activeProject ? `<span class="badge badge-success">${activeProject.progress}% complete</span>` : ''}
    </div>
    
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number">${requirements.length}${!activeProject ? ` <span style="font-size: 0.5em; opacity: 0.7">/ ${allRequirements.length}</span>` : ''}</div>
            <div class="stat-label">📋 Requirements</div>
        </div>
        <div class="stat-card">
            <div class="stat-number ${suspectRequirements.length > 0 ? 'warning' : ''}">${suspectRequirements.length}</div>
            <div class="stat-label">⚠️ Suspect Links</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${coverageReport.coveragePercentage.toFixed(0)}%</div>
            <div class="stat-label">✅ Test Coverage</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.totalProjects}</div>
            <div class="stat-label">📁 Projects</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${regularTasks.length}</div>
            <div class="stat-label">✔️ Tasks</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${milestones.length}</div>
            <div class="stat-label">🏁 Milestones</div>
        </div>
        <div class="stat-card">
            <div class="stat-number ${stats.overdueTasks > 0 ? 'warning' : ''}">${stats.overdueTasks}</div>
            <div class="stat-label">🔴 Overdue</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.pendingFollowUps}</div>
            <div class="stat-label">🔔 Follow-ups</div>
        </div>
    </div>

    <div class="two-columns">
        <div>
            <div class="section-header">
                <h2>⚠️ Suspect Links</h2>
            </div>
            <div class="section">
                ${suspectRequirements.length > 0 ? `
                    <ul class="item-list">
                        ${suspectRequirements.slice(0, 5).map((req, i) => `
                            <li onclick="openRequirement('${req.id}')" class="animate-slide-in" style="animation-delay: ${i * 0.05}s">
                                <div class="item-title">
                                    <span class="badge badge-default">${req.key}</span>
                                    ${escapeHtml(req.title)}
                                </div>
                                <div class="item-meta">
                                    <span>${req.suspectLinkIds.length} suspect link${req.suspectLinkIds.length !== 1 ? 's' : ''}</span>
                                    <span>${req.type}</span>
                                    <span class="badge badge-warning">Review Required</span>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">🎉</div>
                        <div class="empty-state-title">All Clear!</div>
                        <div class="empty-state-text">No suspect links found</div>
                    </div>
                `}
            </div>

            <div class="section-header">
                <h2>🔴 Overdue Tasks</h2>
            </div>
            <div class="section">
                ${overdueTasks.length > 0 ? `
                    <ul class="item-list">
                        ${overdueTasks.slice(0, 5).map((task, i) => `
                            <li onclick="openTask('${task.id}')" class="animate-slide-in" style="animation-delay: ${i * 0.05}s">
                                <div class="item-title">${escapeHtml(task.title)}</div>
                                <div class="item-meta">
                                    <span>📅 Due: ${new Date(task.dueDate!).toLocaleDateString()}</span>
                                    <span class="badge badge-danger">Overdue</span>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">🎉</div>
                        <div class="empty-state-title">Great Job!</div>
                        <div class="empty-state-text">No overdue tasks</div>
                    </div>
                `}
            </div>

            <div class="section-header">
                <h2>📅 Upcoming Tasks</h2>
                <span style="font-size: 0.85em; color: var(--vscode-descriptionForeground)">Next 7 days</span>
            </div>
            <div class="section">
                ${upcomingTasks.length > 0 ? `
                    <ul class="item-list">
                        ${upcomingTasks.slice(0, 5).map((task, i) => `
                            <li onclick="openTask('${task.id}')" class="animate-slide-in" style="animation-delay: ${i * 0.05}s">
                                <div class="item-title">${escapeHtml(task.title)}</div>
                                <div class="item-meta">
                                    <span>📅 ${new Date(task.dueDate!).toLocaleDateString()}</span>
                                    <span class="badge badge-info">${task.status}</span>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <div class="empty-state-title">No Upcoming Tasks</div>
                        <div class="empty-state-text">Your schedule is clear</div>
                    </div>
                `}
            </div>
        </div>

        <div>
            <div class="section-header">
                <h2>🔔 Pending Follow-ups</h2>
            </div>
            <div class="section">
                ${pendingFollowUps.length > 0 ? `
                    <ul class="item-list">
                        ${pendingFollowUps.map(({ task, followUp }, i) => `
                            <li onclick="openTask('${task.id}')" class="animate-slide-in" style="animation-delay: ${i * 0.05}s">
                                <div class="item-title">${escapeHtml(followUp.content)}</div>
                                <div class="item-meta">
                                    <span>📌 ${escapeHtml(task.title)}</span>
                                    <span>📅 ${new Date(followUp.dueDate).toLocaleDateString()}</span>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">✨</div>
                        <div class="empty-state-title">All Caught Up!</div>
                        <div class="empty-state-text">No pending follow-ups</div>
                    </div>
                `}
            </div>

            <div class="section-header">
                <h2>📝 Recent Notes</h2>
            </div>
            <div class="section">
                ${recentNotes.length > 0 ? `
                    <ul class="item-list">
                        ${recentNotes.map((note, i) => `
                            <li onclick="openNote('${note.id}')" class="animate-slide-in" style="animation-delay: ${i * 0.05}s">
                                <div class="item-title">
                                    ${note.isPinned ? '📌 ' : ''}${escapeHtml(note.title)}
                                </div>
                                <div class="item-meta">
                                    <span class="badge badge-default">${note.category}</span>
                                    <span>📅 ${new Date(note.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-title">No Notes Yet</div>
                        <div class="empty-state-text">Start capturing your thoughts</div>
                    </div>
                `}
            </div>
        </div>
    </div>

    <h2>📁 Projects Overview</h2>
    <div class="section">
        ${projects.length > 0 ? `
            <ul class="item-list">
                ${projects.map((project, i) => `
                    <li onclick="openProject('${project.id}')" class="animate-slide-in" style="animation-delay: ${i * 0.05}s">
                        <div class="item-title">
                            ${escapeHtml(project.name)}
                            <span class="badge badge-${project.status === ProjectStatus.Active ? 'success' : project.status === ProjectStatus.OnHold ? 'warning' : 'default'}">${project.status}</span>
                        </div>
                        <div class="item-meta">
                            <span>🎯 ${project.milestones.length} milestone${project.milestones.length !== 1 ? 's' : ''}</span>
                            <span>✔️ ${project.taskIds.length} task${project.taskIds.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="progress-container">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${project.progress}%"></div>
                            </div>
                            <div class="progress-label">
                                <span>Progress</span>
                                <span>${project.progress}%</span>
                            </div>
                        </div>
                    </li>
                `).join('')}
            </ul>
        ` : `
            <div class="empty-state">
                <div class="empty-state-icon">🚀</div>
                <div class="empty-state-title">No Projects Yet</div>
                <div class="empty-state-text">Create your first project to get started!</div>
            </div>
        `}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function openRequirement(id) {
            vscode.postMessage({ command: 'openRequirement', id });
        }
        
        function openProject(id) {
            vscode.postMessage({ command: 'openProject', id });
        }
        
        function openTask(id) {
            vscode.postMessage({ command: 'openTask', id });
        }
        
        function openNote(id) {
            vscode.postMessage({ command: 'openNote', id });
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }
}
