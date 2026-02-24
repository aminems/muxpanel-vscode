import * as vscode from 'vscode';
import { DataService } from '../services';
import { Note, NoteCategory } from '../models';
import { formStyles, escapeHtml } from './styles';

export class NotePanel {
    public static currentPanels: Map<string, NotePanel> = new Map();
    public static readonly viewType = 'muxpanel.note';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private dataService: DataService;
    private noteId: string | undefined;

    public static createOrShow(extensionUri: vscode.Uri, noteId?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (noteId && NotePanel.currentPanels.has(noteId)) {
            NotePanel.currentPanels.get(noteId)!._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            NotePanel.viewType,
            noteId ? 'Edit Note' : 'New Note',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        const notePanel = new NotePanel(panel, extensionUri, noteId);
        if (noteId) {
            NotePanel.currentPanels.set(noteId, notePanel);
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, noteId?: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.noteId = noteId;
        this.dataService = DataService.getInstance();

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await this.saveNote(message.data);
                        return;
                    case 'delete':
                        await this.deleteNote();
                        return;
                    case 'togglePin':
                        await this.togglePin();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async saveNote(data: Partial<Note>) {
        if (this.noteId) {
            this.dataService.updateNote(this.noteId, data);
            vscode.window.showInformationMessage('Note updated successfully!');
        } else {
            const newNote = this.dataService.addNote(data as Partial<Note> & { title: string });
            this.noteId = newNote.id;
            NotePanel.currentPanels.set(newNote.id, this);
            this._panel.title = 'Edit Note';
            vscode.window.showInformationMessage('Note created successfully!');
        }
        this.update();
        vscode.commands.executeCommand('muxpanel.refreshNotes');
    }

    private async deleteNote() {
        if (this.noteId) {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to delete this note?',
                { modal: true },
                'Delete'
            );
            if (confirm === 'Delete') {
                this.dataService.deleteNote(this.noteId);
                vscode.window.showInformationMessage('Note deleted!');
                vscode.commands.executeCommand('muxpanel.refreshNotes');
                this.dispose();
            }
        }
    }

    private async togglePin() {
        if (this.noteId) {
            this.dataService.toggleNotePin(this.noteId);
            this.update();
            vscode.commands.executeCommand('muxpanel.refreshNotes');
        }
    }

    public dispose() {
        if (this.noteId) {
            NotePanel.currentPanels.delete(this.noteId);
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
        const note = this.noteId ? this.dataService.getNote(this.noteId) : undefined;
        this._panel.webview.html = this._getHtmlForWebview(note);
    }

    private _getHtmlForWebview(note?: Note) {
        const projects = this.dataService.getProjects();
        const requirements = this.dataService.getRequirements();
        const tasks = this.dataService.getTasks();
        const notes = this.dataService.getNotes().filter(n => n.id !== this.noteId);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${note ? 'Edit' : 'New'} Note</title>
    <style>
        ${formStyles}
        
        /* Note-specific styles */
        .note-header {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .pin-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: ${note?.isPinned ? 'var(--mux-gradient-warning)' : 'var(--vscode-button-secondaryBackground)'};
            color: ${note?.isPinned ? '#1a1a1a' : 'var(--vscode-button-secondaryForeground)'};
            border-radius: var(--mux-radius-md);
            font-size: 0.9em;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: var(--mux-transition);
        }
        
        .pin-toggle:hover {
            filter: brightness(1.1);
            transform: scale(1.02);
        }
        
        .category-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: var(--mux-radius-md);
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .note-content-editor {
            min-height: 300px;
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 14px;
            line-height: 1.6;
            resize: vertical;
        }
        
        .markdown-hint {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            background: var(--vscode-sideBar-background);
            border-radius: var(--mux-radius-md);
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
        }
        
        .markdown-hint code {
            background: var(--vscode-editor-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h1>
        <span>📝</span>
        ${note ? 'Edit' : 'New'} Note
        ${note?.isPinned ? '<span class="category-badge">📌 Pinned</span>' : ''}
    </h1>
    
    ${note ? `
    <div class="meta-info">
        <div class="meta-item">
            <span class="meta-label">ID:</span>
            <span class="meta-value">${note.id.substring(0, 8)}...</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Created:</span>
            <span class="meta-value">${new Date(note.createdAt).toLocaleString()}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Updated:</span>
            <span class="meta-value">${new Date(note.updatedAt).toLocaleString()}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Category:</span>
            <span class="category-badge">${formatCategory(note.category)}</span>
        </div>
    </div>
    ` : ''}

    <form id="noteForm">
        <div class="form-group">
            <label for="title" class="required">Title</label>
            <input type="text" id="title" required value="${note?.title || ''}" placeholder="Enter note title..." />
        </div>

        <div class="row">
            <div class="form-group">
                <label for="category">Category</label>
                <select id="category">
                    ${Object.values(NoteCategory).map(c => 
                        `<option value="${c}" ${note?.category === c ? 'selected' : ''}>${formatCategory(c)}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="form-group">
                <label for="projectId">Project</label>
                <select id="projectId">
                    <option value="">-- No Project --</option>
                    ${projects.map(p => 
                        `<option value="${p.id}" ${(note?.projectId === p.id) || (!note && this.dataService.activeProjectId === p.id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
                    ).join('')}
                </select>
            </div>
        </div>

        <div class="form-group">
            <label for="content">Content</label>
            <textarea id="content" class="note-content-editor" placeholder="Write your note here... Markdown is supported!">${note?.content || ''}</textarea>
            <div class="markdown-hint">
                💡 <span>Markdown supported:</span>
                <code>**bold**</code>
                <code>*italic*</code>
                <code># Heading</code>
                <code>- List</code>
                <code>\`code\`</code>
            </div>
        </div>

        <div class="form-group">
            <label for="tags">Tags (comma-separated)</label>
            <input type="text" id="tags" value="${note?.tags.join(', ') || ''}" placeholder="e.g., important, review, idea" />
        </div>

        <div class="buttons">
            <button type="submit" class="btn-primary">💾 Save Note</button>
            ${note ? `<button type="button" class="pin-toggle" onclick="togglePin()">${note.isPinned ? '📌 Unpin Note' : '📌 Pin Note'}</button>` : ''}
            ${note ? '<button type="button" class="btn-danger" onclick="deleteNote()">🗑️ Delete</button>' : ''}
        </div>
    </form>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('noteForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const data = {
                title: document.getElementById('title').value,
                content: document.getElementById('content').value,
                category: document.getElementById('category').value,
                projectId: document.getElementById('projectId').value || undefined,
                tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t)
            };

            vscode.postMessage({ command: 'save', data });
        });

        function deleteNote() {
            vscode.postMessage({ command: 'delete' });
        }

        function togglePin() {
            vscode.postMessage({ command: 'togglePin' });
        }
    </script>
</body>
</html>`;
    }
}

function formatCategory(category: NoteCategory): string {
    return category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
