#!/usr/bin/env python3
"""
Hello-world agent for AgentBench FC.

Connects to the AgentRL controller, runs a single OS interaction task,
and prints the result. Uses Claude via the Anthropic API.

Usage:
    python3 hello-agent.py [--index N] [--model MODEL] [--count N]
"""

import argparse
import json
import os
import sys
import time

import anthropic
import requests

CONTROLLER = "http://localhost:5020/api"
TASK = "os-std"
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
MAX_ROUNDS = 8


def start_sample(index: int) -> tuple[str, dict]:
    """Start a task sample, return (session_id, initial_data)."""
    resp = requests.post(
        f"{CONTROLLER}/start_sample",
        json={"name": TASK, "index": index},
    )
    resp.raise_for_status()
    session_id = resp.headers["Session_id"]
    return session_id, resp.json()


def interact(session_id: str, messages: list[dict]) -> dict:
    """Send agent response to controller, get task feedback."""
    resp = requests.post(
        f"{CONTROLLER}/interact",
        headers={"Session_id": session_id},
        json={"messages": messages},
    )
    resp.raise_for_status()
    return resp.json()


def convert_tools_for_anthropic(fc_tools: list[dict]) -> list[dict]:
    """Convert OpenAI-style tool definitions to Anthropic format."""
    anthropic_tools = []
    for tool in fc_tools:
        fn = tool["function"]
        anthropic_tools.append({
            "name": fn["name"],
            "description": fn["description"],
            "input_schema": fn["parameters"],
        })
    return anthropic_tools


def convert_messages_for_anthropic(fc_messages: list[dict]) -> tuple[str, list[dict]]:
    """
    Convert FC messages to Anthropic format.
    Returns (system_prompt, messages).
    FC messages use OpenAI roles: system, user, assistant, tool.
    """
    system = ""
    messages = []

    for msg in fc_messages:
        role = msg["role"]
        if role == "system":
            system = msg["content"]
        elif role == "user":
            messages.append({"role": "user", "content": msg["content"]})
        elif role == "assistant":
            # Reconstruct assistant message with tool_use blocks
            content = []
            if msg.get("content"):
                content.append({"type": "text", "text": msg["content"]})
            for tc in msg.get("tool_calls", []):
                content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "input": json.loads(tc["function"]["arguments"])
                        if isinstance(tc["function"]["arguments"], str)
                        else tc["function"]["arguments"],
                })
            messages.append({"role": "assistant", "content": content})
        elif role == "tool":
            messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": msg["tool_call_id"],
                    "content": msg["content"],
                }],
            })

    return system, messages


def call_claude(client: anthropic.Anthropic, model: str, system: str,
                messages: list[dict], tools: list[dict]) -> object:
    """Call Claude via the Anthropic API."""
    return client.messages.create(
        model=model,
        max_tokens=1024,
        system=system,
        messages=messages,
        tools=tools,
    )


def convert_response_for_controller(response) -> list[dict]:
    """Convert Anthropic SDK response to FC interact format."""
    content_text = ""
    tool_calls = []

    for block in response.content:
        if block.type == "text":
            content_text = block.text
        elif block.type == "tool_use":
            tool_calls.append({
                "id": block.id,
                "type": "function",
                "function": {
                    "name": block.name,
                    "arguments": json.dumps(block.input),
                },
            })

    msg = {"role": "assistant"}
    if content_text:
        msg["content"] = content_text
    if tool_calls:
        msg["tool_calls"] = tool_calls

    return [msg]


def run_sample(client: anthropic.Anthropic, model: str, index: int) -> dict:
    """Run a single task sample end to end. Returns the final controller response."""
    print(f"\n{'='*60}")
    print(f"Starting sample index={index}")

    session_id, initial = start_sample(index)
    print(f"  Session: {session_id}")

    tools_fc = initial["tools"]
    tools_anthropic = convert_tools_for_anthropic(tools_fc)

    # Conversation history in FC format (what the controller has seen)
    all_fc_messages = list(initial["messages"])

    # Show the task
    for msg in initial["messages"]:
        if msg["role"] == "user":
            print(f"  Task: {msg['content'][:200]}")

    for round_num in range(MAX_ROUNDS):
        # Convert full history for Anthropic
        system, anthropic_messages = convert_messages_for_anthropic(all_fc_messages)

        # Call Claude
        response = call_claude(client, model, system, anthropic_messages, tools_anthropic)

        # Convert response for controller
        agent_messages = convert_response_for_controller(response)

        # Show what the agent did
        for msg in agent_messages:
            for tc in msg.get("tool_calls", []):
                fn = tc["function"]
                args = json.loads(fn["arguments"]) if isinstance(fn["arguments"], str) else fn["arguments"]
                print(f"  Round {round_num+1}: {fn['name']}({json.dumps(args)[:100]})")

        # Send to controller
        result = interact(session_id, agent_messages)

        # Add agent messages + controller response to history
        all_fc_messages.extend(agent_messages)
        all_fc_messages.extend(result.get("messages", []))

        # Show tool output
        for msg in result.get("messages", []):
            if msg["role"] == "tool":
                preview = msg["content"][:150].replace("\n", " ")
                print(f"    -> {preview}")

        if result.get("finish") or result.get("status") != "running":
            print(f"  Status: {result.get('status')} | Reward: {result.get('reward')}")
            print(f"  Score: {result.get('metrics', {}).get('score', '?')}")
            return result

    print("  Hit round limit")
    return result


def main():
    parser = argparse.ArgumentParser(description="Hello-world AgentBench agent")
    parser.add_argument("--index", type=int, default=10, help="Task index (0-143)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Anthropic model")
    parser.add_argument("--count", type=int, default=1, help="Number of samples to run")
    args = parser.parse_args()

    # Load .env if present
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k, v)

    client = anthropic.Anthropic()

    results = []
    for i in range(args.count):
        idx = args.index + i
        try:
            result = run_sample(client, args.model, idx)
            results.append(result)
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({"status": "error", "error": str(e)})

    # Summary
    print(f"\n{'='*60}")
    print(f"Results: {len(results)} samples")
    scores = [r.get("metrics", {}).get("score", 0) for r in results if "metrics" in r]
    if scores:
        print(f"  Scores: {scores}")
        print(f"  Pass rate: {sum(1 for s in scores if s > 0)}/{len(scores)}")


if __name__ == "__main__":
    main()
