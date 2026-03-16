# ─── Stage 1: Build native deps (node-pty needs python3 + make + g++) ────────
FROM node:20-slim AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm — pin to exact same version as local (8.15.0) to avoid lockfile format mismatch
RUN npm install -g pnpm@8.15.0

# Copy server package files + the root lockfile (pnpm uses a single lockfile)
COPY apps/server/package.json ./package.json
COPY pnpm-lock.yaml ./pnpm-lock.yaml

# Install production deps using the lockfile
RUN pnpm install --frozen-lockfile --prod

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Runtime tools available inside every terminal sandbox
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    git \
    curl \
    python3 \
    python3-pip \
    gcc \
    g++ \
    make \
    && ln -sf python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy only the server source
COPY apps/server/src ./src
COPY apps/server/package.json ./package.json

# Create a non-root user for security
RUN groupadd -r cococode && useradd -r -g cococode cococode \
    && mkdir -p /tmp/cococode \
    && chown -R cococode:cococode /tmp/cococode /app

USER cococode

EXPOSE 3001

CMD ["node", "src/index.js"]
