import * as vscode from 'vscode';
import { DataService } from '../services';
import { Project, Task, Milestone, TaskStatus } from '../models';
import { baseStyles } from './styles';

export class GanttPanel {
    public static currentPanel: GanttPanel | undefined;
    public static readonly viewType = 'muxpanel.gantt';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private dataService: DataService;
    private projectId: string;

    public static createOrShow(extensionUri: vscode.Uri, projectId: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (GanttPanel.currentPanel) {
            GanttPanel.currentPanel._panel.reveal(column);
            GanttPanel.currentPanel.projectId = projectId;
            GanttPanel.currentPanel.update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            GanttPanel.viewType,
            'Gantt Chart',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        GanttPanel.currentPanel = new GanttPanel(panel, extensionUri, projectId);
    }

    public static refresh() {
        if (GanttPanel.currentPanel) {
            GanttPanel.currentPanel.update();
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, projectId: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.projectId = projectId;
        this.dataService = DataService.getInstance();

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Listen for data changes
        this.dataService.onDataChanged(() => this.update());

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openTask':
                        vscode.commands.executeCommand('muxpanel.openTask', message.taskId);
                        return;
                    case 'openMilestone':
                        vscode.commands.executeCommand('muxpanel.openProject', this.projectId);
                        return;
                    case 'updateTaskDates':
                        this.updateTaskDates(message.taskId, message.startDate, message.endDate);
                        return;
                    case 'exportChart':
                        await this.exportChartAsHtml(message.projectName);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async exportChartAsHtml(projectName: string) {
        const project = this.dataService.getProject(this.projectId);
        if (!project) {
            vscode.window.showErrorMessage('Project not found');
            return;
        }

        // Generate standalone HTML for export
        const tasks = this.dataService.getTasksByProject(this.projectId)
            .filter(t => t.startDate && t.dueDate);
        
        const exportHtml = this.generateExportHtml(project, tasks);
        
        // Ask user where to save
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`gantt-chart-${projectName.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.html`),
            filters: {
                'HTML Files': ['html'],
                'All Files': ['*']
            },
            title: 'Export Gantt Chart'
        });

        if (uri) {
            const fs = require('fs');
            fs.writeFileSync(uri.fsPath, exportHtml);
            
            const openFile = await vscode.window.showInformationMessage(
                `Gantt chart exported to ${uri.fsPath}`,
                'Open File',
                'Open in Browser'
            );
            
            if (openFile === 'Open File') {
                vscode.workspace.openTextDocument(uri).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            } else if (openFile === 'Open in Browser') {
                vscode.env.openExternal(uri);
            }
        }
    }

    private generateExportHtml(project: Project, tasks: Task[]): string {
        const startDate = new Date(project.startDate);
        const endDate = new Date(project.targetEndDate);
        const today = new Date();
        
        const chartStart = new Date(Math.min(startDate.getTime(), today.getTime()));
        chartStart.setDate(chartStart.getDate() - 7);
        
        const chartEnd = new Date(Math.max(endDate.getTime(), today.getTime()));
        chartEnd.setDate(chartEnd.getDate() + 14);
        
        const totalDays = Math.ceil((chartEnd.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24));
        const weeks = this.generateWeekHeaders(chartStart, chartEnd);
        const todayPosition = this.calculatePosition(today, chartStart, totalDays);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gantt Chart - ${project.name}</title>
    <style>
        :root {
            --bg-color: #1e1e1e;
            --text-color: #cccccc;
            --border-color: #3c3c3c;
            --header-bg: #252526;
            --accent-color: #0e639c;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            color: var(--text-color);
            background-color: var(--bg-color);
            padding: 24px;
        }
        
        .header {
            margin-bottom: 24px;
            padding: 20px 24px;
            background: var(--header-bg);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }
        
        .header h1 { font-size: 1.5em; margin-bottom: 12px; }
        
        .project-info {
            display: flex;
            gap: 24px;
            font-size: 0.9em;
            opacity: 0.8;
        }
        
        .legend {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 20px;
            padding: 12px 16px;
            background: var(--header-bg);
            border-radius: 8px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85em;
        }
        
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 4px;
        }
        
        .gantt-container {
            display: flex;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
            background: var(--header-bg);
        }
        
        .task-list {
            width: 280px;
            flex-shrink: 0;
            border-right: 1px solid var(--border-color);
        }
        
        .task-list-header {
            height: 36px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            font-weight: 600;
            background: var(--bg-color);
            border-bottom: 1px solid var(--border-color);
        }
        
