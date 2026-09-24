export type SourceFilter = "all" | "Running" | "To Be Determined" | "Ended" | "unknown";
export type ChoiceFilter = "all" | "following" | "trying";
type Series = { id: number; title: string; status: string; trying: boolean };
const labels: Record<string,string> = {Running:"Lopend","To Be Determined":"Vervolg nog onzeker",Ended:"Beëindigd"};
const rank = (status:string) => status === "Running" ? 0 : status === "To Be Determined" ? 1 : status === "Ended" ? 2 : 3;
export const sourceStatus = (status:string) => Object.hasOwn(labels,status) ? labels[status] : "Status onbekend";

export function visibleSeries<T extends Series>(series: readonly T[], source:SourceFilter, choice:ChoiceFilter):T[] {
  return series.filter(show=>(source === "all" || (source === "unknown" ? rank(show.status) === 3 : show.status === source)) &&
    (choice === "all" || show.trying === (choice === "trying")))
    .sort((a,b)=>rank(a.status)-rank(b.status) || a.title.localeCompare(b.title,"nl") || a.id-b.id);
}
