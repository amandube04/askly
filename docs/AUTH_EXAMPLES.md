# Auth and Protected API Examples

This project uses session-token auth for protected endpoints.

## 1) Login as demo and capture session token

```bash
curl -s -X POST "http://localhost:8000/api/authentication/demo-login" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response contains:

- `userId`
- `sessionToken`

## 2) Use bearer token for protected endpoints

```bash
SESSION_TOKEN="<sessionToken_from_login>"

curl -s "http://localhost:8000/api/forms/mine" \
  -H "Authorization: Bearer ${SESSION_TOKEN}"
```

## 3) CSV export endpoint

```bash
FORM_ID="<creator_form_id>"

curl -s "http://localhost:8000/api/responses/export/${FORM_ID}" \
  -H "Authorization: Bearer ${SESSION_TOKEN}"
```

Returns:

- `fileName`
- `csv`
- `rowCount`

## 4) Google OAuth local configuration

Use Google Cloud OAuth Web client with:

- Origin: `http://localhost:3001`
- Redirect URI: `http://localhost:8000/auth/google/callback`

Required env vars:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `APP_BASE_URL`
