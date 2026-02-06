# CocoCode Setup Guide

Follow these steps to set up and run the CocoCode project locally.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v8+)
- [Docker](https://www.docker.com/) & Docker Compose

## 1. Install Dependencies

Open your terminal in the project root and run:

```bash
pnpm install
```

## 2. Environment Configuration

### Backend

Copy the example environment file for the server:

```bash
cp apps/server/.env.example apps/server/.env
```

Open `apps/server/.env` and ensure the database and Redis URLs are set to localhost (for local development outside Docker):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cococode
REDIS_URL=redis://localhost:6379
```

> **Note:** If you run the server inside Docker, these should be `postgres` and `redis` hostnames respectively. But for `pnpm dev`, use `localhost`.

### Frontend

The frontend configuration is handled by Vite and usually defaults to localhost. Create `.env` if needed, but defaults should work.

## 3. Start Infrastructure (Database & Cache)

Start PostgreSQL, Redis, and MinIO using Docker Compose. We only need the infrastructure services, not the app services (since we'll run apps with pnpm).

```bash
docker-compose up -d postgres redis minio
```

Wait a few seconds for the database to be ready.

## 4. Run the Application

Start both the backend and frontend in development mode:

```bash
pnpm dev
```

This command uses Turbo repo to run both apps simultaneously.

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **MinIO Console**: http://localhost:9001 (User/Pass: `minioadmin` / `minioadmin`)

## Troubleshooting

### Database Connection Error (ECONNREFUSED)

If you see `ECONNREFUSED` errors connecting to `127.0.0.1:5432`, it means the Postgres container is not running or not accessible.

1. Check if containers are running:
   ```bash
   docker ps
   ```
2. If not, start them:
   ```bash
   docker-compose up -d postgres redis
   ```

### Terminal "posix_spawnp" Error

If you are on macOS and see terminal errors:
- Ensure you have `zsh` installed (default on modern macOS).
- The project has a fallback mechanism if `node-pty` fails, but a rebuild might help:
  ```bash
  cd apps/server && pnpm rebuild node-pty
  ```
