# Baileys WhatsApp Time Sum Bot

This is a simple WhatsApp bot built with [Baileys](https://github.com/WhiskeySockets/Baileys).
It listens to incoming messages and, when you send something like:

```
4.50+3.50+1.50
```

it treats the values as hours and minutes (4.50 = 4 hours 50 minutes), adds them,
and replies with the total in `X hours Y minutes (HH:MM)` format.

> Warning: Baileys automates a normal WhatsApp account using the Web protocol.
> This is not an official WhatsApp Business API integration. Use only for
> personal / low-scale use and never for spam or bulk messaging. Your number
> can be banned if you violate WhatsApp policies.

## Project structure

- `index.js`       - bot code (Baileys client + time parsing logic)
- `package.json`   - Node dependencies and start script
- `Dockerfile`     - Docker image definition
- `.dockerignore`  - ignored files for Docker build

Sessions (auth state) are stored in `SESSION_DIR` (default `/data/auth` inside container).

---

## Running locally (without Docker)

```bash
npm install
node index.js
```

On first run, Baileys will create `qr.png` inside the session directory:

- Default session directory in plain `node index.js` run is `/data/auth` (which probably doesn't exist).
- For local development, set a local folder via env var:

```bash
mkdir -p ./data/auth
export SESSION_DIR=$(pwd)/data/auth
node index.js
```

Then open `./data/auth/qr.png` and scan it with WhatsApp on your phone.

Once scanned, the auth files are persisted in `./data/auth` and the bot will reconnect automatically.

---

## Using Docker locally

Build and run:

```bash
docker build -t baileys-time-sum-bot .
mkdir -p ./data/auth
docker run --rm -it \
  -v "$(pwd)/data:/data" \
  -e SESSION_DIR=/data/auth \
  baileys-time-sum-bot
```

After the container starts, a `qr.png` file will appear in `./data/auth/qr.png`. Open it and
scan with WhatsApp to log in.

---

## Deploying on Railway

1. Push this repo to GitHub.
2. On Railway, create a new project from the GitHub repo.
3. Railway will detect the Dockerfile and build automatically.
4. Add a **Persistent Volume** and mount it at `/data`.
5. Set environment variables (optional but recommended):

   - `SESSION_DIR` = `/data/auth`
   - `LOG_LEVEL` = `info`

5. Deploy.
6. After first deploy, open the project’s file system for the mounted volume and
   download `qr.png` (inside `/data/auth/qr.png`), then scan it with WhatsApp.

---

## Deploying on Render

1. Push this repo to GitHub.
2. On Render, create a **Web Service** from this repo and tell it to use Docker.
3. Add a **Persistent Disk** mounted at `/data`.
4. Set environment variables:

   - `SESSION_DIR` = `/data/auth`
   - `LOG_LEVEL` = `info`

5. Deploy.
6. After deploy, use Render’s disk/file browser (or SSH/console) to download
   `/data/auth/qr.png` and scan it with WhatsApp.

---

## Using the bot

After login:

- Send a message to your WhatsApp (or from another number to this bot's number) like:

  ```
  4.50+3.50+1.50
  ```

- The bot replies with:

  ```
  Total: 9 hours 50 minutes (09:50)
  ```

Supported input formats per token:

- `4.50` → 4 hours 50 minutes  
- `4.5`  → 4 hours 50 minutes (single digit after dot = minutes * 10)  
- `4:50` → 4 hours 50 minutes  
- `4h50` → 4 hours 50 minutes  
- `4`    → 4 hours 0 minutes  

Tokens can be separated by `+`, spaces, or commas.

---

## Notes

- Never use this for bulk messaging or spam.
- If WhatsApp logs you out, you may need to delete the contents of your `SESSION_DIR`
  and restart so Baileys creates a new QR code for login.
- Keep your session directory private and safe.
