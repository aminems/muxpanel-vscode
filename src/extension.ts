import * as vscode from 'vscode';
import * as path from 'path';
import { DataService } from './services';
import { 
    RequirementsProvider, 
    ProjectsProvider, 
    TasksProvider, 
    NotesProvider 
} from './providers';
import { 
    DashboardPanel, 
    RequirementPanel, 
    ProjectPanel, 
    TaskPanel, 
    NotePanel,
    GanttPanel 
} from './views';
import { registerChatParticipant } from './chat/muxpanelParticipant';
import * as ExcelJS from 'exceljs';

export function activate(context: vscode.ExtensionContext) {
    console.log('Muxpanel extension is now active!');

    // Check if a workspace folder is open
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Muxpanel: Please open a folder/workspace to use this extension. Data will not be saved until a folder is opened.');
    }

    // Initialize data service
    const dataService = DataService.getInstance();
    
    // Restore active project context from storage
    dataService.restoreActiveProject();

    // Create tree data providers
    const requirementsProvider = new RequirementsProvider();
    const projectsProvider = new ProjectsProvider();
    const tasksProvider = new TasksProvider();
    const notesProvider = new NotesProvider();

    // Register tree views
    const requirementsView = vscode.window.createTreeView('muxpanel.requirementsView', {
        treeDataProvider: requirementsProvider,
        showCollapseAll: true
    });

    const projectsView = vscode.window.createTreeView('muxpanel.projectsView', {
        treeDataProvider: projectsProvider,
        showCollapseAll: true
    });

    const tasksView = vscode.window.createTreeView('muxpanel.tasksView', {
        treeDataProvider: tasksProvider,
        showCollapseAll: true
    });

    const notesView = vscode.window.createTreeView('muxpanel.notesView', {
        treeDataProvider: notesProvider,
        showCollapseAll: true
    });

    // Register Copilot Chat Participant
    registerChatParticipant(context);

    // Dashboard Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri);
        })
    );

    // Refresh Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.refreshRequirements', () => {
            requirementsProvider.refresh();
        }),
        vscode.commands.registerCommand('muxpanel.refreshProjects', () => {
            projectsProvider.refresh();
        }),
        vscode.commands.registerCommand('muxpanel.refreshTasks', () => {
            tasksProvider.refresh();
        }),
        vscode.commands.registerCommand('muxpanel.refreshNotes', () => {
            notesProvider.refresh();
        }),
        vscode.commands.registerCommand('muxpanel.refreshAll', () => {
            dataService.refresh();
        })
    );

    // Requirement Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.addRequirement', () => {
            RequirementPanel.createOrShow(context.extensionUri);
        }),
        vscode.commands.registerCommand('muxpanel.openRequirement', (id: string) => {
            RequirementPanel.createOrShow(context.extensionUri, id);
        }),
        vscode.commands.registerCommand('muxpanel.addChildRequirement', (item: any) => {
            if (item && item.requirement) {
                RequirementPanel.createOrShow(context.extensionUri);
            }
        })
    );

    // Project Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.addProject', () => {
            ProjectPanel.createOrShow(context.extensionUri);
        }),
        vscode.commands.registerCommand('muxpanel.openProject', (id: string) => {
            ProjectPanel.createOrShow(context.extensionUri, id);
        }),
        vscode.commands.registerCommand('muxpanel.openMilestone', (projectId: string, _milestoneId: string) => {
            ProjectPanel.createOrShow(context.extensionUri, projectId);
        }),
        // Project Selection - makes a project active
        vscode.commands.registerCommand('muxpanel.selectProject', async (projectId: string) => {
            if (projectId) {
                dataService.setActiveProject(projectId);
                const project = dataService.getProject(projectId);
                if (project) {
                    vscode.window.showInformationMessage(`Active project: ${project.name}`);
                    // Refresh all views to show project-filtered data
                    requirementsProvider.refresh();
                    tasksProvider.refresh();
                    notesProvider.refresh();
                }
            }
        }),
        vscode.commands.registerCommand('muxpanel.deselectProject', () => {
            dataService.setActiveProject(undefined);
            vscode.window.showInformationMessage('No active project selected');
            requirementsProvider.refresh();
            tasksProvider.refresh();
            notesProvider.refresh();
        })
    );

    // Gantt Chart Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.openGanttChart', () => {
            const activeProjectId = dataService.activeProjectId;
            if (!activeProjectId) {
                vscode.window.showWarningMessage('Please select a project first to view its Gantt chart.');
                return;
            }
            GanttPanel.createOrShow(context.extensionUri, activeProjectId);
        }),
        vscode.commands.registerCommand('muxpanel.refreshGantt', () => {
            GanttPanel.refresh();
        })
    );

    // Task Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.addTask', () => {
            TaskPanel.createOrShow(context.extensionUri);
        }),
        vscode.commands.registerCommand('muxpanel.openTask', (id: string) => {
            TaskPanel.createOrShow(context.extensionUri, id);
        }),
        vscode.commands.registerCommand('muxpanel.toggleFollowUp', async (taskId: string, followUpId: string) => {
            dataService.completeFollowUp(taskId, followUpId);
            vscode.window.showInformationMessage('Follow-up completed!');
        }),
        vscode.commands.registerCommand('muxpanel.completeTask', async (item: any) => {
            if (item && item.task) {
                dataService.updateTask(item.task.id, { 
                    status: 'done' as any,
                    completedDate: new Date().toISOString()
                });
                vscode.window.showInformationMessage('Task completed!');
            }
        })
    );

    // Note Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.addNote', () => {
            NotePanel.createOrShow(context.extensionUri);
        }),
        vscode.commands.registerCommand('muxpanel.openNote', (id: string) => {
            NotePanel.createOrShow(context.extensionUri, id);
        }),
        vscode.commands.registerCommand('muxpanel.toggleNotePin', (item: any) => {
            if (item && item.note) {
                dataService.toggleNotePin(item.note.id);
                vscode.window.showInformationMessage(
                    item.note.isPinned ? 'Note unpinned!' : 'Note pinned!'
                );
            }
        })
    );

    // Quick Pick Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('muxpanel.quickAddTask', async () => {
            const title = await vscode.window.showInputBox({
                prompt: 'Enter task title',
                placeHolder: 'Task title...'
            });
            if (title) {
                dataService.addTask({ title });
                vscode.window.showInformationMessage(`Task "${title}" created!`);
            }
        }),
        vscode.commands.registerCommand('muxpanel.quickAddNote', async () => {
            const title = await vscode.window.showInputBox({
                prompt: 'Enter note title',
                placeHolder: 'Note title...'
            });
            if (title) {
                dataService.addNote({ title });
                vscode.window.showInformationMessage(`Note "${title}" created!`);
            }
        })
    );

    // Enterprise Requirements Management Commands
    context.subscriptions.push(
        // View mode commands
        vscode.commands.registerCommand('muxpanel.viewByType', () => {
            requirementsProvider.setViewMode('byType');
            vscode.window.showInformationMessage('Requirements grouped by type');
        }),
        vscode.commands.registerCommand('muxpanel.viewByStatus', () => {
            requirementsProvider.setViewMode('byStatus');
            vscode.window.showInformationMessage('Requirements grouped by status');
        }),
        vscode.commands.registerCommand('muxpanel.viewHierarchy', () => {
            requirementsProvider.setViewMode('hierarchy');
            vscode.window.showInformationMessage('Requirements shown in hierarchy');
        }),

        // Coverage and Analysis
        vscode.commands.registerCommand('muxpanel.generateCoverageReport', async () => {
            const report = dataService.generateCoverageReport('Coverage Report');
            const message = `Coverage Report:
• Total Requirements: ${report.totalRequirements}
• Covered: ${report.coveredRequirements} (${report.coveragePercentage.toFixed(1)}%)
• Uncovered: ${report.uncoveredRequirements.length}
• Partially Covered: ${report.partiallyCoveredRequirements.length}`;
            
            const action = await vscode.window.showInformationMessage(message, 'View Details');
            if (action === 'View Details') {
                // Could open a detailed coverage panel
                vscode.window.showInformationMessage(`Uncovered: ${report.uncoveredRequirements.join(', ') || 'None'}`);
            }
        }),

        vscode.commands.registerCommand('muxpanel.analyzeImpact', async () => {
            const requirements = dataService.getRequirements();
            const items = requirements.map(r => ({ label: `[${r.key}] ${r.title}`, id: r.id }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select requirement to analyze impact...'
            });
            
            if (selected) {
                const impact = dataService.analyzeImpact(selected.id);
                const directCount = impact.impactedItems.filter(i => i.depth === 1).length;
                const indirectCount = impact.impactedItems.filter(i => i.depth > 1).length;
                
                vscode.window.showInformationMessage(
                    `Impact Analysis: ${directCount} direct, ${indirectCount} indirect dependencies (${impact.impactedItems.length} total)`
                );
            }
        }),

        // Suspect Links
        vscode.commands.registerCommand('muxpanel.viewSuspectLinks', async () => {
            const suspectReqs = dataService.getSuspectRequirements();
            if (suspectReqs.length === 0) {
                vscode.window.showInformationMessage('No suspect links found!');
                return;
            }
            
            const items = suspectReqs.map(r => ({
                label: `⚠️ [${r.key}] ${r.title}`,
                description: `${r.suspectLinkIds.length} suspect links`,
                id: r.id
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select requirement with suspect links...'
            });
            
            if (selected) {
                RequirementPanel.createOrShow(context.extensionUri, selected.id);
            }
        }),

        // Baseline Management
        vscode.commands.registerCommand('muxpanel.createBaseline', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter baseline name',
                placeHolder: 'e.g., Release 1.0 Baseline'
            });
            
            if (name) {
                const requirements = dataService.getRequirements();
                const reqIds = requirements.map(r => r.id);
                const baseline = dataService.createBaseline(name, reqIds);
                vscode.window.showInformationMessage(`Baseline "${baseline.name}" created with ${reqIds.length} requirements!`);
            }
        }),

        vscode.commands.registerCommand('muxpanel.viewBaselines', async () => {
            const baselines = dataService.getBaselines();
            if (baselines.length === 0) {
                vscode.window.showInformationMessage('No baselines created yet. Use "Create Baseline" to capture a snapshot.');
                return;
            }
            
            const items = baselines.map(b => ({
                label: `📋 ${b.name}`,
                description: `${b.status} - ${b.requirementSnapshots.length} requirements`,
                detail: `Created: ${new Date(b.createdAt).toLocaleString()}`,
                id: b.id
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select baseline...'
            });
            
            if (selected) {
                const baseline = dataService.getBaseline(selected.id);
                if (baseline) {
                    const lockAction = baseline.status === 'draft' ? 'Lock Baseline' : null;
                    const actions = lockAction ? [lockAction] : [];
                    
                    const action = await vscode.window.showInformationMessage(
                        `Baseline: ${baseline.name}\nVersion: ${baseline.version}\nRequirements: ${baseline.requirementSnapshots.length}`,
                        ...actions
                    );
                    
                    if (action === 'Lock Baseline') {
                        dataService.lockBaseline(baseline.id);
                        vscode.window.showInformationMessage('Baseline locked!');
                    }
                }
            }
        }),

        // Review Management
        vscode.commands.registerCommand('muxpanel.startReview', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter review name',
                placeHolder: 'e.g., Sprint 5 Requirements Review'
            });
            
            if (name) {
                const requirements = dataService.getRequirements().filter(r => r.status === 'draft' || r.status === 'proposed');
                
                if (requirements.length === 0) {
                    vscode.window.showWarningMessage('No draft or proposed requirements to review.');
                    return;
                }
                
                const reqIds = requirements.map(r => r.id);
                const review = dataService.createReview(name, reqIds);
                vscode.window.showInformationMessage(`Review "${review.name}" created with ${reqIds.length} requirements!`);
            }
        }),

        // Traceability Matrix (placeholder - would open a dedicated view)
        vscode.commands.registerCommand('muxpanel.viewTraceabilityMatrix', async () => {
            const requirements = dataService.getRequirements();
            const totalTraces = requirements.reduce((sum, r) => sum + r.traces.length, 0);
            const suspectCount = requirements.filter(r => r.hasSuspectLinks).length;
            
            vscode.window.showInformationMessage(
                `Traceability Summary:\n• Requirements: ${requirements.length}\n• Trace Links: ${totalTraces}\n• Suspect: ${suspectCount}`
            );
        }),

        // Export/Import
        vscode.commands.registerCommand('muxpanel.exportRequirements', async () => {
            // Check if workspace is open
            if (!dataService.hasWorkspace()) {
                vscode.window.showErrorMessage('Please open a workspace folder first to use Muxpanel.');
                return;
            }
            
            const format = await vscode.window.showQuickPick(['Excel (.xlsx)', 'JSON', 'CSV', 'ReqIF (Coming Soon)'], {
                placeHolder: 'Select export format...'
            });
            
            if (!format) {
                return; // User cancelled
            }
            
            const requirements = dataService.getRequirements();
            
            if (format === 'Excel (.xlsx)') {
                // Create Excel workbook
                const workbook = new ExcelJS.Workbook();
                workbook.creator = 'Muxpanel';
                workbook.created = new Date();
                
                // Requirements Sheet
                const reqSheet = workbook.addWorksheet('Requirements', {
                    properties: { tabColor: { argb: '4472C4' } }
                });
                
                // Define columns with proper widths
                reqSheet.columns = [
                    { header: 'Key', key: 'key', width: 12 },
                    { header: 'Title', key: 'title', width: 40 },
                    { header: 'Type', key: 'type', width: 15 },
                    { header: 'Category', key: 'category', width: 15 },
                    { header: 'Status', key: 'status', width: 15 },
                    { header: 'Priority', key: 'priority', width: 12 },
                    { header: 'Risk', key: 'risk', width: 12 },
                    { header: 'Owner', key: 'owner', width: 20 },
                    { header: 'Description', key: 'description', width: 50 },
                    { header: 'Rationale', key: 'rationale', width: 40 },
                    { header: 'Acceptance Criteria', key: 'acceptanceCriteria', width: 40 },
                    { header: 'Verification Method', key: 'verificationMethod', width: 20 },
                    { header: 'Verification Status', key: 'verificationStatus', width: 18 },
                    { header: 'Test Coverage %', key: 'testCoverage', width: 15 },
                    { header: 'Parent Key', key: 'parentKey', width: 12 },
                    { header: 'Trace Links', key: 'traceLinks', width: 30 },
                    { header: 'Tags', key: 'tags', width: 25 },
                    { header: 'Version', key: 'version', width: 10 },
                    { header: 'Created', key: 'createdAt', width: 20 },
                    { header: 'Updated', key: 'updatedAt', width: 20 },
                    { header: 'Suspect Links', key: 'hasSuspectLinks', width: 14 }
                ];
                
                // Style header row
                reqSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
                reqSheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: '4472C4' }
                };
                reqSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
                
                // Add data rows
                for (const req of requirements) {
                    const parentReq = req.parentId ? requirements.find(r => r.id === req.parentId) : null;
                    const traceLinksStr = req.traces.map(t => {
                        const targetReq = requirements.find(r => r.id === t.targetId);
                        return targetReq ? `${t.linkType}: ${targetReq.key}` : `${t.linkType}: Unknown`;
                    }).join('; ');
                    
                    const row = reqSheet.addRow({
                        key: req.key,
                        title: req.title,
                        type: req.type,
                        category: req.category,
                        status: req.status,
                        priority: req.priority,
                        risk: req.risk,
                        owner: req.owner || '',
                        description: req.description || '',
                        rationale: req.rationale || '',
                        acceptanceCriteria: req.acceptanceCriteria || '',
                        verificationMethod: req.verificationMethod.join(', '),
                        verificationStatus: req.verificationStatus,
                        testCoverage: req.testCoverage,
                        parentKey: parentReq?.key || '',
                        traceLinks: traceLinksStr,
                        tags: req.tags.join(', '),
                        version: req.version,
                        createdAt: new Date(req.createdAt).toLocaleString(),
                        updatedAt: new Date(req.updatedAt).toLocaleString(),
                        hasSuspectLinks: req.hasSuspectLinks ? 'Yes' : 'No'
                    });
                    
                    // Highlight suspect link rows
                    if (req.hasSuspectLinks) {
                        row.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF2CC' }
                        };
                    }
                }
                
                // Add filters
                reqSheet.autoFilter = {
                    from: 'A1',
                    to: `U${requirements.length + 1}`
                };
                
                // Freeze header row
                reqSheet.views = [{ state: 'frozen', ySplit: 1 }];
                
                // Traceability Matrix Sheet
                const traceSheet = workbook.addWorksheet('Traceability Matrix', {
                    properties: { tabColor: { argb: '70AD47' } }
                });
                
                // Build matrix headers
                const reqKeys = requirements.map(r => r.key);
                traceSheet.columns = [
                    { header: 'Requirement', key: 'source', width: 15 },
                    ...reqKeys.map(key => ({ header: key, key, width: 12 }))
                ];
                
                // Style header
                traceSheet.getRow(1).font = { bold: true, size: 9 };
                traceSheet.getRow(1).alignment = { textRotation: 45, vertical: 'bottom', horizontal: 'center' };
                
                // Add matrix data
                for (const req of requirements) {
                    const rowData: Record<string, string> = { source: req.key };
                    for (const trace of req.traces) {
                        const targetReq = requirements.find(r => r.id === trace.targetId);
                        if (targetReq) {
                            rowData[targetReq.key] = trace.linkType.substring(0, 3).toUpperCase();
                        }
                    }
                    traceSheet.addRow(rowData);
                }
                
                // Summary Sheet
                const summarySheet = workbook.addWorksheet('Summary', {
                    properties: { tabColor: { argb: 'ED7D31' } }
                });
                
                summarySheet.columns = [
                    { header: 'Metric', key: 'metric', width: 30 },
                    { header: 'Value', key: 'value', width: 20 }
                ];
                
                summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
                summarySheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'ED7D31' }
                };
                
                const coverageReport = dataService.generateCoverageReport('Export');
                const suspectCount = requirements.filter(r => r.hasSuspectLinks).length;
                
                summarySheet.addRows([
                    { metric: 'Total Requirements', value: requirements.length },
                    { metric: 'Test Coverage', value: `${coverageReport.coveragePercentage.toFixed(1)}%` },
                    { metric: 'Fully Covered', value: coverageReport.coveredRequirements },
                    { metric: 'Partially Covered', value: coverageReport.partiallyCoveredRequirements.length },
                    { metric: 'Uncovered', value: coverageReport.uncoveredRequirements.length },
                    { metric: 'Suspect Links', value: suspectCount },
                    { metric: '', value: '' },
                    { metric: 'By Status', value: '' },
                    ...Object.entries(dataService.getStatistics().requirementsByStatus).map(([status, count]) => ({
                        metric: `  ${status}`, value: count
                    }))
                ]);
                
                // Save to file
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const fileName = `requirements-export-${timestamp}.xlsx`;
                const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);
                
                await workbook.xlsx.writeFile(filePath);
                
                const openFile = await vscode.window.showInformationMessage(
                    `Exported ${requirements.length} requirements to ${fileName}`,
                    'Open File',
                    'Open Folder'
                );
                
                if (openFile === 'Open File') {
                    vscode.env.openExternal(vscode.Uri.file(filePath));
                } else if (openFile === 'Open Folder') {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
                }
                
            } else if (format === 'JSON') {
                const content = JSON.stringify(requirements, null, 2);
                const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
                await vscode.window.showTextDocument(doc);
                vscode.window.showInformationMessage(`Exported ${requirements.length} requirements to JSON`);
            } else if (format === 'CSV') {
                const headers = 'Key,Title,Type,Status,Priority,Description\n';
                const rows = requirements.map(r => 
                    `"${r.key}","${r.title}","${r.type}","${r.status}","${r.priority}","${r.description?.replace(/"/g, '""') || ''}"`
                ).join('\n');
                const content = headers + rows;
                const doc = await vscode.workspace.openTextDocument({ content, language: 'csv' });
                await vscode.window.showTextDocument(doc);
                vscode.window.showInformationMessage(`Exported ${requirements.length} requirements to CSV`);
            } else if (format === 'ReqIF (Coming Soon)') {
                vscode.window.showInformationMessage('ReqIF export coming in a future update!');
            }
        }),

        vscode.commands.registerCommand('muxpanel.importRequirements', async () => {
            vscode.window.showInformationMessage('Import functionality coming soon! Use the "Add Requirement" command for now.');
        })
    );

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'muxpanel.openDashboard';
    statusBarItem.text = '$(dashboard) Muxpanel';
    statusBarItem.tooltip = 'Open Muxpanel Dashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar with counts
    function updateStatusBar() {
        const stats = dataService.getStatistics();
        const overdueText = stats.overdueTasks > 0 ? ` ⚠️${stats.overdueTasks}` : '';
        statusBarItem.text = `$(dashboard) Muxpanel${overdueText}`;
        statusBarItem.tooltip = `Requirements: ${stats.totalRequirements} | Projects: ${stats.totalProjects} | Tasks: ${stats.totalTasks} | Notes: ${stats.totalNotes}`;
    }

    updateStatusBar();
    dataService.onDataChanged(updateStatusBar);

    // Register views
    context.subscriptions.push(requirementsView, projectsView, tasksView, notesView);

    // Show welcome message on first activation
    if (!context.globalState.get('muxpanel.welcomed')) {
        vscode.window.showInformationMessage(
            'Welcome to Muxpanel! Click the Muxpanel icon in the Activity Bar to get started.',
            'Open Dashboard'
        ).then(selection => {
            if (selection === 'Open Dashboard') {
                vscode.commands.executeCommand('muxpanel.openDashboard');
            }
        });
        context.globalState.update('muxpanel.welcomed', true);
    }
}

export function deactivate() {
    console.log('Muxpanel extension deactivated');
}
