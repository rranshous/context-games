#!/usr/bin/env python3
"""
HTTP bridge for TALES text adventure environments.

Wraps the TALES gymnasium interface in a simple REST API:
  POST /reset   — start/restart a game
  POST /step    — take an action
  GET  /envs    — list available environments
  GET  /status  — check if a game is active

Usage:
    python3 tales-bridge.py [--port 5050]
"""

import argparse
import json
import sys
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure python symlink is on PATH for textworld builds
import os
os.environ.setdefault('PATH', '/home/robby/.local/bin:' + os.environ.get('PATH', ''))

import tales
import gymnasium as gym


class GameState:
    """Holds the current game environment and state."""
    def __init__(self):
        self.env = None
        self.env_name = None
        self.obs = None
        self.info = None
        self.done = False
        self.total_reward = 0
        self.steps = 0

    def reset(self, env_name: str):
        if self.env is not None:
            try:
                self.env.close()
            except:
                pass

        self.env_name = env_name
        self.env = gym.make(f'tales/{env_name}-v0', disable_env_checker=True)
        self.obs, self.info = self.env.reset()
        self.done = False
        self.total_reward = 0
        self.steps = 0

    def step(self, action: str):
        if self.env is None:
            raise RuntimeError('No game active. Call /reset first.')
        if self.done:
            raise RuntimeError('Game is done. Call /reset to start a new game.')

        result = self.env.step(action)
        if len(result) == 5:
            self.obs, reward, self.done, truncated, self.info = result
            self.done = self.done or truncated
        else:
            self.obs, reward, self.done, self.info = result

        self.total_reward += reward
        self.steps += 1

    def to_dict(self):
        if self.env is None:
            return {'active': False}

        return {
            'active': True,
            'env_name': self.env_name,
            'observation': self.obs,
            'done': self.done,
            'steps': self.steps,
            'score': self.info.get('score', 0),
            'max_score': self.info.get('max_score', 0),
            'won': self.info.get('won', False),
            'lost': self.info.get('lost', False),
            'admissible_commands': self.info.get('admissible_commands', None),
        }

    def close(self):
        if self.env is not None:
            try:
                self.env.close()
            except:
                pass
            self.env = None


# Single global game state (one game at a time)
game = GameState()


class BridgeHandler(BaseHTTPRequestHandler):

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        if self.path == '/envs':
            self._send_json({'environments': tales.envs})
        elif self.path == '/status':
            self._send_json(game.to_dict())
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        try:
            body = self._read_json()

            if self.path == '/reset':
                env_name = body.get('env_name')
                if not env_name:
                    self._send_json({'error': 'env_name required'}, 400)
                    return
                if env_name not in tales.envs:
                    self._send_json({'error': f'Unknown environment: {env_name}'}, 400)
                    return

                game.reset(env_name)
                self._send_json(game.to_dict())

            elif self.path == '/step':
                action = body.get('action')
                if action is None:
                    self._send_json({'error': 'action required'}, 400)
                    return

                game.step(action)
                self._send_json(game.to_dict())

            else:
                self._send_json({'error': 'Not found'}, 404)

        except Exception as e:
            traceback.print_exc()
            self._send_json({'error': str(e)}, 500)

    def log_message(self, format, *args):
        # Quiet down request logging
        pass


def main():
    parser = argparse.ArgumentParser(description='TALES HTTP bridge')
    parser.add_argument('--port', type=int, default=5050)
    args = parser.parse_args()

    server = HTTPServer(('localhost', args.port), BridgeHandler)
    print(f'TALES bridge running on http://localhost:{args.port}')
    print(f'  {len(tales.envs)} environments available')
    print(f'  Endpoints: GET /envs, GET /status, POST /reset, POST /step')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
        game.close()
        server.server_close()


if __name__ == '__main__':
    main()
