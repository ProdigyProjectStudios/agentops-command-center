import os
import subprocess
import httpx

_CONNECTORS_BASE = "https://" + os.environ.get(
    "REPLIT_CONNECTORS_HOSTNAME", "connectors.replit.com"
)
_PROXY_BASE = f"{_CONNECTORS_BASE}/api/v2/proxy"


def _get_identity_token() -> str:
    try:
        result = subprocess.run(
            ["replit", "identity", "create", "--audience", _CONNECTORS_BASE],
            capture_output=True, text=True, timeout=5
        )
        token = result.stdout.strip()
        if token:
            return token
    except Exception:
        pass
    repl_identity = os.environ.get("REPL_IDENTITY", "")
    if repl_identity:
        return f"repl {repl_identity}"
    web_repl = os.environ.get("WEB_REPL_RENEWAL", "")
    if web_repl:
        return f"depl {web_repl}"
    raise RuntimeError("Replit identity token not available")


def _auth_headers() -> dict:
    token = _get_identity_token()
    if token.startswith("repl ") or token.startswith("depl "):
        return {"Accept": "application/json", "X-Replit-Token": token}
    return {"Accept": "application/json", "Replit-Authentication": f"Bearer {token}"}


def send_sms(to: str, from_: str, body: str) -> dict:
    """
    Send an SMS via the Replit Twilio connector proxy.
    Uses Twilio REST API: POST /2010-04-01/Accounts/{AccountSid}/Messages.json
    The proxy injects credentials automatically — no Account SID or Auth Token needed.
    """
    headers = _auth_headers()
    headers["Connector-Name"] = "twilio"
    headers["Content-Type"] = "application/x-www-form-urlencoded"

    resp = httpx.post(
        f"{_PROXY_BASE}/2010-04-01/Accounts/Messages.json",
        headers=headers,
        data={"To": to, "From": from_, "Body": body},
        timeout=15,
    )
    if resp.status_code == 401:
        headers.update(_auth_headers())
        resp = httpx.post(
            f"{_PROXY_BASE}/2010-04-01/Accounts/Messages.json",
            headers=headers,
            data={"To": to, "From": from_, "Body": body},
            timeout=15,
        )
    resp.raise_for_status()
    return resp.json()


def get_account_info() -> dict:
    """Fetch Twilio account info — useful for verifying the connection works."""
    headers = _auth_headers()
    headers["Connector-Name"] = "twilio"

    resp = httpx.get(
        f"{_PROXY_BASE}/2010-04-01/Accounts.json",
        headers=headers,
        timeout=15,
    )
    if resp.status_code == 401:
        headers.update(_auth_headers())
        resp = httpx.get(
            f"{_PROXY_BASE}/2010-04-01/Accounts.json",
            headers=headers,
            timeout=15,
        )
    resp.raise_for_status()
    return resp.json()
