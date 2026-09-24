import { expect, it } from "vitest";
import { visibleSeries, sourceStatus } from "@/lib/series-list";

const rows = [
  {id:6,title:"A",status:"Surprise",trying:true},
  {id:5,title:"A",status:"Ended",trying:false},
  {id:4,title:"A",status:"To Be Determined",trying:true},
  {id:3,title:"Z",status:"Running",trying:false},
  {id:2,title:"Één",status:"Running",trying:true},
  {id:1,title:"Één",status:"Running",trying:false},
];
it("orders running first, then uncertain, ended and unknown, with title and numeric ID ties",()=>{
  const original=structuredClone(rows);
  expect(visibleSeries(rows,"all","all").map(s=>s.id)).toEqual([1,2,3,4,5,6]);
  expect(rows).toEqual(original);
});
it.each([
  ["all","trying",[2,4,6]], ["all","following",[1,3,5]],
  ["Running","trying",[2]], ["Running","following",[1,3]],
  ["To Be Determined","all",[4]], ["Ended","trying",[]], ["unknown","all",[6]],
] as const)("combines %s and %s with AND",(status,choice,ids)=>{
  expect(visibleSeries(rows,status,choice).map(s=>s.id)).toEqual(ids);
});
it("handles empty lists and keeps unknown source values under one label",()=>{
  expect(visibleSeries([],"all","all")).toEqual([]);
  expect(sourceStatus("Surprise")).toBe("Status onbekend");
  expect(sourceStatus("Running")).toBe("Lopend");
  expect(sourceStatus("Ended")).toBe("Beëindigd");
  expect(sourceStatus("To Be Determined")).toBe("Vervolg nog onzeker");
});
