# AI Discovery Test - Setup Instructions

This test challenges Claude to discover all magic spells through systematic experimentation, validating whether our magic system is discoverable by an intelligent agent.

## Setup

1. **Get an Anthropic API Key**
   - Sign up at https://console.anthropic.com/
   - Create an API key

2. **Configure Environment**
   ```bash
   cd src/tests/magic-simulator/
   cp .env.template .env
   # Edit .env and add your actual API key
   ```

3. **Run the Test**
   ```bash
   npm run test:practical
   ```

## What This Test Does

1. **Gives Claude the Challenge**: Discover all magic spells using only the simulator
2. **Limits Attempts**: Claude gets 50 simulation attempts maximum
3. **Tracks Progress**: Logs every attempt and Claude's reasoning
4. **Generates Report**: Claude provides a final analysis of discoveries
5. **Validates Results**: Checks if Claude found perfect sequences

## Expected Outcomes

- **Spell Discovery**: Can Claude find spell types through experimentation?
- **Pattern Recognition**: Does Claude identify the ATCG sequence patterns?
- **Perfect Sequences**: Can Claude discover 100% power/stability sequences?
- **Systematic Approach**: Does Claude use scientific methodology?

## Example Output

```
🧬 Starting AI Magic Discovery Challenge...
Giving Claude 50 attempts to discover all spells

Turn 1: "ATCGATCGATCG" -> fireball (100% power, 100% stability)
Turn 2: "GCTAGCTAGCTA" -> heal (100% power, 100% stability)
...

🔬 AI Discovery Results:
Total attempts: 23
Spells discovered: 5/5
Perfect sequences found: 5
Max power achieved: 100%

📊 Claude's Final Report:
[Claude's analysis and methodology]
```

## Why This Matters

This test validates that our magic system is:
- **Discoverable**: An intelligent agent can figure it out
- **Logical**: Patterns are learnable through experimentation  
- **Engaging**: The discovery process is interesting
- **Balanced**: Not too easy or impossibly difficult

If Claude can discover the system, human players definitely can!
