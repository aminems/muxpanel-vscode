import * as vscode from 'vscode';
import { DataService } from '../services';
import { Task, TaskStatus, TaskPriority } from '../models';
import { formStyles, followUpStyles, escapeHtml } from './styles';

export class TaskPanel {
    public static currentPanels: Map<string, TaskPanel> = new Map();
    public static readonly viewType = 'muxpanel.task';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private dataService: DataService;
    private taskId: string | undefined;

    public static createOrShow(extensionUri: vscode.Uri, taskId?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (taskId && TaskPanel.currentPanels.has(taskId)) {
            TaskPanel.currentPanels.get(taskId)!._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            TaskPanel.viewType,
            taskId ? 'Edit Task' : 'New Task',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        const taskPanel = new TaskPanel(panel, extensionUri, taskId);
        if (taskId) {
            TaskPanel.currentPanels.set(taskId, taskPanel);
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, taskId?: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.taskId = taskId;
        this.dataService = DataService.getInstance();

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await this.saveTask(message.data);
                        return;
                    case 'delete':
                        await this.deleteTask();
                        return;
                    case 'addFollowUp':
                        await this.addFollowUp(message.data);
                        return;
                    case 'completeFollowUp':
                        await this.completeFollowUp(message.followUpId);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async saveTask(data: Partial<Task>) {
        if (this.taskId) {
            this.dataService.updateTask(this.taskId, data);
            vscode.window.showInformationMessage('Task updated successfully!');
        } else {
            const newTask = this.dataService.addTask(data as Partial<Task> & { title: string });
            this.taskId = newTask.id;
            TaskPanel.currentPanels.set(newTask.id, this);
            this._panel.title = 'Edit Task';
            vscode.window.showInformationMessage('Task created successfully!');
        }
        this.update();
        vscode.commands.executeCommand('muxpanel.refreshTasks');
    }

    private async deleteTask() {
        if (this.taskId) {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to delete this task?',
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                this.dataService.deleteTask(this.taskId);
                vscode.window.showInformationMessage('Task deleted!');
                vscode.commands.executeCommand('muxpanel.refreshTasks');
                this.dispose();
            }
        }
    }

    private async addFollowUp(data: { content: string; dueDate: string }) {
        if (this.taskId) {
            this.dataService.addFollowUp(this.taskId, data);
            vscode.window.showInformationMessage('Follow-up added!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshTasks');
        }
    }

    private async completeFollowUp(followUpId: string) {
        if (this.taskId) {
            this.dataService.completeFollowUp(this.taskId, followUpId);
            vscode.window.showInformationMessage('Follow-up completed!');
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshTasks');
        }
    }

    public dispose() {
        if (this.taskId) {
            TaskPanel.currentPanels.delete(this.taskId);
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
        const task = this.taskId ? this.dataService.getTask(this.taskId) : undefined;
        this._panel.webview.html = this._getHtmlForWebview(task);
    }

    private _getHtmlForWebview(task?: Task) {
        const projects = this.dataService.getProjects();
        const requirements = this.dataService.getRequirements();
        const tasks = this.dataService.getTasks().filter(t => t.id !== this.taskId);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${task ? 'Edit' : 'New'} Task</title>
    <style>
        ${formStyles}
        ${followUpStyles}
        
        /* Task-specific styles */
        .task-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        
        .task-icon {
            font-size: 1.5em;
        }
        
        .priority-indicator {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: var(--mux-radius-sm);
            font-size: 0.8em;
            font-weight: 600;
        }
        
        .priority-critical { background: rgba(220, 53, 69, 0.2); color: #dc3545; }
        .priority-high { background: rgba(253, 126, 20, 0.2); color: #fd7e14; }
        .priority-medium { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
        .priority-low { background: rgba(40, 167, 69, 0.2); color: #28a745; }
        
        .status-tag {
            padding: 6px 12px;
            border-radius: var(--mux-radius-md);
            font-size: 0.8em;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-todo { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
        .status-in-progress { background: rgba(0, 123, 255, 0.2); color: #007bff; }
        .status-blocked { background: rgba(220, 53, 69, 0.2); color: #dc3545; }
        .status-done { background: rgba(40, 167, 69, 0.2); color: #28a745; }
        .status-cancelled { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
        
        .time-tracker {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding: 20px;
            background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
            border-radius: var(--mux-radius-lg);
            border: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
        }
        
        .time-block {
            text-align: center;
        }
        
        .time-value {
            font-size: 2em;
            font-weight: 700;
            background: var(--mux-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .time-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <h1>
        <span class="task-icon">✅</span>
        ${task ? 'Edit' : 'New'} Task
        ${task ? `<span class="status-tag status-${task.status.toLowerCase().replace(/\s/g, '-')}">${task.status}</span>` : ''}
    </h1>
    
    ${task ? `
    <div class="meta-info">
        <div class="meta-item">
            <span class="meta-label">ID:</span>
            <span class="meta-value">${task.id.substring(0, 8)}...</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Created:</span>
            <span class="meta-value">${new Date(task.createdAt).toLocaleString()}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Updated:</span>
            <span class="meta-value">${new Date(task.updatedAt).toLocaleString()}</span>
        </div>
        ${task.completedDate ? `
        <div class="meta-item">
            <span class="meta-label">Completed:</span>
            <span class="meta-value">${new Date(task.completedDate).toLocaleString()}</span>
        </div>
        ` : ''}
    </div>
    
    ${task.estimatedHours || task.actualHours ? `
    <div class="time-tracker">
        <div class="time-block">
            <div class="time-value">${task.estimatedHours || 0}h</div>
            <div class="time-label">Estimated</div>
        </div>
        <div class="time-block">
            <div class="time-value">${task.actualHours || 0}h</div>
            <div class="time-label">Actual</div>
        </div>
    </div>
    ` : ''}
    ` : ''}

    <form id="taskForm">
        <div class="row">
            <div class="form-group">
                <label for="title">Title *</label>
                <input type="text" id="title" required value="${escapeHtml(task?.title || '')}" placeholder="Task title..." />
            </div>
        </div>

        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description">${escapeHtml(task?.description || '')}</textarea>
        </div>

        <div class="row">
            <div class="form-group">
                <label for="status">Status</label>
                <select id="status">
                    ${Object.values(TaskStatus).map(s => 
                        `<option value="${s}" ${task?.status === s ? 'selected' : ''}>${s}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="form-group">
                <label for="priority">Priority</label>
                <select id="priority">
                    ${Object.values(TaskPriority).map(p => 
                        `<option value="${p}" ${task?.priority === p ? 'selected' : ''}>${p}</option>`
                    ).join('')}
                </select>
            </div>
        </div>

        <div class="row-3">
            <div class="form-group">
                <label for="startDate">Start Date</label>
                <input type="date" id="startDate" value="${task?.startDate ? task.startDate.split('T')[0] : ''}" />
            </div>

            <div class="form-group">
                <label for="dueDate">Due Date</label>
                <input type="date" id="dueDate" value="${task?.dueDate ? task.dueDate.split('T')[0] : ''}" />
            </div>

            <div class="form-group">
                <label for="assignee">Assignee</label>
                <input type="text" id="assignee" value="${task?.assignee || ''}" />
            </div>
        </div>

        <div class="row">
            <div class="form-group">
                <label for="estimatedHours">Estimated Hours</label>
                <input type="number" id="estimatedHours" min="0" step="0.5" value="${task?.estimatedHours || ''}" />
            </div>

            <div class="form-group">
                <label for="actualHours">Actual Hours</label>
                <input type="number" id="actualHours" min="0" step="0.5" value="${task?.actualHours || ''}" />
            </div>
        </div>

        <div class="row">
            <div class="form-group">
                <label for="projectId">Project</label>
                <select id="projectId" onchange="handleProjectChange()">
                    <option value="">-- No Project --</option>
                    ${projects.map(p => 
                        `<option value="${p.id}" ${(task?.projectId === p.id) || (!task && this.dataService.activeProjectId === p.id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="form-group" id="milestoneGroup">
                <label for="linkedMilestoneId">Linked Milestone</label>
                <select id="linkedMilestoneId">
                    <option value="">-- No Milestone --</option>
                    ${(() => {
                        const activeProject = this.dataService.activeProject;
                        if (!activeProject) return '';
                        return activeProject.milestones.map(m => 
                            `<option value="${m.id}" ${task?.linkedMilestoneId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
                        ).join('');
                    })()}
                </select>
            </div>

            <div class="form-group" id="parentTaskGroup">
                <label for="parentTaskId">Parent Task</label>
                <select id="parentTaskId">
                    <option value="">-- No Parent --</option>
                    ${tasks.filter(t => t.id !== this.taskId && !t.parentTaskId).map(t => 
                        `<option value="${t.id}" ${task?.parentTaskId === t.id ? 'selected' : ''}>${escapeHtml(t.title)}</option>`
                    ).join('')}
                </select>
            </div>
        </div>

        <div class="form-group">
            <label for="tags">Tags (comma-separated)</label>
            <input type="text" id="tags" value="${task?.tags.join(', ') || ''}" />
        </div>

        <div class="buttons">
            <button type="submit" class="btn-primary" id="saveBtn">💾 Save Task</button>
            ${task ? '<button type="button" class="btn-danger" onclick="deleteTask()">🗑️ Delete</button>' : ''}
        </div>
    </form>

    ${task ? `
    <div class="form-section" style="margin-top: 32px;">
        <div class="form-section-title">🔔 Follow-ups (${task.followUps.length})</div>
        
        ${task.followUps.length > 0 ? task.followUps.map(fu => `
            <div class="followup-card ${fu.completed ? 'completed' : ''}">
                <div class="followup-checkbox" onclick="completeFollowUp('${fu.id}')">
                    ${fu.completed ? '✓' : ''}
                </div>
                <div class="followup-info">
                    <div class="followup-content">${escapeHtml(fu.content)}</div>
                    <div class="followup-meta">
                        <span>📅 Due: ${new Date(fu.dueDate).toLocaleDateString()}</span>
                        ${fu.completed ? `<span>✓ Completed: ${new Date(fu.completedDate!).toLocaleDateString()}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('') : `
            <div class="empty-state">
                <div class="empty-state-icon">🔔</div>
                <div class="empty-state-title">No Follow-ups</div>
                <div class="empty-state-text">Add a follow-up to track action items</div>
            </div>
        `}

        <div class="add-followup-form">
            <h3>➕ Add Follow-up</h3>
            <div class="row">
                <div class="form-group">
                    <label for="fuContent">Content *</label>
                    <input type="text" id="fuContent" placeholder="What needs to be followed up?" />
                </div>
                <div class="form-group">
                    <label for="fuDueDate">Due Date *</label>
                    <input type="date" id="fuDueDate" />
                </div>
            </div>
            <button type="button" class="btn-secondary" onclick="addFollowUp()">➕ Add Follow-up</button>
        </div>
    </div>
    ` : ''}

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const data = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                status: document.getElementById('status').value,
                priority: document.getElementById('priority').value,
                startDate: document.getElementById('startDate').value ? new Date(document.getElementById('startDate').value).toISOString() : undefined,
                dueDate: document.getElementById('dueDate').value ? new Date(document.getElementById('dueDate').value).toISOString() : undefined,
                assignee: document.getElementById('assignee').value || undefined,
                estimatedHours: parseFloat(document.getElementById('estimatedHours').value) || undefined,
                actualHours: parseFloat(document.getElementById('actualHours').value) || undefined,
                projectId: document.getElementById('projectId').value || undefined,
                parentTaskId: document.getElementById('parentTaskId').value || undefined,
                linkedMilestoneId: document.getElementById('linkedMilestoneId').value || undefined,
                tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t)
            };

            vscode.postMessage({ command: 'save', data });
        });
        
        function handleProjectChange() {
            // Future: filter milestones by project
        }

        function deleteTask() {
            vscode.postMessage({ command: 'delete' });
        }

        function addFollowUp() {
            const content = document.getElementById('fuContent').value;
            const dueDate = document.getElementById('fuDueDate').value;

            if (!content || !dueDate) {
                alert('Content and Due Date are required');
                return;
            }

            vscode.postMessage({ 
                command: 'addFollowUp', 
                data: { content, dueDate: new Date(dueDate).toISOString() }
            });

            document.getElementById('fuContent').value = '';
            document.getElementById('fuDueDate').value = '';
        }

        function completeFollowUp(followUpId) {
            vscode.postMessage({ command: 'completeFollowUp', followUpId });
        }
    </script>
</body>
</html>`;
    }
}
