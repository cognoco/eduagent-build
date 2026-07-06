## REST

- `NOTION_TOKEN` present: `true`
- POST success: `false`
- HTTP/status: unavailable
- Error type: `HttpRequestException`
- Result count: not available

## CLI

- `notion` command exists: `true`
- Source: `C:\Users\ZuzanaKopečná\AppData\Roaming\npm\notion.ps1`
- CLI query success: `false`
- Exit code: `1`
- Parsed `results`: unavailable because command failed

## Conclusion

Connectivity is not healthy from this workspace: the REST probe fails before exposing an HTTP status, and the Notion CLI is installed but its query probe fails. No files were modified and no secret values were printed.