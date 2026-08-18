import { describe,expect,it } from "vitest";import { getPreset,SUPPORTED_LOCALES } from "@/lib/workspace";
const keys=["GENERAL","SOFTWARE","MARKETING","PROJECT","CONSULTING"] as const;
describe("workspace presets",()=>{for(const locale of SUPPORTED_LOCALES)for(const key of keys)it(`${key} is complete in ${locale}`,()=>{const columns=getPreset(key,locale);expect(columns.length).toBeGreaterThanOrEqual(5);expect(columns.length).toBeLessThanOrEqual(6);expect(columns.map(c=>c.position)).toEqual(columns.map((_,i)=>i));expect(columns.every(c=>c.title&&c.description&&c.semanticKey)).toBe(true)})});
