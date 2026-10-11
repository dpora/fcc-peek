import type { Candidate } from './fccId';

// Hand-off from the Scan screen to the Confirm screen (in memory only).
export const scanState: { text: string; candidates: Candidate[] } = { text: '', candidates: [] };
