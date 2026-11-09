#!/usr/bin/env node
// stdio entry point: `SIGMA_URL=http://localhost:3387 SIGMA_TOKEN=sgm_… node packages/mcp/bin/sigma-mcp.mjs`
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSigmaMcpServer } from '../src/server.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const url = process.env.SIGMA_URL ?? 'http://localhost:3387';
const token = process.env.SIGMA_TOKEN ?? '';
if (!token)
  console.error(
    'sigma-mcp: SIGMA_TOKEN is not set; every tool call will fail until it is. Create one under Account → API tokens.',
  );

const server = createSigmaMcpServer({ url, token, version: pkg.version });
await server.connect(new StdioServerTransport());
console.error(`sigma-mcp ${pkg.version} connected to ${url}`);
