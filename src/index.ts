#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { SkywardClient } from './client.js';
import { createServer } from './server.js';
try {
  const client=new SkywardClient(loadConfig());
  const server=createServer(client);
  const shutdown=async()=>{await client.close();await server.close();};
  process.once('SIGINT',()=>void shutdown());
  process.once('SIGTERM',()=>void shutdown());
  process.stdin.once('end',()=>void client.close());
  await server.connect(new StdioServerTransport());
} catch { console.error('Skyward MCP could not start. Check your environment file and configuration.');process.exitCode=1; }
