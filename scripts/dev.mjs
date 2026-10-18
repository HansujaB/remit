import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
const root = fileURLToPath(new URL('../', import.meta.url));
loadEnv({ path: path.join(root, '.env'), override: true, quiet: true });
process.env.PORT ||= '5174';
if (process.env.PORT === '5173') throw new Error('PORT must differ from the frontend port 5173. Set PORT=5174 in .env.');
console.log(`Remit project: ${root}`);
console.log(`Frontend: http://127.0.0.1:5173 | API: http://127.0.0.1:${process.env.PORT}`);
// Compile first with npm run build:server. This launcher starts no cloud deployment.
const children=[['dist-server/index.js'],['dist-server/worker.js'],['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort']].map(args=>spawn(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true}));
let ending=false;
function stop(code=0){if(ending)return;ending=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children)child.on('exit',code=>stop(code||0));
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
