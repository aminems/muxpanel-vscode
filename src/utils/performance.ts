// ============================================================================
// PERFORMANCE UTILITIES
// Debouncing, Caching, and Optimization helpers for Muxpanel
// ============================================================================

/**
 * Creates a debounced function that delays invoking func until after wait 
 * milliseconds have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate: boolean = false
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    let lastArgs: Parameters<T> | null = null;

    return function (this: any, ...args: Parameters<T>) {
        lastArgs = args;
        const later = () => {
            timeout = null;
            if (!immediate && lastArgs) {
                func.apply(this, lastArgs);
            }
        };

        const callNow = immediate && !timeout;
        
        if (timeout) {
            clearTimeout(timeout);
        }
        
        timeout = setTimeout(later, wait);
        
        if (callNow) {
            func.apply(this, args);
        }
    };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let lastTime = 0;
    let timeout: NodeJS.Timeout | null = null;

    return function (this: any, ...args: Parameters<T>) {
        const now = Date.now();
        const remaining = wait - (now - lastTime);

        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            lastTime = now;
            func.apply(this, args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                lastTime = Date.now();
                timeout = null;
                func.apply(this, args);
            }, remaining);
        }
    };
}

/**
 * LRU Cache implementation for frequently accessed data
 */
export class LRUCache<K, V> {
    private cache: Map<K, V>;
    private readonly maxSize: number;

    constructor(maxSize: number = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }
        // Move to end (most recently used)
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove oldest (first) entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

/**
 * Time-based cache with automatic expiration
 */
export class TTLCache<K, V> {
    private cache: Map<K, { value: V; expiresAt: number }>;
    private readonly defaultTTL: number;

    constructor(defaultTTLMs: number = 60000) { // Default 1 minute
        this.cache = new Map();
        this.defaultTTL = defaultTTLMs;
    }

    get(key: K): V | undefined {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key: K, value: V, ttlMs?: number): void {
        const expiresAt = Date.now() + (ttlMs ?? this.defaultTTL);
        this.cache.set(key, { value, expiresAt });
    }

    has(key: K): boolean {
        const value = this.get(key);
        return value !== undefined;
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    // Clean up expired entries
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }
}

/**
 * Memoization decorator for expensive computations
 */
export function memoize<T extends (...args: any[]) => any>(
    func: T,
    keyResolver?: (...args: Parameters<T>) => string
): T {
    const cache = new Map<string, ReturnType<T>>();
    
    return function (this: any, ...args: Parameters<T>): ReturnType<T> {
        const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);
        
        if (cache.has(key)) {
            return cache.get(key)!;
        }
        
        const result = func.apply(this, args);
        cache.set(key, result);
        return result;
    } as T;
}

/**
 * Batch processor for bulk operations
 */
export class BatchProcessor<T> {
    private queue: T[] = [];
    private processing = false;
    private readonly batchSize: number;
    private readonly processor: (items: T[]) => Promise<void>;
    private readonly delayMs: number;
    private timeout: NodeJS.Timeout | null = null;

    constructor(
        processor: (items: T[]) => Promise<void>,
        batchSize: number = 50,
        delayMs: number = 100
    ) {
        this.processor = processor;
        this.batchSize = batchSize;
        this.delayMs = delayMs;
    }

    add(item: T): void {
        this.queue.push(item);
        this.scheduleProcessing();
    }

    addMany(items: T[]): void {
        this.queue.push(...items);
        this.scheduleProcessing();
    }

    private scheduleProcessing(): void {
        if (this.timeout) {
            return;
        }
        
        this.timeout = setTimeout(() => {
            this.timeout = null;
            this.process();
        }, this.delayMs);
    }

    private async process(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        
        try {
            while (this.queue.length > 0) {
                const batch = this.queue.splice(0, this.batchSize);
                await this.processor(batch);
            }
        } finally {
            this.processing = false;
        }
    }

    async flush(): Promise<void> {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        await this.process();
    }

    get pendingCount(): number {
        return this.queue.length;
    }
}

/**
 * Index builder for fast lookups
 */
export class IndexedCollection<T, K extends keyof T> {
    private items: T[] = [];
    private indexes: Map<keyof T, Map<any, T[]>> = new Map();
    private primaryKey: K;

    constructor(primaryKey: K, indexFields: (keyof T)[] = []) {
        this.primaryKey = primaryKey;
        this.indexes.set(primaryKey, new Map());
        for (const field of indexFields) {
            this.indexes.set(field, new Map());
        }
    }

    setItems(items: T[]): void {
        this.items = items;
        this.rebuildIndexes();
    }

