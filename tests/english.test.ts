import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
// Reuse Next's bundled parser: actual JSX/string nodes, excluding comments and technical attributes.
const { parser } = createRequire(import.meta.url)("next/dist/compiled/babel/bundle.js");
const words = /\b(instellingen|volgen|proberen|melding|opnieuw|bevestig|verwijder|uitnodiging|beheer|gegevens|probeer|niet|geen|je|jouw|het|een|kies|aflevering|serie|klaar)\b/gi;
const technical = new Set(["className", "id", "htmlFor", "href", "key"]);
function files(dir: string): string[] { return readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(join(dir,e.name)) : /\.tsx?$/.test(e.name) ? [join(dir,e.name)] : []); }
it("keeps Dutch wording out of application messages and JSX copy",()=>{
  const hits: string[]=[];
  for(const file of files("src")) {
    const ast=parser().parse(readFileSync(file,"utf8"),{sourceType:"module",plugins:["typescript","jsx"]});
    const visit=(node:any):void=>{
      if(!node || typeof node!=="object")return;
      if(node.type==="ImportDeclaration" || (node.type==="JSXAttribute" && technical.has(node.name?.name)))return;
      const copy=node.type==="StringLiteral"||node.type==="JSXText"?node.value:node.type==="TemplateElement"?node.value.cooked:null;
      if(typeof copy==="string")for(const match of copy.matchAll(words)) hits.push(`${file}:${node.loc.start.line}: ${match[0]}`);
      for(const [key,value] of Object.entries(node))if(!["loc","start","end","extra","comments"].includes(key)) {
        if(Array.isArray(value))value.forEach(visit);else if(value && typeof value==="object")visit(value);
      }
    };visit(ast);
  }
  expect(hits).toEqual([]);
});
