import { formatInZone } from "@/server/event-time";
export function storedEvent(old: any, body: any) {
  const value = { ...old, ...body };
  for (const key of ["start", "end"]) {
    if (body[key]) {
      value[key] = { ...old?.[key] };
      for (const [k,v] of Object.entries(body[key])) { if (v === null) delete value[key][k]; else value[key][k] = v; }
      if (value[key].dateTime) value[key].dateTime = formatInZone(new Date(value[key].dateTime), "Europe/Amsterdam");
    }
  }
  if (value.location === null) delete value.location;
  return value;
}
