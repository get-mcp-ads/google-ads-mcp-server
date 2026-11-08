import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { createServer } from "../dist/index.js";
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const fixture={accessToken:'metadata-fixture',clientId:'metadata-fixture',clientSecret:'metadata-fixture',refreshToken:'metadata-fixture',developerToken:'metadata-fixture',logLevel:'error'};
async function connect(enableWrites, callback) {
 const server=createServer(pkg.name.includes('meta-ads')?{meta:{...fixture,enableWrites},logLevel:'error'}:{...fixture,enableWrites});
 const client=new Client({name:'quality-contract',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try {await callback(client,server);} finally {await client.close();await server.close();}
}
test('metadata is complete over MCP; write tools require explicit opt-in',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Metadata must not access a provider');};
 try {
  for(const enabled of [false,true]) await connect(enabled,async client=>{
   const tools=(await client.listTools()).tools;
   assert.equal(new Set(tools.map(t=>t.name)).size,tools.length,'duplicate tools');
   for(const tool of tools){
    assert.ok(tool.description.length>20,tool.name);
    assert.ok(tool.outputSchema?.required.includes('result'),tool.name);
    assert.equal(typeof tool.annotations?.readOnlyHint,'boolean',tool.name);
    if(!enabled) assert.equal(tool.annotations.readOnlyHint,true,tool.name);
    if(!tool.annotations.readOnlyHint){assert.ok(tool.inputSchema.properties.confirm,tool.name);assert.equal(tool.annotations.idempotentHint,false,tool.name);}
    for(const [key,schema] of Object.entries(tool.inputSchema.properties||{})) assert.ok(schema.description,`${tool.name}.${key}`);
   }
   assert.equal(client.getServerVersion().websiteUrl,pkg.homepage);
   assert.equal(client.getServerVersion().version,pkg.version);
  });
 } finally {globalThis.fetch=original;}
});
test('structured output preserves text, JSON arrays and errors through the SDK',async()=>{
 await connect(false,async(client,server)=>{
  server.tool('quality_fixture','Fixture that checks the actual SDK response contract.',{mode:z.enum(['json','text','error']).describe('Fixture response type.')},async({mode})=>({...(mode==='error'?{isError:true}:{}),content:[{type:'text',text:mode==='json'?'[{"spend":0,"currency":"EUR"}]':mode}]}));
  for(const mode of ['json','text','error']) {
   const out=await client.callTool({name:'quality_fixture',arguments:{mode}});
   if(mode==='error'){assert.equal(out.isError,true);assert.equal(out.structuredContent,undefined);}
   else {assert.equal(out.isError,undefined);assert.deepEqual(out.structuredContent.result,mode==='json'?[{spend:0,currency:'EUR'}]:'text');}
  }
 });
});
