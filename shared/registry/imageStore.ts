export class ImageStore {
    private readonly cache = new Map<string, Readonly<Uint8Array>>();
    private readonly versions = new Map<string, string>();

    put(id: string, bytes: Uint8Array, version?: string): void {
        if (version && this.versions.get(id) === version && this.cache.has(id)) {
            return;
        }

        // Notebook hosts may reuse and mutate an output item's Uint8Array on a
        // later execution. Keep an owned snapshot so history can still capture
        // the actual previous image after that happens.
        this.cache.set(id, Uint8Array.from(bytes));

        if (version) {
            this.versions.set(id, version);
        } else {
            this.versions.delete(id);
        }
    }

    get(id: string): Readonly<Uint8Array> | undefined {
        return this.cache.get(id);
    }

    remove(id: string): void {
        this.cache.delete(id);
        this.versions.delete(id);
    }

    clear(): void {
        this.cache.clear();
        this.versions.clear();
    }

    clearNotebook(notebookUri: string): void {
        const prefix = `${notebookUri}::`;

        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                this.versions.delete(key);
            }
        }
    }
}

export const imageStore = new ImageStore();
