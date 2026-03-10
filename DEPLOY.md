# Deployment Guide

This project is configured for deployment on a VPS (e.g., Hetzner).

## Critical Configuration

The Frontend Connects directly to the API from the User's Browser. Therefore, the `NEXT_PUBLIC_API_URL` **MUST** be the Public IP of your server, not `localhost`.

### Current Configuration (docker-compose.yml)
```yaml
environment:
  NEXT_PUBLIC_API_URL: http://5.161.85.105:4000
```

## Changing Servers
If you move to a new server:
1.  Open `docker-compose.yml`.
2.  Update the IP address in `NEXT_PUBLIC_API_URL`.
3.  Run `docker-compose up -d --build`.

## Troubleshooting
-   **Blocked Connection**: If the frontend says "Network Error", check if traffic on port `4000` is allowed in your VPS Firewall (UFW/Security Groups).
-   **CORS Error**: The API is configured to allow `origin: '*'`. If you see CORS errors, ensure you are accessing the frontend via the correct domain/IP.