    private rebuildIndexes(): void {
        // Clear all indexes
        for (const index of this.indexes.values()) {
            index.clear();
        }

        // Rebuild indexes
        for (const item of this.items) {
            for (const [field, index] of this.indexes.entries()) {
                const value = item[field];
                if (!index.has(value)) {
                    index.set(value, []);
                }
                index.get(value)!.push(item);
            }
        }
    }

    getByPrimaryKey(value: T[K]): T | undefined {
        const results = this.indexes.get(this.primaryKey)?.get(value);
        return results?.[0];
    }

    getByField(field: keyof T, value: any): T[] {
        return this.indexes.get(field)?.get(value) ?? [];
    }

    getAll(): T[] {
        return this.items;
    }

    add(item: T): void {
        this.items.push(item);
        for (const [field, index] of this.indexes.entries()) {
            const value = item[field];
            if (!index.has(value)) {
                index.set(value, []);
            }
            index.get(value)!.push(item);
        }
    }

    remove(primaryKeyValue: T[K]): boolean {
        const index = this.items.findIndex(item => item[this.primaryKey] === primaryKeyValue);
        if (index === -1) {
            return false;
        }

        const item = this.items[index];
        this.items.splice(index, 1);

        // Update indexes
        for (const [field, fieldIndex] of this.indexes.entries()) {
            const value = item[field];
            const items = fieldIndex.get(value);
            if (items) {
                const itemIndex = items.indexOf(item);
                if (itemIndex !== -1) {
                    items.splice(itemIndex, 1);
                }
                if (items.length === 0) {
                    fieldIndex.delete(value);
                }
            }
        }

        return true;
    }

    clear(): void {
        this.items = [];
        for (const index of this.indexes.values()) {
            index.clear();
        }
    }
}

/**
 * Lazy loader for deferred initialization
 */
export class LazyLoader<T> {
    private value: T | undefined;
    private loaded = false;
    private loading: Promise<T> | null = null;
    private readonly loader: () => T | Promise<T>;

    constructor(loader: () => T | Promise<T>) {
        this.loader = loader;
    }

    async get(): Promise<T> {
        if (this.loaded) {
            return this.value!;
        }

        if (this.loading) {
            return this.loading;
        }

        this.loading = Promise.resolve(this.loader()).then(value => {
            this.value = value;
            this.loaded = true;
            this.loading = null;
            return value;
        });

        return this.loading;
    }

    getSync(): T | undefined {
        return this.loaded ? this.value : undefined;
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    reset(): void {
        this.value = undefined;
        this.loaded = false;
        this.loading = null;
    }
}

/**
 * Performance measurement utilities
 */
export class PerformanceTracker {
    private static metrics: Map<string, number[]> = new Map();
    private static enabled = process.env.NODE_ENV === 'development';

    static enable(): void {
        this.enabled = true;
    }

    static disable(): void {
        this.enabled = false;
    }

    static start(label: string): () => number {
        if (!this.enabled) {
            return () => 0;
        }

        const startTime = performance.now();
        return () => {
            const duration = performance.now() - startTime;
            
            if (!this.metrics.has(label)) {
                this.metrics.set(label, []);
            }
            this.metrics.get(label)!.push(duration);
            
            return duration;
        };
    }

    static measure<T>(label: string, fn: () => T): T {
        const end = this.start(label);
        try {
            return fn();
        } finally {
            end();
        }
    }

    static async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const end = this.start(label);
        try {
            return await fn();
        } finally {
            end();
        }
    }

    static getStats(label: string): { avg: number; min: number; max: number; count: number } | null {
        const data = this.metrics.get(label);
        if (!data || data.length === 0) {
            return null;
        }

        const sum = data.reduce((a, b) => a + b, 0);
        return {
            avg: sum / data.length,
            min: Math.min(...data),
            max: Math.max(...data),
            count: data.length
        };
    }

    static clear(): void {
        this.metrics.clear();
    }

    static report(): string {
        const lines: string[] = ['Performance Report:'];
        for (const [label, data] of this.metrics.entries()) {
            const stats = this.getStats(label);
            if (stats) {
                lines.push(`  ${label}: avg=${stats.avg.toFixed(2)}ms, min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms, count=${stats.count}`);
            }
        }
        return lines.join('\n');
    }
}

/**
 * Virtual list helper for large datasets
 */
export interface VirtualListOptions {
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
}

export interface VirtualListResult<T> {
    items: T[];
    startIndex: number;
    endIndex: number;
    totalHeight: number;
    offsetTop: number;
}

export function getVirtualListItems<T>(
    allItems: T[],
    scrollTop: number,
    options: VirtualListOptions
): VirtualListResult<T> {
    const { itemHeight, containerHeight, overscan = 3 } = options;
    const totalHeight = allItems.length * itemHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
        allItems.length,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
        items: allItems.slice(startIndex, endIndex),
        startIndex,
        endIndex,
        totalHeight,
        offsetTop: startIndex * itemHeight
    };
}
