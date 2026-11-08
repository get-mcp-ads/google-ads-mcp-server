import {mkdtempSync, readFileSync, writeFileSync, cpSync, mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {execFileSync} from "node:child_process";
const root = resolve(import.meta.dirname || new URL("..", import.meta.url).pathname, ...(import.meta.dirname ? [".."] : []));
const destination = resolve(process.argv[2] || root);
mkdirSync(destination, {recursive:true});
const stage = mkdtempSync(join(tmpdir(), "getmcpads-mcpb-"));
for (const path of ["dist", "package.json", "package-lock.json", "README.md", "LICENSE", "NOTICE", "CHANGELOG.md", "server.json", "server-card.json", "icon.png"]) cpSync(join(root,path),join(stage,path),{recursive:true});
const manifest=JSON.parse(readFileSync(join(root,"manifest.template.json"),"utf8"));
const card=JSON.parse(readFileSync(join(root,"server-card.json"),"utf8"));
manifest.tools=card.tools.map(({name,description})=>({name,description}));
// MCPB 0.3 only permits names/descriptions here. The complete contracts are
// included separately in server-card.json and are exposed by tools/list.
writeFileSync(join(stage,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
execFileSync("npm",["ci","--omit=dev","--ignore-scripts","--no-audit","--no-fund"],{cwd:stage,stdio:"inherit"});
execFileSync("npx",["-y","@anthropic-ai/mcpb","validate",join(stage,"manifest.json")],{stdio:"inherit"});
execFileSync("npx",["-y","@anthropic-ai/mcpb","pack",stage,join(destination,`${manifest.name}-${manifest.version}.mcpb`)],{stdio:"inherit"});
console.log(`Staging directory: ${stage}`);
