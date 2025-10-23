#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { parse } from "graphql/language";
import { z } from "zod";
import { checkDeprecatedArguments } from "./helpers/deprecation.js";
import {
	introspectEndpoint,
	introspectLocalSchema,
	introspectSchemaFromUrl,
} from "./helpers/introspection.js";
import { getVersion } from "./helpers/package.js" with { type: "macro" };

// Check for deprecated command line arguments
checkDeprecatedArguments();

const EnvSchema = z.object({
	NAME: z.string().default("mcp-graphql"),
	ENDPOINT: z.string().url().default("http://localhost:4000/graphql"),
	ALLOW_MUTATIONS: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.default("false"),
	HEADERS: z
		.string()
		.default("{}")
		.transform((val) => {
			try {
				return JSON.parse(val);
			} catch (e) {
				throw new Error("HEADERS must be a valid JSON string");
			}
		}),
	SCHEMA: z.string().optional(),
	TRANSPORT: z.enum(["stdio", "streamable-http", "sse"]).default("stdio"),
	PORT: z.string().default("3000").transform((val) => parseInt(val, 10)),
});

const env = EnvSchema.parse(process.env);

const server = new McpServer({
	name: env.NAME,
	version: getVersion(),
	description: `GraphQL MCP server for ${env.ENDPOINT}`,
});

server.resource("graphql-schema", new URL(env.ENDPOINT).href, async (uri) => {
	try {
		let schema: string;
		if (env.SCHEMA) {
			if (
				env.SCHEMA.startsWith("http://") ||
				env.SCHEMA.startsWith("https://")
			) {
				schema = await introspectSchemaFromUrl(env.SCHEMA);
			} else {
				schema = await introspectLocalSchema(env.SCHEMA);
			}
		} else {
			schema = await introspectEndpoint(env.ENDPOINT, env.HEADERS);
		}

		return {
			contents: [
				{
					uri: uri.href,
					text: schema,
				},
			],
		};
	} catch (error) {
		throw new Error(`Failed to get GraphQL schema: ${error}`);
	}
});

server.tool(
	"introspect-schema",
	"Introspect the GraphQL schema, use this tool before doing a query to get the schema information if you do not have it available as a resource already.",
	{
		// This is a workaround to help clients that can't handle an empty object as an argument
		// They will often send undefined instead of an empty object which is not allowed by the schema
		__ignore__: z
			.boolean()
			.default(false)
			.describe("This does not do anything"),
	},
	async () => {
		try {
			let schema: string;
			if (env.SCHEMA) {
				schema = await introspectLocalSchema(env.SCHEMA);
			} else {
				schema = await introspectEndpoint(env.ENDPOINT, env.HEADERS);
			}

			return {
				content: [
					{
						type: "text",
						text: schema,
					},
				],
			};
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Failed to introspect schema: ${error}`,
					},
				],
			};
		}
	},
);

server.tool(
	"query-graphql",
	"Query a GraphQL endpoint with the given query and variables",
	{
		query: z.string(),
		variables: z.string().optional(),
	},
	async ({ query, variables }) => {
		try {
			const parsedQuery = parse(query);

			// Check if the query is a mutation
			const isMutation = parsedQuery.definitions.some(
				(def) =>
					def.kind === "OperationDefinition" && def.operation === "mutation",
			);

			if (isMutation && !env.ALLOW_MUTATIONS) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: "Mutations are not allowed unless you enable them in the configuration. Please use a query operation instead.",
						},
					],
				};
			}
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Invalid GraphQL query: ${error}`,
					},
				],
			};
		}

		try {
			const response = await fetch(env.ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...env.HEADERS,
				},
				body: JSON.stringify({
					query,
					variables,
				}),
			});

			if (!response.ok) {
				const responseText = await response.text();

				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `GraphQL request failed: ${response.statusText}\n${responseText}`,
						},
					],
				};
			}

			const data = await response.json();

			if (data.errors && data.errors.length > 0) {
				// Contains GraphQL errors
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `The GraphQL response has errors, please fix the query: ${JSON.stringify(
								data,
								null,
								2,
							)}`,
						},
					],
				};
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(data, null, 2),
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to execute GraphQL query: ${error}`);
		}
	},
);

async function main() {
	let transport;

	switch (env.TRANSPORT) {
		case "stdio":
			transport = new StdioServerTransport();
			await server.connect(transport);
			console.error(
				`Started graphql mcp server ${env.NAME} for endpoint: ${env.ENDPOINT} using stdio transport`,
			);
			break;

		case "streamable-http":
			const app = express();
			app.use(express.json());

			app.post('/mcp', async (req, res) => {
				try {
					const transport = new StreamableHTTPServerTransport({
						sessionIdGenerator: undefined,
						enableJsonResponse: true
					});

					res.on('close', () => {
						transport.close();
					});

					await server.connect(transport);
					await transport.handleRequest(req, res, req.body);
				} catch (error) {
					console.error('Error handling MCP request:', error);
					if (!res.headersSent) {
						res.status(500).json({
							jsonrpc: '2.0',
							error: {
								code: -32603,
								message: 'Internal server error'
							},
							id: null
						});
					}
				}
			});

			app.listen(env.PORT, () => {
				console.error(
					`Started graphql mcp server ${env.NAME} for endpoint: ${env.ENDPOINT} using streamable-http transport on port ${env.PORT}`,
				);
			}).on('error', error => {
				console.error('Server error:', error);
				process.exit(1);
			});
			break;

		case "sse":
			const sseApp = express();
			sseApp.use(express.json());

			// Store transports for SSE sessions
			const sseTransports: { [sessionId: string]: SSEServerTransport } = {};

			sseApp.get('/sse', async (req, res) => {
				const transport = new SSEServerTransport('/messages', res);
				sseTransports[transport.sessionId] = transport;

				res.on('close', () => {
					delete sseTransports[transport.sessionId];
				});

				await server.connect(transport);
			});

			sseApp.post('/messages', async (req, res) => {
				const sessionId = req.query.sessionId as string;
				const transport = sseTransports[sessionId];
				if (transport) {
					await transport.handlePostMessage(req, res, req.body);
				} else {
					res.status(400).send('No transport found for sessionId');
				}
			});

			sseApp.listen(env.PORT, () => {
				console.error(
					`Started graphql mcp server ${env.NAME} for endpoint: ${env.ENDPOINT} using sse transport on port ${env.PORT}`,
				);
			}).on('error', error => {
				console.error('Server error:', error);
				process.exit(1);
			});
			break;

		default:
			throw new Error(`Unsupported transport: ${env.TRANSPORT}`);
	}
}

main().catch((error) => {
	console.error(`Fatal error in main(): ${error}`);
	process.exit(1);
});
