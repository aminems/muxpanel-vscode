export interface Note {
    id: string;
    title: string;
    content: string;
    category: NoteCategory;
    projectId?: string;
    linkedRequirementIds: string[];
    linkedTaskIds: string[];
    linkedNoteIds: string[];
    tags: string[];
    isPinned: boolean;
    createdAt: string;
    updatedAt: string;
}

export enum NoteCategory {
    General = 'general',
    MeetingNotes = 'meeting-notes',
    Decision = 'decision',
    TechnicalNote = 'technical-note',
    Review = 'review',
    Idea = 'idea',
    Issue = 'issue'
}

export function createNote(partial: Partial<Note> & { title: string }): Note {
    const now = new Date().toISOString();
    return {
        id: partial.id || generateNoteId(),
        title: partial.title,
        content: partial.content || '',
        category: partial.category || NoteCategory.General,
        projectId: partial.projectId,
        linkedRequirementIds: partial.linkedRequirementIds || [],
        linkedTaskIds: partial.linkedTaskIds || [],
        linkedNoteIds: partial.linkedNoteIds || [],
        tags: partial.tags || [],
        isPinned: partial.isPinned || false,
        createdAt: partial.createdAt || now,
        updatedAt: now
    };
}

function generateNoteId(): string {
    return `NOTE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
