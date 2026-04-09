#!/usr/bin/env python3
"""
Bare Claude agent for TALES text adventure benchmark.

Usage:
    python3 tales-agent.py --env TWXCoinCollector --steps 50
    python3 tales-agent.py --env JerichoEnvZork1 --steps 100
    python3 tales-agent.py --env TWCookingLevel1 --steps 50
"""

import argparse
import json
import os
import sys
import time

# Load .env
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k, v)

import anthropic
import tales
import gymnasium as gym


def make_env(env_name: str):
    """Create a TALES environment."""
    return gym.make(f'tales/{env_name}-v0', disable_env_checker=True)


def build_system_prompt(env_name: str) -> str:
    return f"""You are playing a text adventure game ({env_name}).

Each turn you receive a text observation describing what you see, and a list of available actions.
Respond with ONLY the action you want to take — nothing else. No explanation, no quotes, just the action text exactly as it appears in the available actions list."""


def run_game(client: anthropic.Anthropic, model: str, env_name: str, max_steps: int, verbose: bool):
    """Run one game episode. Returns (score, max_score, steps, won)."""
    env = make_env(env_name)
    obs, info = env.reset()

    system = build_system_prompt(env_name)
    messages = []
    score = 0
    max_score = info.get('max_score', 1)

    if verbose:
        print(f'\n{"="*60}')
        print(f'Game: {env_name} | Max score: {max_score}')
        print(f'{"="*60}')
        print(f'  {obs[:200]}')

    for step in range(1, max_steps + 1):
        cmds = info.get('admissible_commands', [])
        cmds_text = '\n'.join(f'  - {c}' for c in cmds) if cmds else '  (no commands listed)'

        # Build user message: observation + available actions
        user_content = f"Observation: {obs}\n\nAvailable actions:\n{cmds_text}\n\nWhat action do you take?"
        messages.append({'role': 'user', 'content': user_content})

        # Call Claude
        response = client.messages.create(
            model=model,
            max_tokens=64,
            system=system,
            messages=messages,
        )

        action = response.content[0].text.strip().strip('"').strip("'")
        messages.append({'role': 'assistant', 'content': action})

        # Take action in environment
        step_result = env.step(action)
        if len(step_result) == 5:
            obs, reward, done, truncated, info = step_result
        else:
            obs, reward, done, info = step_result
            truncated = False
        score = info.get('score', score)

        if verbose:
            print(f'  step {step}: "{action}" → score={score} {"✓ WON" if info.get("won") else ""}')

        if done or truncated:
            break

        # Keep conversation manageable — sliding window of last 20 turns
        if len(messages) > 40:
            messages = messages[-20:]

    env.close()
    won = info.get('won', False)

    print(f'  Result: score={score}/{max_score} steps={step} {"WON" if won else "lost"}')
    return score, max_score, step, won


def main():
    parser = argparse.ArgumentParser(description='TALES bare Claude agent')
    parser.add_argument('--env', default='TWXCoinCollector', help='TALES environment name')
    parser.add_argument('--model', default='claude-haiku-4-5-20251001', help='Anthropic model')
    parser.add_argument('--steps', type=int, default=50, help='Max steps per game')
    parser.add_argument('--episodes', type=int, default=1, help='Number of episodes')
    parser.add_argument('--verbose', action='store_true', default=True)
    args = parser.parse_args()

    client = anthropic.Anthropic()

    results = []
    for ep in range(args.episodes):
        score, max_score, steps, won = run_game(
            client, args.model, args.env, args.steps, args.verbose
        )
        results.append({'score': score, 'max_score': max_score, 'steps': steps, 'won': won})

    # Summary
    if len(results) > 1:
        wins = sum(1 for r in results if r['won'])
        avg_score = sum(r['score'] for r in results) / len(results)
        print(f'\nSummary: {wins}/{len(results)} won | avg score: {avg_score:.1f}')


if __name__ == '__main__':
    main()
