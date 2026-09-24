import { expect } from "vitest";
export function simulatedCalendar() {
  const events = new Map<string, any>(), writes: {method:string; id:string; body?:any}[] = [];
  let loseInsert = false, failDelete = false, revision=0;
  const fetcher: typeof fetch = async (input, init) => {
    const url=new URL(String(input)), method=init?.method??"GET";
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-access");
    if(url.pathname.includes("/calendarList/")) return Response.json({id:"chosen@example.test",summary:"When2Watch",timeZone:"Europe/Amsterdam",accessRole:"owner",defaultReminders:[]});
    expect(decodeURIComponent(url.pathname.split("/calendars/")[1].split("/events")[0])).toBe("chosen@example.test");
    const id=url.pathname.split("/").at(-1)!;
    if(method==="GET" && id==="events") {
      const filters=url.searchParams.getAll("privateExtendedProperty");
      expect(filters).toContain("app=when2watch");
      // Google ORs repeated privateExtendedProperty filters, not ANDs.
      const all=[...events.values()].filter(e=>e.status!=="cancelled"&&filters.some(f=>{const i=f.indexOf("=");return e.extendedProperties?.private?.[f.slice(0,i)]===f.slice(i+1);}));
      const offset=Number(url.searchParams.get("pageToken")??0);
      return Response.json({items:all.slice(offset,offset+2),...(offset+2<all.length?{nextPageToken:String(offset+2)}:{})});
    }
    if(method==="POST") {
      const body=JSON.parse(String(init?.body)); writes.push({method,id:body.id,body});
      if(events.has(body.id)) return Response.json({}, {status:409});
      events.set(body.id,{...body,reminders:{useDefault:false},status:"confirmed",etag:`"v${++revision}"`});
      if(loseInsert){loseInsert=false;throw new Error("Lost after commit");}
      return Response.json(events.get(body.id));
    }
    if(method==="PATCH" || method==="DELETE") {
      const old=events.get(id); if(!old)return Response.json({}, {status:404});
      expect(new Headers(init?.headers).get("if-match")).toBe(old.etag);
      if(method==="DELETE" && failDelete){failDelete=false;return Response.json({}, {status:403});}
      const body=method==="PATCH"?JSON.parse(String(init?.body)):undefined;
      writes.push({method,id,body});
      if(body)events.set(id,{...old,...body,reminders:{useDefault:false},etag:`"v${++revision}"`});
      else events.set(id,{id,status:"cancelled"});
      return body?Response.json(events.get(id)):new Response(null,{status:204});
    }
    return events.has(id)?Response.json(events.get(id)):Response.json({}, {status:404});
  };
  return {events,writes,fetcher,loseNextInsert:()=>{loseInsert=true;},failNextDelete:()=>{failDelete=true;}};
}