        .task-row {
            height: 40px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-color);
        }
        
        .task-name {
            font-size: 0.9em;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 180px;
        }
        
        .task-status {
            font-size: 0.75em;
            padding: 2px 8px;
            border-radius: 10px;
            text-transform: uppercase;
        }
        
        .status-to-do { background: #6c757d; color: white; }
        .status-in-progress { background: #0d6efd; color: white; }
        .status-blocked { background: #dc3545; color: white; }
        .status-in-review { background: #6f42c1; color: white; }
        .status-done { background: #198754; color: white; }
        
        .chart-area {
            flex: 1;
            overflow-x: auto;
        }
        
        .timeline-header {
            height: 36px;
            background: var(--bg-color);
            border-bottom: 1px solid var(--border-color);
        }
        
        .weeks-row {
            display: flex;
            height: 100%;
        }
        
        .week-cell {
            min-width: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid var(--border-color);
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .chart-body {
            position: relative;
            min-height: 100px;
        }
        
        .chart-row {
            height: 40px;
            position: relative;
            border-bottom: 1px solid var(--border-color);
        }
        
        .task-bar {
            position: absolute;
            height: 24px;
            top: 8px;
            border-radius: 4px;
            font-size: 0.8em;
            color: white;
            padding: 0 8px;
            display: flex;
            align-items: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .task-bar.to-do { background: #6c757d; }
        .task-bar.in-progress { background: #0d6efd; }
        .task-bar.blocked { background: #dc3545; }
        .task-bar.in-review { background: #6f42c1; }
        .task-bar.done { background: #198754; }
        
        .milestone-marker {
            position: absolute;
            width: 16px;
            height: 16px;
            top: 12px;
            background: #fd7e14;
            transform: rotate(45deg) translateX(-50%);
            border-radius: 2px;
        }
        
        .today-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #e74c3c;
            z-index: 10;
        }
        
        .today-label {
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.7em;
            color: #e74c3c;
            white-space: nowrap;
        }
        
        .summary {
            margin-top: 24px;
            padding: 20px 24px;
            background: var(--header-bg);
            border-radius: 12px;
            border: 1px solid var(--border-color);
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 20px;
        }
        
        .summary-item { text-align: center; }
        .summary-value { font-size: 2em; font-weight: 700; color: var(--accent-color); }
        .summary-label { font-size: 0.85em; opacity: 0.7; margin-top: 4px; }
        
        .export-note {
            margin-top: 16px;
            padding: 12px;
            background: var(--header-bg);
            border-radius: 8px;
            font-size: 0.85em;
            opacity: 0.7;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 ${project.name}</h1>
        <div class="project-info">
            <span>Start: ${new Date(project.startDate).toLocaleDateString()}</span>
            <span>Target: ${new Date(project.targetEndDate).toLocaleDateString()}</span>
            <span>Progress: ${project.progress}%</span>
        </div>
    </div>
    
    <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background: #6c757d;"></div><span>To Do</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #0d6efd;"></div><span>In Progress</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #dc3545;"></div><span>Blocked</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #6f42c1;"></div><span>In Review</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #198754;"></div><span>Done</span></div>
        <div class="legend-item"><div class="legend-color" style="background: #fd7e14; transform: rotate(45deg); width: 12px; height: 12px;"></div><span>Milestone</span></div>
    </div>
    
    ${tasks.length === 0 && project.milestones.length === 0 ? `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 3em; margin-bottom: 16px;">📊</div>
            <div style="font-size: 1.2em; font-weight: 600; margin-bottom: 8px;">No Tasks or Milestones Scheduled</div>
            <p>Add tasks with start and due dates, or create milestones to see them on the Gantt chart.</p>
        </div>
    ` : `
    <div class="gantt-container">
        <div class="task-list">
            <div class="task-list-header">Tasks & Milestones (${tasks.length + project.milestones.length})</div>
            ${project.milestones.map(ms => `
                <div class="task-row">
                    <span class="task-name">🏁 ${ms.name}</span>
                    <span class="task-status status-${ms.status.replace(/\\s+/g, '-').toLowerCase()}">${ms.status}</span>
                </div>
            `).join('')}
            ${tasks.map(task => `
                <div class="task-row">
                    <span class="task-name">${task.title}</span>
                    <span class="task-status status-${task.status.replace(/\\s+/g, '-').toLowerCase()}">${task.status}</span>
                </div>
            `).join('')}
        </div>
        
        <div class="chart-area">
            <div class="timeline-header">
                <div class="weeks-row">${weeks}</div>
            </div>
            
            <div class="chart-body" style="width: ${totalDays * 100 / 7}px;">
                <div class="today-line" style="left: ${todayPosition}%;">
                    <div class="today-label">Today</div>
                </div>
                
                ${project.milestones.map(ms => `
                    <div class="chart-row">
                        ${this.generateMilestoneMarker(ms, chartStart, totalDays)}
                    </div>
                `).join('')}
                
                ${tasks.map(task => `
                    <div class="chart-row">
                        ${this.generateTaskBar(task, chartStart, totalDays)}
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
    `}
    
    <div class="summary">
        <div class="summary-item">
            <div class="summary-value">${tasks.length}</div>
            <div class="summary-label">Total Tasks</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${project.milestones.length}</div>
            <div class="summary-label">Milestones</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${tasks.filter(t => t.status === TaskStatus.Done).length}</div>
            <div class="summary-label">Completed</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${tasks.filter(t => t.status === TaskStatus.InProgress).length}</div>
            <div class="summary-label">In Progress</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${tasks.filter(t => t.status === TaskStatus.Blocked).length}</div>
            <div class="summary-label">Blocked</div>
        </div>
    </div>
    
    <div class="export-note">
        Exported from Muxpanel on ${new Date().toLocaleDateString()} • Open this file in a browser and use Print → Save as PDF for a PDF version
    </div>
</body>
</html>`;
    }

    private updateTaskDates(taskId: string, startDate: string, endDate: string) {
        this.dataService.updateTask(taskId, {
            startDate: startDate,
            dueDate: endDate
        });
        vscode.window.showInformationMessage('Task dates updated!');
    }

    public dispose() {
        GanttPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private update() {
        const project = this.dataService.getProject(this.projectId);
        if (!project) {
            this._panel.webview.html = this._getErrorHtml('Project not found');
            return;
        }
        
        const tasks = this.dataService.getTasksByActiveProject();
        this._panel.title = `Gantt Chart - ${project.name}`;
        this._panel.webview.html = this._getHtmlForWebview(project, tasks);
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Error</title>
    <style>
        body { 
            font-family: var(--vscode-font-family);
            padding: 20px; 
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .error { 
            color: var(--vscode-errorForeground);
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="error">${message}</div>
</body>
</html>`;
    }

    private _getHtmlForWebview(project: Project, tasks: Task[]): string {
        // Calculate date range for the chart
        const startDate = new Date(project.startDate);
        const endDate = new Date(project.targetEndDate);
        const today = new Date();
        
        // Extend range if needed
        const chartStart = new Date(Math.min(startDate.getTime(), today.getTime()));
        chartStart.setDate(chartStart.getDate() - 7); // Add week buffer
        
        const chartEnd = new Date(Math.max(endDate.getTime(), today.getTime()));
        chartEnd.setDate(chartEnd.getDate() + 14); // Add 2 week buffer
        
        const totalDays = Math.ceil((chartEnd.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24));
        
        // Generate week headers (dates)
        const weeks = this.generateWeekHeaders(chartStart, chartEnd);
        
        // Generate task bars (tasks only, no task-type milestones)
        const taskBars = tasks.map(task => this.generateTaskBar(task, chartStart, totalDays)).join('');
        
        // Generate milestone markers from project milestones
        const milestoneMarkers = project.milestones.map(ms => this.generateMilestoneMarker(ms, chartStart, totalDays)).join('');
        
        // Today marker position
        const todayPosition = this.calculatePosition(today, chartStart, totalDays);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gantt Chart - ${project.name}</title>
    <style>
        /* Base Variables */
        :root {
            --mux-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
            --mux-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.15);
            --mux-radius-sm: 6px;
            --mux-radius-md: 8px;
            --mux-radius-lg: 12px;
            --mux-transition: all 0.2s ease;
            --mux-gradient-primary: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-textLink-foreground));
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 24px;
            overflow-x: auto;
        }
        
        .header {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 24px;
            padding: 20px 24px;
            background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
            border-radius: var(--mux-radius-lg);
            border: 1px solid var(--vscode-panel-border);
        }
        
        .header-main {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .header h1 {
            font-size: 1.5em;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .export-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: var(--mux-radius-md);
            cursor: pointer;
            font-size: 0.9em;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        .export-btn:hover {
            background: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }
        
        .export-btn:active {
            transform: translateY(0);
        }
        
        .export-btn.exporting {
            opacity: 0.7;
            cursor: wait;
        }
        
        .export-icon {
            font-size: 1.1em;
        }
        
        .project-info {
            display: flex;
            gap: 24px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        
        .project-info span {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .legend {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            padding: 16px 20px;
            background: var(--vscode-sideBar-background);
            border-radius: var(--mux-radius-lg);
            border: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85em;
        }
        
        .legend-color {
            width: 18px;
            height: 18px;
            border-radius: 4px;
        }
        
        .gantt-container {
            display: flex;
            min-width: max-content;
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--mux-radius-lg);
            overflow: hidden;
        }
        
        .task-list {
            min-width: 300px;
            border-right: 2px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }
        
        .task-list-header {
            height: 36px;
            display: flex;
            align-items: center;
            padding: 0 20px;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: linear-gradient(135deg, var(--vscode-editor-background), var(--vscode-sideBar-background));
        }
        
        .task-row {
            height: 44px;
            display: flex;
            align-items: center;
            padding: 0 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            transition: var(--mux-transition);
        }
        
        .task-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .task-row.milestone-row {
            background: rgba(253, 126, 20, 0.08);
        }
        
        .task-row.milestone-row:hover {
            background: rgba(253, 126, 20, 0.15);
        }
        
        .task-name {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
        }
        
        .task-status {
            font-size: 0.7em;
            padding: 3px 8px;
            border-radius: 12px;
            margin-left: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-todo { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
        .status-in-progress { background: rgba(13, 110, 253, 0.2); color: #0d6efd; }
        .status-blocked { background: rgba(220, 53, 69, 0.2); color: #dc3545; }
        .status-in-review { background: rgba(111, 66, 193, 0.2); color: #6f42c1; }
        .status-done { background: rgba(25, 135, 84, 0.2); color: #198754; }
        .status-cancelled { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
        
        .milestone-chart-row {
            background: rgba(253, 126, 20, 0.08) !important;
        }
        
        .chart-area {
            flex: 1;
            overflow-x: auto;
        }
        
        .timeline-header {
            height: 36px;
            display: flex;
            flex-direction: column;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: linear-gradient(135deg, var(--vscode-editor-background), var(--vscode-sideBar-background));
        }
        
        .weeks-row {
            display: flex;
            height: 36px;
        }
        
        .week-cell {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100px;
            border-right: 1px solid var(--vscode-panel-border);
            font-size: 0.8em;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        .chart-body {
            position: relative;
        }
        
        .chart-row {
            height: 44px;
            position: relative;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .chart-row:nth-child(even) {
            background: rgba(127, 127, 127, 0.04);
        }
        
        .grid-lines {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            pointer-events: none;
        }
        
        .grid-line {
            width: 100px;
            border-right: 1px dashed var(--vscode-panel-border);
            opacity: 0.5;
        }
        
        .task-bar {
            position: absolute;
            height: 28px;
            top: 8px;
            border-radius: var(--mux-radius-sm);
            cursor: pointer;
            transition: var(--mux-transition);
            display: flex;
            align-items: center;
            padding: 0 10px;
            font-size: 0.75em;
            color: white;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: var(--mux-shadow-sm);
        }
        
        .task-bar:hover {
            transform: translateY(-3px);
            box-shadow: var(--mux-shadow-md);
        }
        
        .task-bar.todo { background: linear-gradient(135deg, #6c757d, #5a6268); }
        .task-bar.in-progress { background: linear-gradient(135deg, #0d6efd, #0a58ca); }
        .task-bar.blocked { background: linear-gradient(135deg, #dc3545, #bb2d3b); }
        .task-bar.in-review { background: linear-gradient(135deg, #6f42c1, #5a32a3); }
        .task-bar.done { background: linear-gradient(135deg, #198754, #146c43); }
        .task-bar.cancelled { background: linear-gradient(135deg, #6c757d, #5a6268); opacity: 0.5; }
        
        .milestone-marker {
            position: absolute;
            width: 22px;
            height: 22px;
            top: 11px;
            transform: translateX(-11px) rotate(45deg);
            cursor: pointer;
            transition: var(--mux-transition);
            border-radius: 3px;
            box-shadow: var(--mux-shadow-sm);
        }
        
        .milestone-marker:hover {
            transform: translateX(-11px) rotate(45deg) scale(1.15);
            box-shadow: var(--mux-shadow-md);
        }
        
        .milestone-marker.not-started { background: linear-gradient(135deg, #6c757d, #5a6268); }
        .milestone-marker.in-progress { background: linear-gradient(135deg, #0d6efd, #0a58ca); }
        .milestone-marker.completed { background: linear-gradient(135deg, #198754, #146c43); }
        .milestone-marker.delayed { background: linear-gradient(135deg, #fd7e14, #e96b0c); }
        .milestone-marker.cancelled { background: linear-gradient(135deg, #dc3545, #bb2d3b); }
        
        .today-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 3px;
            background: linear-gradient(180deg, var(--vscode-editorError-foreground), transparent);
            z-index: 10;
            border-radius: 2px;
        }
        
        .today-label {
            position: absolute;
            top: -28px;
            transform: translateX(-50%);
            font-size: 0.7em;
            font-weight: 600;
            background: var(--vscode-editorError-foreground);
            color: white;
            padding: 4px 10px;
            border-radius: var(--mux-radius-sm);
            box-shadow: var(--mux-shadow-sm);
        }
        
        .progress-bar {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.3);
            border-radius: var(--mux-radius-sm) 0 0 var(--mux-radius-sm);
        }
        
        .no-tasks {
            text-align: center;
            padding: 60px 40px;
            color: var(--vscode-descriptionForeground);
        }
        
        .no-tasks-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        
        .no-tasks-title {
            font-size: 1.2em;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }
        
        .summary {
            margin-top: 24px;
            padding: 20px 24px;
            background: linear-gradient(135deg, var(--vscode-sideBar-background), var(--vscode-editor-background));
            border-radius: var(--mux-radius-lg);
            border: 1px solid var(--vscode-panel-border);
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 20px;
        }
        
        .summary-item {
            text-align: center;
            padding: 12px;
            background: var(--vscode-editor-background);
            border-radius: var(--mux-radius-md);
        }
        
        .summary-value {
            font-size: 2em;
            font-weight: 700;
            background: var(--mux-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .summary-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-main">
            <h1>📊 ${project.name}</h1>
            <button class="export-btn" onclick="exportGanttChart()" title="Export as PNG">
                <span class="export-icon">📷</span>
                Export PNG
            </button>
        </div>
        <div class="project-info">
            <span>Start: ${new Date(project.startDate).toLocaleDateString()}</span>
            <span>Target: ${new Date(project.targetEndDate).toLocaleDateString()}</span>
            <span>Progress: ${project.progress}%</span>
        </div>
    </div>
    
    <div class="legend">
        <div class="legend-item">
            <div class="legend-color" style="background: #6c757d;"></div>
            <span>To Do</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #0d6efd;"></div>
            <span>In Progress</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #dc3545;"></div>
            <span>Blocked</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #6f42c1;"></div>
            <span>In Review</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #198754;"></div>
            <span>Done</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #fd7e14; transform: rotate(45deg); width: 12px; height: 12px;"></div>
            <span>Milestone</span>
        </div>
    </div>
    
    ${tasks.length === 0 && project.milestones.length === 0 ? `
        <div class="no-tasks">
            <div class="no-tasks-icon">📊</div>
            <div class="no-tasks-title">No Tasks or Milestones Scheduled</div>
            <p>Add tasks with start and due dates, or create milestones to see them on the Gantt chart.</p>
        </div>
    ` : `
    <div class="gantt-container">
        <div class="task-list">
            <div class="task-list-header">Tasks & Milestones (${tasks.length + project.milestones.length})</div>
            ${project.milestones.map(ms => `
                <div class="task-row milestone-row" onclick="openMilestone('${ms.id}')">
                    <span class="task-name">🏁 ${ms.name}</span>
                    <span class="task-status status-${ms.status.replace(/\\s+/g, '-').toLowerCase()}">${ms.status}</span>
                </div>
            `).join('')}
            ${tasks.map(task => `
                <div class="task-row" onclick="openTask('${task.id}')">
                    <span class="task-name">${task.title}</span>
                    <span class="task-status status-${task.status.replace(/\\s+/g, '-').toLowerCase()}">${task.status}</span>
                </div>
            `).join('')}
        </div>
        
        <div class="chart-area">
            <div class="timeline-header">
                <div class="weeks-row">
                    ${weeks}
                </div>
            </div>
            
            <div class="chart-body" style="width: ${totalDays * 100 / 7}px;">
                <!-- Grid lines -->
                <div class="grid-lines">
                    ${Array(Math.ceil(totalDays / 7)).fill(0).map(() => '<div class="grid-line"></div>').join('')}
                </div>
                
                <!-- Today marker -->
                <div class="today-line" style="left: ${todayPosition}%;">
                    <div class="today-label">Today</div>
                </div>
                
                <!-- Milestone rows (from project.milestones) -->
                ${project.milestones.map(ms => `
                    <div class="chart-row milestone-chart-row">
                        ${this.generateMilestoneMarker(ms, chartStart, totalDays)}
                    </div>
                `).join('')}
                
                <!-- Task rows -->
                ${tasks.map(task => `
                    <div class="chart-row">
                        ${this.generateTaskBar(task, chartStart, totalDays)}
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
    `}
    
    <div class="summary">
        <div class="summary-item">
            <div class="summary-value">${tasks.length}</div>
            <div class="summary-label">Total Tasks</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${project.milestones.length}</div>
            <div class="summary-label">Milestones</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${tasks.filter(t => t.status === TaskStatus.Done).length}</div>
            <div class="summary-label">Completed</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${tasks.filter(t => t.status === TaskStatus.InProgress).length}</div>
            <div class="summary-label">In Progress</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${tasks.filter(t => t.status === TaskStatus.Blocked).length}</div>
            <div class="summary-label">Blocked</div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function openTask(taskId) {
            vscode.postMessage({ command: 'openTask', taskId: taskId });
        }
        
        function openMilestone(milestoneId) {
            vscode.postMessage({ command: 'openMilestone', milestoneId: milestoneId });
        }
        
        function exportGanttChart() {
            const btn = document.querySelector('.export-btn');
            btn.classList.add('exporting');
            btn.innerHTML = '<span class="export-icon">⏳</span> Exporting...';
            
            // Send message to extension to handle export
            vscode.postMessage({ 
                command: 'exportChart',
                projectName: '${project.name.replace(/'/g, "\\'")}'
            });
            
            // Reset button after a delay
            setTimeout(() => {
                btn.classList.remove('exporting');
                btn.innerHTML = '<span class="export-icon">📷</span> Export';
            }, 1500);
        }
    </script>
</body>
</html>`;
    }

    private generateWeekHeaders(start: Date, end: Date): string {
        let html = '';
        const current = new Date(start);
        
        while (current <= end) {
            const weekStart = new Date(current);
            current.setDate(current.getDate() + 7);
            
            const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            html += `<div class="week-cell">${weekLabel}</div>`;
        }
        
        return html;
    }

    private calculatePosition(date: Date, chartStart: Date, totalDays: number): number {
        const daysDiff = Math.ceil((date.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24));
        return (daysDiff / totalDays) * 100;
    }

    private generateTaskBar(task: Task, chartStart: Date, totalDays: number): string {
        const taskStart = task.startDate ? new Date(task.startDate) : new Date();
        const taskEnd = task.dueDate ? new Date(task.dueDate) : new Date(taskStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const startPos = this.calculatePosition(taskStart, chartStart, totalDays);
        const endPos = this.calculatePosition(taskEnd, chartStart, totalDays);
        const width = Math.max(endPos - startPos, 2); // Minimum 2% width
        
        const statusClass = task.status.replace(/\s+/g, '-').toLowerCase();
        
        // Calculate progress width based on estimated completion
        const progressWidth = task.status === TaskStatus.Done ? 100 : 
                            task.status === TaskStatus.InProgress ? 50 : 0;
        
        return `
            <div class="task-bar ${statusClass}" 
                 style="left: ${startPos}%; width: ${width}%;"
                 onclick="openTask('${task.id}')"
                 title="${task.title}&#10;Status: ${task.status}&#10;Start: ${taskStart.toLocaleDateString()}&#10;Due: ${taskEnd.toLocaleDateString()}">
                ${progressWidth > 0 ? `<div class="progress-bar" style="width: ${progressWidth}%;"></div>` : ''}
                ${task.title}
            </div>
        `;
    }

    private generateMilestoneMarker(milestone: Milestone, chartStart: Date, totalDays: number): string {
        const msDate = new Date(milestone.dueDate);
        const position = this.calculatePosition(msDate, chartStart, totalDays);
        
        const statusClass = milestone.status.replace(/\s+/g, '-').toLowerCase();
        
        return `
            <div class="milestone-marker ${statusClass}"
                 style="left: ${position}%;"
                 onclick="openMilestone()"
                 title="${milestone.name}&#10;Due: ${msDate.toLocaleDateString()}&#10;Status: ${milestone.status}">
            </div>
        `;
    }
}
