import { expect, it } from "vitest";
import { normalizeTimeZone } from "@/lib/time-zone";
it.each([["europe/amsterdam","Europe/Amsterdam"],["utc","UTC"],["Asia/Kolkata","Asia/Kolkata"],["Europe/Kyiv","Europe/Kyiv"],["UTC","UTC"],["Etc/UTC","Etc/UTC"],["Etc/GMT+5","Etc/GMT+5"]])("preserves supported IANA spelling %s", (input, expected) => { expect(normalizeTimeZone(input)).toBe(expected); });
it.each(["asia/kolkata","etc/utc","+02:00","+0200","UTC+2","GMT-5","Mars/Olympus", " Europe/Amsterdam ", ""]) ("rejects offset or invalid zone %s", input => { expect(normalizeTimeZone(input)).toBeNull(); });
