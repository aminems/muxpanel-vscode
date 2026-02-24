import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { 
    Requirement, 
    Baseline, 
    Review, 
    RequirementDocument, 
    CustomFieldDefinition,
    Project, 
    Task, 
    Note 
} from '../models';
import { debounce } from '../utils/performance';

export interface MuxpanelData {
    requirements: Requirement[];
    baselines: Baseline[];
    reviews: Review[];
    documents: RequirementDocument[];
    customFieldDefinitions: CustomFieldDefinition[];
    projects: Project[];
    tasks: Task[];
    notes: Note[];
    metadata: {
        version: string;
        lastUpdated: string;
        requirementKeyCounter: number;
        activeProjectId?: string;
    };
}

// ============================================================================
// PERFORMANCE-OPTIMIZED STORAGE SERVICE
// ============================================================================

export class StorageService {
    private static instance: StorageService;
    private workspaceRoot: string | undefined;
    private readonly dataFileName = 'muxpanel-data.json';
    private readonly dataFolderName = '.muxpanel';
    private readonly backupFolderName = 'backups';
    
    // Performance: track if write is in progress to prevent concurrent writes
    private writeInProgress = false;
    private pendingData: MuxpanelData | null = null;
    
    // Performance: cache the last loaded data to avoid unnecessary reads
    private cachedData: MuxpanelData | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 1000; // 1 second cache for reads

    private constructor() {
        this.refreshWorkspace();
    }

    public static getInstance(): StorageService {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }

    private get dataFolderPath(): string | undefined {
        if (!this.workspaceRoot) {
            return undefined;
        }
        return path.join(this.workspaceRoot, this.dataFolderName);
    }

    private get dataFilePath(): string | undefined {
        const folderPath = this.dataFolderPath;
        if (!folderPath) {
            return undefined;
        }
        return path.join(folderPath, this.dataFileName);
    }
    
    private get backupFolderPath(): string | undefined {
        const folderPath = this.dataFolderPath;
        if (!folderPath) {
            return undefined;
        }
        return path.join(folderPath, this.backupFolderName);
    }

    private ensureDataFolder(): boolean {
        const folderPath = this.dataFolderPath;
        if (!folderPath) {
            return false;
        }
        try {
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            return true;
        } catch (error) {
            console.error('Error creating data folder:', error);
            return false;
        }
    }

    private createEmptyData(): MuxpanelData {
        return {
            requirements: [],
            baselines: [],
            reviews: [],
            documents: [],
            customFieldDefinitions: [],
            projects: [],
            tasks: [],
            notes: [],
            metadata: {
                version: '2.0.0',
                lastUpdated: new Date().toISOString(),
                requirementKeyCounter: 0
            }
        };
    }

