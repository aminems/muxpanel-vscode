import * as vscode from 'vscode';
import { DataService } from '../services';
import { Note, NoteCategory } from '../models';

export class NoteTreeItem extends vscode.TreeItem {
    constructor(
        public readonly note: Note
    ) {
        super(note.title, vscode.TreeItemCollapsibleState.None);
        
        this.id = note.id;
        this.tooltip = this.createTooltip();
        this.description = this.createDescription();
        this.contextValue = note.isPinned ? 'notePinned' : 'note';
        this.iconPath = this.getIcon();
        
        this.command = {
            command: 'muxpanel.openNote',
            title: 'Open Note',
            arguments: [note.id]
        };
    }

    private createDescription(): string {
        const parts: string[] = [];
        if (this.note.isPinned) {
            parts.push('📌');
        }
        parts.push(`[${this.note.category}]`);
        parts.push(new Date(this.note.updatedAt).toLocaleDateString());
        return parts.join(' ');
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${this.note.title}**\n\n`);
        md.appendMarkdown(`**Category:** ${this.note.category}\n\n`);
        md.appendMarkdown(`**Updated:** ${new Date(this.note.updatedAt).toLocaleString()}\n\n`);
        if (this.note.tags.length > 0) {
            md.appendMarkdown(`**Tags:** ${this.note.tags.join(', ')}\n\n`);
        }
        if (this.note.content) {
            const preview = this.note.content.substring(0, 200);
            md.appendMarkdown(`**Preview:**\n${preview}${this.note.content.length > 200 ? '...' : ''}\n\n`);
        }
        return md;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.note.category) {
            case NoteCategory.General:
                return new vscode.ThemeIcon('note', new vscode.ThemeColor('charts.gray'));
            case NoteCategory.MeetingNotes:
                return new vscode.ThemeIcon('organization', new vscode.ThemeColor('charts.blue'));
            case NoteCategory.Decision:
                return new vscode.ThemeIcon('law', new vscode.ThemeColor('charts.purple'));
            case NoteCategory.TechnicalNote:
                return new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.green'));
            case NoteCategory.Review:
                return new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.orange'));
            case NoteCategory.Idea:
                return new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('charts.yellow'));
            case NoteCategory.Issue:
                return new vscode.ThemeIcon('issues', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('file-text');
        }
    }
}

export class NoteCategoryItem extends vscode.TreeItem {
    constructor(
        public readonly category: NoteCategory | 'pinned',
        public readonly count: number
    ) {
        super(
            category === 'pinned' ? '📌 Pinned' : formatCategory(category),
            count > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
        );
        
        this.id = `category-${category}`;
        this.description = `${count} notes`;
        this.contextValue = 'noteCategory';
    }
}

function formatCategory(category: NoteCategory): string {
    return category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export class NotesProvider implements vscode.TreeDataProvider<NoteTreeItem | NoteCategoryItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<NoteTreeItem | NoteCategoryItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private dataService: DataService;
    private viewMode: 'flat' | 'byCategory' = 'byCategory';

    constructor() {
        this.dataService = DataService.getInstance();
        this.dataService.onDataChanged(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setViewMode(mode: 'flat' | 'byCategory'): void {
        this.viewMode = mode;
        this.refresh();
    }

    getTreeItem(element: NoteTreeItem | NoteCategoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: NoteTreeItem | NoteCategoryItem): Thenable<(NoteTreeItem | NoteCategoryItem)[]> {
        if (!element) {
            if (this.viewMode === 'flat') {
                // Filter by active project
                const notes = this.dataService.getNotesByActiveProject();
                // Sort: pinned first, then by updated date
                notes.sort((a, b) => {
                    if (a.isPinned && !b.isPinned) {return -1;}
                    if (!a.isPinned && b.isPinned) {return 1;}
                    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                });
                return Promise.resolve(notes.map(note => new NoteTreeItem(note)));
            } else {
                // Group by category - filter by active project
                const notes = this.dataService.getNotesByActiveProject();
                const pinnedNotes = notes.filter(n => n.isPinned);
                const categories: (NoteCategoryItem)[] = [];
                
                // Add pinned category if there are pinned notes
                if (pinnedNotes.length > 0) {
                    categories.push(new NoteCategoryItem('pinned', pinnedNotes.length));
                }
                
                // Add other categories
                for (const category of Object.values(NoteCategory)) {
                    const count = notes.filter(n => n.category === category).length;
                    if (count > 0) {
                        categories.push(new NoteCategoryItem(category, count));
                    }
                }
                
                return Promise.resolve(categories);
            }
        } else if (element instanceof NoteCategoryItem) {
            // Filter by active project
            const notes = this.dataService.getNotesByActiveProject();
            let filtered: Note[];
            
            if (element.category === 'pinned') {
                filtered = notes.filter(n => n.isPinned);
            } else {
                filtered = notes.filter(n => n.category === element.category);
            }
            
            filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            return Promise.resolve(filtered.map(note => new NoteTreeItem(note)));
        }
        return Promise.resolve([]);
    }

    getParent(element: NoteTreeItem | NoteCategoryItem): vscode.ProviderResult<NoteTreeItem | NoteCategoryItem> {
        if (element instanceof NoteTreeItem && this.viewMode === 'byCategory') {
            const note = element.note;
            if (note.isPinned) {
                return new NoteCategoryItem('pinned', 1);
            }
            return new NoteCategoryItem(note.category, 1);
        }
        return null;
    }
}
