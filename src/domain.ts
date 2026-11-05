export class SkywardError extends Error {}
export function isoDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  return `${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;
}
export function resolveTerm(available: string[], query?: {quarter?:number;semester?:number;term?:string}): string | undefined {
  if (!query) return undefined;
  if ([query.quarter,query.semester,query.term].filter(v=>v!==undefined).length > 1) throw new SkywardError('Supply only one of quarter, semester, or term.');
  const requested = query.term?.toUpperCase() || (query.semester ? `S${query.semester}` : query.quarter ? (available.includes(`Q${query.quarter}`) ? `Q${query.quarter}` : `T${query.quarter}`) : undefined);
  if (requested && !available.includes(requested)) throw new SkywardError(`Term unavailable. Available terms: ${available.join(', ')}.`);
  return requested;
}
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work:()=>Promise<T>):Promise<T> { const next=this.tail.then(work); this.tail=next.catch(()=>{}); return next; }
}
