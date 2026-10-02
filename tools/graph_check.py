#!/usr/bin/env python3
"""
Graph API pre-check script.
Verifies whether a refresh_token can obtain a Graph access_token.

Usage:
  python tools/graph_check.py <client_id> <refresh_token>

Result:
  - HTTP 200 + access_token present -> Graph supported, migration is feasible.
  - HTTP 400 + invalid_grant / scope error -> IMAP-only token, Graph not available.
"""

import requests
import sys


def main():
    if len(sys.argv) < 3:
        print("Usage: python graph_check.py <client_id> <refresh_token>")
        sys.exit(1)

    client_id = sys.argv[1]
    refresh_token = sys.argv[2]

    print("Requesting Graph access token...")
    res = requests.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        data={
            "client_id": client_id,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=30,
    )

    print(f"HTTP {res.status_code}")
    data = res.json()

    if res.status_code == 200 and "access_token" in data:
        print("SUCCESS: Graph API is available for this account.")
        print(f"Token type: {data.get('token_type')}")
        print(f"Expires in: {data.get('expires_in')}s")
    else:
        print("FAILED: Cannot obtain Graph token.")
        print(f"Error: {data.get('error')}")
        print(f"Description: {data.get('error_description')}")
        print("\nThis account may only have IMAP authorization.")
        print("You need to re-authorize the account with Graph (Mail.Read) permissions.")


if __name__ == "__main__":
    main()
