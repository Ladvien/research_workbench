## Using Claude Max Subscription for Programmatic Access via Claude Code

### Setup (one-time)
1. **Install Claude Code CLI**
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Authenticate with your Max subscription**
   ```bash
   claude setup-token
   ```
   This will open a browser to authenticate with your Claude Max/Pro account.

### Python Wrapper for Your Project

```python
import subprocess
import json

def query_claude(prompt, output_format="json"):
    """
    Query Claude using the CLI with your Max subscription.
    
    Args:
        prompt: The prompt to send to Claude
        output_format: "text", "json", or "stream-json"
    
    Returns:
        Parsed JSON response (if format is json) or text string
    """
    cmd = [
        'claude',
        '--print',  # Non-interactive mode
        '--output-format', output_format,
        prompt
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    
    if output_format == "json":
        return json.loads(result.stdout)
    return result.stdout

# Usage examples:
response = query_claude("Write a binary search function in Python")
print(response['content'])

# For plain text output:
text = query_claude("Explain quantum computing", output_format="text")
```

### Key CLI Flags for Programmatic Use
- `--print`: Non-interactive mode (essential for scripts)
- `--output-format json`: Structured output for parsing
- `--model opus`: Specify model (opus, sonnet, etc.)
- `--continue`: Continue last conversation
- `--session-id <uuid>`: Maintain conversation context

### Limitations
- Subject to your Max subscription rate limits
- Runs through CLI overhead (slower than direct API)
- No async/parallel requests like with native API

This approach gives you programmatic access without needing separate API billing.