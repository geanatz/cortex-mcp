# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 5.0.x   | :white_check_mark: |
| 4.x.x   | :x:                |
| < 4.0   | :x:                |

## Security Features

This MCP server implements the following security measures:

### Path Traversal Protection
- All file paths are validated to prevent directory escape
- `../` sequences and null bytes are blocked
- Working directories must be absolute paths
- Path resolution is validated against base directory

### Input Validation
- All inputs are validated using Zod schemas
- Strict type checking and length limits
- Content size limits to prevent DoS
- Working directory path length limited to 4096 characters

### Size Limits
| Resource | Limit |
|----------|-------|
| Task details | 2,000 characters |
| Subtask details | 1,000 characters |
| Artifact content | 10 MB |
| Error messages | 10,000 characters |
| Tags | 20 tags max |
| Tag length | 50 characters |
| Retries | 100 max |
| Actual hours | 10,000 max |

### Safe Error Handling
- Internal paths are not exposed in error messages
- Stack traces are only logged to stderr, not sent to clients
- Error messages are sanitized before transmission

### Atomic Operations
- File writes use atomic rename pattern (temp file → target)
- Prevents partial writes and data corruption

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do not** open a public issue
2. Email the maintainer directly with details
3. Include steps to reproduce if possible
4. Allow reasonable time for response before disclosure

## Security Best Practices for Users

1. **Always use absolute paths** for workingDirectory
2. **Don't expose the MCP server** to untrusted networks
3. **Review task content** before creating if it contains sensitive data
4. **Regular backups** of the .cortex directory
5. **Set appropriate permissions** on the working directory

## Known Limitations

- No built-in rate limiting (rely on MCP client)
- No authentication/authorization (intended for local use)
- File permissions depend on OS/user configuration
