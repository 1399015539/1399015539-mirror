#!/usr/bin/env node

/**
 * MCP server based on Playwright headless browser
 * Provides functionality to fetch web page content
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";

// Parse command line arguments, check for debug flag
export const isDebugMode = process.argv.includes("--debug");

/**
 * Start the server
 */
async function main() {
  logger.info("[Setup] Initializing browser MCP server...");

  if (isDebugMode) {
    logger.error(
      "[Setup] Debug mode enabled, Chrome browser window will be visible"
    );
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("[Setup] Server started");
}

main().catch((error) => {
  logger.error(`[Error] Server error: ${error}`);
  process.exit(1);
});
