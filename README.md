# mcp-graphql

[![smithery badge](https://smithery.ai/badge/mcp-graphql)](https://smithery.ai/server/mcp-graphql)

A Model Context Protocol server that enables LLMs to interact with GraphQL APIs. This implementation provides schema introspection and query execution capabilities, allowing models to discover and use GraphQL APIs dynamically.

<a href="https://glama.ai/mcp/servers/4zwa4l8utf"><img width="380" height="200" src="https://glama.ai/mcp/servers/4zwa4l8utf/badge" alt="mcp-graphql MCP server" /></a>

## Usage

Run `mcp-graphql` with the correct endpoint, it will automatically try to introspect your queries.

### Environment Variables (Breaking change in 1.0.0)

> **Note:** As of version 1.0.0, command line arguments have been replaced with environment variables.

| Environment Variable | Description | Default |
|----------|-------------|---------|
| `ENDPOINT` | GraphQL endpoint URL | `http://localhost:4000/graphql` |
| `HEADERS` | JSON string containing headers for requests | `{}` |
| `ALLOW_MUTATIONS` | Enable mutation operations (disabled by default) | `false` |
| `NAME` | Name of the MCP server | `mcp-graphql` |
| `SCHEMA` | Path to a local GraphQL schema file or URL (optional) | - |
| `TRANSPORT` | Transport protocol: `stdio`, `streamable-http`, or `sse` | `stdio` |
| `PORT` | Port for HTTP transports (streamable-http, sse) | `3000` |

### Examples

```bash
# Basic usage with a local GraphQL server (stdio transport)
ENDPOINT=http://localhost:3000/graphql npx mcp-graphql

# Using with custom headers
ENDPOINT=https://api.example.com/graphql HEADERS='{"Authorization":"Bearer token123"}' npx mcp-graphql

# Enable mutation operations
ENDPOINT=http://localhost:3000/graphql ALLOW_MUTATIONS=true npx mcp-graphql

# Using a local schema file instead of introspection
ENDPOINT=http://localhost:3000/graphql SCHEMA=./schema.graphql npx mcp-graphql

# Using a schema file hosted at a URL
ENDPOINT=http://localhost:3000/graphql SCHEMA=https://example.com/schema.graphql npx mcp-graphql

# Using streamable-http transport
ENDPOINT=http://localhost:3000/graphql TRANSPORT=streamable-http PORT=8080 npx mcp-graphql

# Using SSE transport (deprecated)
ENDPOINT=http://localhost:3000/graphql TRANSPORT=sse PORT=8080 npx mcp-graphql
```

## Resources

- **graphql-schema**: The server exposes the GraphQL schema as a resource that clients can access. This is either the local schema file, a schema file hosted at a URL, or based on an introspection query.

## Available Tools

The server provides two main tools:

1. **introspect-schema**: This tool retrieves the GraphQL schema. Use this first if you don't have access to the schema as a resource.
This uses either the local schema file, a schema file hosted at a URL, or an introspection query.

2. **query-graphql**: Execute GraphQL queries against the endpoint. By default, mutations are disabled unless `ALLOW_MUTATIONS` is set to `true`.

## Installation

### Installing via Smithery

To install GraphQL MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/mcp-graphql):

```bash
npx -y @smithery/cli install mcp-graphql --client claude
```

### Installing Manually

It can be manually installed to Claude:
```json
{
    "mcpServers": {
        "mcp-graphql": {
            "command": "npx",
            "args": ["mcp-graphql"],
            "env": {
                "ENDPOINT": "http://localhost:3000/graphql",
                "TRANSPORT": "stdio"
            }
        }
    }
```

## Transport Options

The server supports multiple transport protocols:

- **stdio** (default): Standard input/output transport for local MCP clients
- **streamable-http**: Modern HTTP transport with session management support
- **sse**: Server-Sent Events transport (deprecated, for backwards compatibility)

### Transport Configuration

- `stdio`: No additional configuration needed
- `streamable-http`: Set `TRANSPORT=streamable-http` and optionally `PORT` (default: 3000)
- `sse`: Set `TRANSPORT=sse` and optionally `PORT` (default: 3000)

For HTTP transports, the server will start an Express.js web server and listen for MCP requests on the specified port.
}
```

For HTTP transports, configure the client to connect to the appropriate endpoint:
```json
{
    "mcpServers": {
        "mcp-graphql": {
            "command": "npx",
            "args": ["mcp-graphql"],
            "env": {
                "ENDPOINT": "http://localhost:3000/graphql",
                "TRANSPORT": "streamable-http",
                "PORT": "8080"
            }
        }
    }
}
```

## Security Considerations

Mutations are disabled by default as a security measure to prevent an LLM from modifying your database or service data. Consider carefully before enabling mutations in production environments.

## Customize for your own server

This is a very generic implementation where it allows for complete introspection and for your users to do whatever (including mutations). If you need a more specific implementation I'd suggest to just create your own MCP and lock down tool calling for clients to only input specific query fields and/or variables. You can use this as a reference.
