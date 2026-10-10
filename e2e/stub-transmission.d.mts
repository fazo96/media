// Types for stub-transmission.mjs, which tests/transmission.test.ts imports.
export const DOWNLOAD_DIR: string;
export function startStub(opts: { port?: number; root: string }): Promise<{ url: string; close: () => Promise<void> }>;
export function stubCall(url: string, method: string): Promise<Record<string, unknown>>;
