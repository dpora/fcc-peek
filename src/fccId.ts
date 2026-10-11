export function normalize(id: string): string {
  return id
    .toUpperCase()
    .replace(/[‐-―_]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[.,;:]+$/, '');
}
