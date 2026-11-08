import { registerGoogleAds } from "../../src/platforms/google-ads/index.js";
export function collect(_platform: string, config: any = {accessToken:"fixture"}) {
  const tools: any[] = [];
  const server = {tool(name: string, description: string, shape: any, handler: any) { tools.push({name,description,shape,handler,write:Object.hasOwn(shape,"confirm")}); },resource() {},registerResource() {},prompt() {} };
  registerGoogleAds(server as never, {...config,logLevel:"error",enableWrites:true} as never);
  return tools;
}
export const allTools = () => collect("fixture");
export const writeToolNames = (platform:string) => collect(platform).filter(t=>t.write).map(t=>t.name);
