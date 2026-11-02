import type { Resolution } from './resolve';

// Hand-off from the Scan screen to the results or Not found screen (in memory only).
export const scanState: { text: string; resolution: Resolution | null } = { text: '', resolution: null };
