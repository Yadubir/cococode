# CocoCode - Project Overview

A collaborative online code editor with real-time collaboration, terminal access, and workspace management.

---

## Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js + Express** | REST API server and routing |
| **Socket.io** | Real-time WebSocket communication |
| **Y.js** | CRDT-based real-time collaboration (document sync) |
| **PostgreSQL** | Primary database for users, workspaces, files |
| **Redis** | Caching and session management |
| **node-pty** | Pseudo-terminal for real terminal emulation |
| **JWT** | Authentication tokens |
| **bcryptjs** | Password hashing |
| **Winston** | Logging |
| **Helmet** | Security middleware |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **Vite** | Build tool and dev server |
| **Monaco Editor** | VS Code-like code editor |
| **XTerm.js** | Terminal emulator in browser |
| **Socket.io-client** | Real-time communication |
| **Y.js + y-monaco** | Editor collaboration sync |
| **Zustand** | State management |
| **TanStack Query** | Server state management |
| **React Router** | Client-side routing |
| **TailwindCSS** | Styling |
| **Lucide React** | Icons |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Docker Compose** | Container orchestration |
| **MinIO** | S3-compatible object storage |
| **Turbo** | Monorepo build system |
| **pnpm** | Package manager |

---

## Tradeoffs

### 1. Y.js vs. Operational Transforms (OT)
- **Chose Y.js (CRDT)**: Simpler conflict resolution, works offline, no central server required for merging
- **Tradeoff**: Slightly higher memory usage than OT, larger sync payloads
- **Why**: Better suited for collaborative editing with multiple users; provides awareness for cursors/selections

### 2. node-pty vs. Simple Command Execution
- **Chose node-pty**: Full PTY emulation with shell support, proper signal handling, color support
- **Tradeoff**: Platform-specific compilation required, more complex setup
- **Why**: Provides authentic terminal experience with interactive commands (vim, top, etc.)

### 3. PostgreSQL vs. MongoDB
- **Chose PostgreSQL**: Strong ACID compliance, better for relational workspace/user data
- **Tradeoff**: Less flexible schema, more migrations needed
- **Why**: File and workspace relationships benefit from relational model

### 4. Zustand vs. Redux
- **Chose Zustand**: Minimal boilerplate, simpler API, smaller bundle
- **Tradeoff**: Less ecosystem support, fewer dev tools
- **Why**: Sufficient for app complexity, faster development

### 5. Monaco Editor vs. CodeMirror
- **Chose Monaco**: VS Code-like experience, rich IntelliSense support
- **Tradeoff**: Larger bundle size (~2MB), heavier memory usage
- **Why**: Better developer experience, familiar to VS Code users

---

## Functionalities

### Core Features
- **User Authentication**: Register, login, JWT-based sessions, token refresh
- **Workspace Management**: Create workspaces, invite members via shareable links
- **Real-Time Collaboration**: Multiple users editing same file with cursor sharing
- **File Management**: Create, read, update, delete files within workspaces
- **Terminal Emulator**: Full PTY terminal with shell access per workspace

### Real-Time Features
- **Document Sync**: Y.js CRDT synchronization for conflict-free editing
- **Cursor Presence**: See collaborators' cursors and selections with unique colors
- **Awareness**: User presence indicators showing who's online
- **Chat**: Workspace-level messaging

### Security Features
- **JWT Authentication**: Secure token-based auth with expiry
- **Password Hashing**: bcrypt with configurable rounds
- **CORS Protection**: Configurable origin restrictions
- **Helmet**: Security headers middleware
- **Workspace Permissions**: Owner-only invite management

---

## List of APIs

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Register new user | Public |
| POST | `/login` | User login | Public |
| GET | `/me` | Get current user | Private |
| POST | `/refresh` | Refresh JWT token | Private |
| POST | `/logout` | Logout user | Private |

### Workspaces (`/api/workspaces`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List user's workspaces | Private |
| POST | `/` | Create workspace | Private |
| GET | `/:id` | Get workspace by ID | Private |
| GET | `/:id/members` | Get workspace members | Private |
| POST | `/:id/invites` | Create invite link | Owner |
| GET | `/:id/invites` | List workspace invites | Owner |
| DELETE | `/:id/invites/:inviteId` | Delete invite | Owner |
| GET | `/invites/:code` | Get invite details | Public |
| POST | `/invites/:code/join` | Join via invite | Private |

### Files (`/api/files`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:workspaceId` | Get file tree | Private |
| GET | `/:workspaceId/:fileId` | Get file content | Private |
| POST | `/:workspaceId` | Create file | Private |
| PUT | `/:workspaceId/:fileId` | Update file content | Private |
| DELETE | `/:workspaceId/:fileId` | Delete file | Private |

### Terminal (`/api/terminal`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/create` | Create terminal session | Private |
| POST | `/:sessionId/exec` | Execute command | Private |
| GET | `/sessions` | List active sessions | Private |
| DELETE | `/:sessionId` | Close terminal session | Private |

### WebSocket Events

#### Main Namespace (`/`)
| Event | Direction | Description |
|-------|-----------|-------------|
| `document:join` | Client → Server | Join document room |
| `document:leave` | Client → Server | Leave document room |
| `document:users` | Server → Client | Active users list |
| `cursor:update` | Bidirectional | Cursor position sync |
| `selection:update` | Bidirectional | Selection sync |
| `chat:message` | Bidirectional | Chat messages |
| `workspace:join` | Client → Server | Join workspace room |