    public loadData(): MuxpanelData {
        try {
            // Performance: return cached data if still valid
            const now = Date.now();
            if (this.cachedData && (now - this.cacheTimestamp) < this.CACHE_TTL) {
                return this.cachedData;
            }
            
            // Refresh workspace root in case it changed
            this.refreshWorkspace();
            
            if (!this.hasWorkspace()) {
                console.warn('No workspace folder open - using empty data');
                return this.createEmptyData();
            }
            
            if (!this.ensureDataFolder()) {
                console.error('Failed to ensure data folder exists');
                return this.createEmptyData();
            }
            
            const filePath = this.dataFilePath;
            if (!filePath || !fs.existsSync(filePath)) {
                const emptyData = this.createEmptyData();
                this.saveData(emptyData);
                return emptyData;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(fileContent) as MuxpanelData;
            
            // Migration: add new fields if they don't exist
            if (!data.baselines) { data.baselines = []; }
            if (!data.reviews) { data.reviews = []; }
            if (!data.documents) { data.documents = []; }
            if (!data.customFieldDefinitions) { data.customFieldDefinitions = []; }
            if (!data.metadata.requirementKeyCounter) { data.metadata.requirementKeyCounter = data.requirements.length; }
            
            // Cache the loaded data
            this.cachedData = data;
            this.cacheTimestamp = now;
            
            return data;
        } catch (error) {
            console.error('Error loading Muxpanel data:', error);
            return this.createEmptyData();
        }
    }

    public saveData(data: MuxpanelData): void {
        try {
            if (!this.hasWorkspace()) {
                console.warn('No workspace folder open - cannot save data');
                vscode.window.showWarningMessage('Muxpanel: No workspace folder open. Please open a folder to save data.');
                return;
            }
            
            // If a write is already in progress, queue this data for later
            if (this.writeInProgress) {
                this.pendingData = data;
                return;
            }
            
            this.writeInProgress = true;
            
            try {
                this.executeWrite(data);
            } finally {
                this.writeInProgress = false;
                
                // If there's pending data, write it now
                if (this.pendingData) {
                    const pending = this.pendingData;
                    this.pendingData = null;
                    this.saveData(pending);
                }
            }
        } catch (error) {
            console.error('Error saving Muxpanel data:', error);
            vscode.window.showErrorMessage(`Failed to save Muxpanel data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private executeWrite(data: MuxpanelData): void {
        if (!this.ensureDataFolder()) {
            vscode.window.showErrorMessage('Muxpanel: Failed to create data folder');
            return;
        }
        
        const filePath = this.dataFilePath;
        if (!filePath) {
            vscode.window.showErrorMessage('Muxpanel: Invalid file path');
            return;
        }
        
        data.metadata.lastUpdated = new Date().toISOString();
        
        // Performance: write to temp file first, then rename (atomic write)
        const tempPath = `${filePath}.tmp`;
        const jsonData = JSON.stringify(data, null, 2);
        
        fs.writeFileSync(tempPath, jsonData, 'utf-8');
        
        // Atomic rename
        fs.renameSync(tempPath, filePath);
        
        // Update cache
        this.cachedData = data;
        this.cacheTimestamp = Date.now();
    }
    
    /**
     * Create a backup of current data
     */
    public createBackup(): string | null {
        try {
            const backupFolder = this.backupFolderPath;
            if (!backupFolder) {
                return null;
            }
            
            if (!fs.existsSync(backupFolder)) {
                fs.mkdirSync(backupFolder, { recursive: true });
            }
            
            const data = this.loadData();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `muxpanel-backup-${timestamp}.json`;
            const backupPath = path.join(backupFolder, backupFileName);
            
            fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8');
            
            // Clean up old backups (keep last 10)
            this.cleanupOldBackups(10);
            
            return backupPath;
        } catch (error) {
            console.error('Error creating backup:', error);
            return null;
        }
    }
    
    private cleanupOldBackups(keepCount: number): void {
        const backupFolder = this.backupFolderPath;
        if (!backupFolder || !fs.existsSync(backupFolder)) {
            return;
        }
        
        try {
            const files = fs.readdirSync(backupFolder)
                .filter(f => f.startsWith('muxpanel-backup-') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(backupFolder, f),
                    time: fs.statSync(path.join(backupFolder, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            
            // Delete old backups
            for (let i = keepCount; i < files.length; i++) {
                fs.unlinkSync(files[i].path);
            }
        } catch (error) {
            console.error('Error cleaning up backups:', error);
        }
    }
    
    /**
     * Invalidate the cache to force a fresh read
     */
    public invalidateCache(): void {
        this.cachedData = null;
        this.cacheTimestamp = 0;
    }

    public exportData(filePath: string): void {
        const data = this.loadData();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    public importData(filePath: string): MuxpanelData {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(fileContent) as MuxpanelData;
        this.saveData(data);
        return data;
    }

    public hasWorkspace(): boolean {
        return !!this.workspaceRoot;
    }

    public refreshWorkspace(): void {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            console.log('Muxpanel: Workspace root set to:', this.workspaceRoot);
        }
    }
    
    public getWorkspaceRoot(): string | undefined {
        return this.workspaceRoot;
    }
}
