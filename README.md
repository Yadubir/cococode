# CocoCode - Collaborative AI-Powered Code Editor

CocoCode is a modern, real-time collaborative development environment designed for seamless pair programming and efficient software development. It combines the power of VS Code-like editing with real-time sync, integrated terminal access, and advanced AI assistance.

## 🚀 Key Features

- **Real-Time Collaboration**: Multi-user editing with shared cursors and selection highlighting powered by **Y.js** (CRDT) and **Socket.io**.
- **AI-Powered Code Assistant**: Integrated with **Gemini 2.0** for intelligent chat, code explanation, suggestions, and ghost-text autocomplete.
- **Integrated Terminal**: Full-featured PTY terminal access using **node-pty** and **XTerm.js**, synchronized across all workspace collaborators.
- **Git Integration**: Built-in Git GUI for managing version control, including staging, committing, pushing, and pulling from remote repositories.
- **Live Communication**: Peer-to-peer audio/video calls via **WebRTC** and persistent workspace chat.
- **Workspace Management**: Secure, JWT-authenticated projects with invite-based member management.

## 🛠 Tech Stack

### Frontend
- **Framework**: React 18 + Vite
- **Editor**: Monaco Editor (VS Code core)
- **Terminal**: XTerm.js
- **State Management**: Zustand
- **Real-time**: Socket.io-client + Y.js
- **Styling**: TailwindCSS

### Backend
- **Server**: Node.js + Express
- **Real-time**: Socket.io
- **PTY**: node-pty
- **Database**: PostgreSQL (Prisma-ready)
- **Caching**: Redis
- **AI**: Google Generative AI (Gemini 2.0)
- **Git**: Simple-Git

## 📂 Project Structure

This project is a monorepo managed with **PNPM** and **Turbo**.

```text
cococode/
├── apps/
│   ├── web/                # React + Vite Frontend
│   │   ├── src/
│   │   │   ├── components/  # Shared UI components (Layout, Sidebar, etc.)
│   │   │   ├── features/    # Feature-modules (Editor, Terminal, AI, Git, Comms)
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── services/    # API (Axios) and WebSocket clients
│   │   │   └── stores/      # Zustand state management
│   └── server/             # Node.js + Express Backend
│       ├── src/
│       │   ├── middleware/  # Auth, logic, and error handling
│       │   ├── routes/      # Express API routes (AI, Files, Git, Terminal)
│       │   ├── services/    # Business logic (Database, Git, PTY, etc.)
│       │   ├── utils/       # Logging and shared helpers
│       │   ├── websocket.js # Real-time communication logic
│       │   └── collaboration.js # Y.js CRDT synchronization
├── docker-compose.yml       # Production orchestration
└── turbo.json              # Monorepo build configuration
```

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- PNPM >= 8
- Docker & Docker Compose (for infrastructure)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/cococode.git
   cd cococode
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Environment Setup**:
   Create a `.env` file in `apps/server` based on `.env.example`.
   ```bash
   cp .env.example apps/server/.env
   ```

4. **Start Development Infrastructure**:
   ```bash
   docker compose up -d postgres redis
   ```

5. **Run Development Servers**:
   ```bash
   pnpm dev
   ```
   The frontend will be available at `http://localhost:5173`.

## 🐳 Docker Deployment

For a full production-like environment:
```bash
docker compose up
```

## 📄 License
MIT