#### Collaboration Namespace (`/collaboration`)
| Event | Direction | Description |
|-------|-----------|-------------|
| `doc:join` | Client → Server | Join Y.js document |
| `doc:sync` | Server → Client | Initial document state |
| `doc:update` | Bidirectional | Document changes |
| `doc:leave` | Client → Server | Leave document |
| `awareness:update` | Bidirectional | User awareness state |
| `awareness:remove` | Bidirectional | Remove user awareness |
| `awareness:sync` | Server → Client | All awareness states |

#### Terminal WebSocket
| Event | Direction | Description |
|-------|-----------|-------------|
| `terminal:attach` | Client → Server | Attach to session |
| `terminal:attached` | Server → Client | Attachment confirmed |
| `terminal:input` | Client → Server | User keyboard input |
| `terminal:output` | Server → Client | Terminal output |
| `terminal:resize` | Client → Server | Window resize |
| `terminal:exit` | Server → Client | Session terminated |
| `terminal:error` | Server → Client | Error message |

---

## Problems Faced and Solutions

### 1. Session Persistence on Page Reload
**Problem**: Users were logged out on page refresh.  
**Solution**: Store JWT in localStorage and verify token on app mount via `/api/auth/me` endpoint.

### 2. CORS Configuration
**Problem**: WebSocket and API requests blocked by CORS.  
**Solution**: Configured CORS origin in both Express and Socket.io with credentials support.

### 3. Terminal Echo Issues
**Problem**: Double character echo in terminal - both local and PTY echo.  
**Solution**: Removed local echo in XTerm.js config, let PTY handle all echoing natively.

### 4. Y.js Document Sync Conflicts
**Problem**: State vectors getting out of sync between clients.  
**Solution**: Implemented proper `applyUpdate` with Uint8Array conversion and broadcast updates to all clients except sender.

### 5. User Color Consistency
**Problem**: User colors changing randomly across sessions.  
**Solution**: Generate colors deterministically from user ID using consistent hashing algorithm.

### 6. Terminal Session Cleanup
**Problem**: Orphaned PTY processes consuming resources.  
**Solution**: Implemented cleanup on socket disconnect, session delete, and PTY exit events. Added temp directory cleanup.

### 7. Real-Time Awareness Sync
**Problem**: Collaborators' cursors not appearing for new joiners.  
**Solution**: On `doc:join`, send full awareness state to new client via `awareness:sync` event.

---

## Heavy Implementations

### 1. Real-Time Collaboration with Y.js

The collaboration system is the most complex component, handling:

```javascript
// Document sync flow
1. Client joins document → Server creates/retrieves Y.Doc
2. Server sends encoded state → Client applies update
3. Client edits → Y.js generates update → Send to server
4. Server applies update → Broadcasts to other clients
5. Awareness updates track cursors/selections separately
```

**Key considerations**:
- Memory management for active documents
- State persistence for document recovery
- Awareness cleanup on disconnect

### 2. PTY Terminal Emulation

Full terminal emulation using node-pty:

```javascript
// Terminal session lifecycle
1. HTTP: Create session → Spawn PTY process with shell
2. WebSocket: Attach socket to session
3. PTY.onData → socket.emit('terminal:output')
4. socket.on('terminal:input') → PTY.write()
5. Handle resize, exit, cleanup
```

**Challenges solved**:
- Bi-directional stream handling
- Proper signal propagation (Ctrl+C, Ctrl+D)
- Terminal resize synchronization
- Session isolation with temp directories

### 3. Invite System with Expiry

Secure workspace sharing with:
- Random invite code generation
- Expiry date tracking
- Max usage limits
- Use count tracking
- Duplicate membership detection

### 4. Monaco + Y.js Integration

Binding Monaco Editor to Y.js documents:
- `y-monaco` binding for text sync
- Custom cursor decoration rendering
- Selection highlighting for collaborators
- Debounced awareness updates

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│   Monaco    │   XTerm.js  │   Zustand   │   Socket.io Client   │
│   Editor    │   Terminal  │   Store     │   + Y.js Provider    │
└──────┬──────┴──────┬──────┴──────┬──────┴──────────┬───────────┘
       │             │             │                 │
       │    HTTP     │   WebSocket │    WebSocket    │
       │    REST     │   Terminal  │  Collaboration  │
       ▼             ▼             ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Express + Socket.io)                │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│   REST API  │  node-pty   │   Y.js      │   Socket.io          │
│   Routes    │  Terminal   │   Server    │   Namespaces         │
└──────┬──────┴──────┬──────┴──────┬──────┴──────────────────────┘
       │             │             │
       ▼             ▼             ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ PostgreSQL  │ │    Redis    │ │    MinIO    │
│  Database   │ │    Cache    │ │   Storage   │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## Future Enhancements

- [ ] Language Server Protocol (LSP) integration
- [ ] Git integration (version control)
- [ ] Multiple terminal tabs
- [ ] Code execution sandbox
- [ ] File upload/download
- [ ] Workspace templates
- [ ] User activity analytics
