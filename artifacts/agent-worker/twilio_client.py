import os
from twilio.rest import Client

def _client() -> Client:
    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    api_key = os.environ["TWILIO_API_KEY"]
    api_key_secret = os.environ["TWILIO_API_KEY_SECRET"]
    return Client(api_key, api_key_secret, account_sid)

def get_account_info() -> dict:
    """Return basic account info — used to verify credentials work."""
    c = _client()
    account = c.api.accounts(os.environ["TWILIO_ACCOUNT_SID"]).fetch()
    return {"sid": account.sid, "friendly_name": account.friendly_name, "status": account.status}

def send_sms(to: str, body: str, from_: str | None = None) -> dict:
    """
    Send an SMS. from_ defaults to TWILIO_PHONE_NUMBER secret.
    Returns the Twilio message SID and status.
    """
    c = _client()
    from_number = from_ or os.environ["TWILIO_PHONE_NUMBER"]
    msg = c.messages.create(to=to, from_=from_number, body=body)
    return {"sid": msg.sid, "status": msg.status, "to": msg.to, "from": msg.from_}
