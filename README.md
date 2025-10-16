# School of Computing  
## CSC1049 Year 3 Project Proposal Form  

---

**Project Title:**  
**CollabCode - Real-time Collaborative Code Editor**  

**Student 1:**  
- Name and ID number: *Hoang Xuan Hai Mai* - *22115838*  

**Student 2:**  
- Name and ID number: **  - **  

**Staff Member Consulted:**  
- 

---

## Project Description  

CollabCode aims to revolutionize how developers collaborate by creating a "Google Docs for developers" experience. The platform provides real-time collaborative coding with full language intelligence support and multi-user editing capabilities using Operational Transformation (OT) and Conflict-Free Replicated Data Types (CRDT) synchronization.

Developers often face challenges when collaborating on code - from merge conflicts in version control to the inefficiency of screen sharing during pair programming sessions. CollabCode eliminates these pain points by providing a seamless, real-time editing environment where multiple developers can work on the same codebase simultaneously, with each user's cursors, selections, and changes visible to all participants in real-time.

The core experience includes intelligent code assistance through Language Server Protocol (LSP) integration, providing autocomplete, error-checking, and code navigation. Built-in debugging capabilities via Debug Adapter Protocol (DAP) allow teams to debug together. For remote collaboration, optional real-time media features like voice chat and screen sharing create a comprehensive collaborative environment.

The platform is designed with performance as a priority, targeting ≤8ms local echo and ≤200ms remote reflection to ensure a responsive editing experience even with multiple collaborators. Offline support with automatic synchronization upon reconnection ensures productivity isn't limited by network connectivity.

---

## Division of Work  

- Backend and frontend tasks will be divided based on project needs, individual strengths, and workload at the time. Both team members will contribute to each area to maintain shared knowledge and flexibility.  
- Collaboration will be emphasized to ensure consistency and smooth integration across the system.  
- As for tasks that do not require development, work will be shared evenly.  

---

## Programming Languages  

- Rust (primary for native client)
- Python
- TypeScript/JavaScript
- SQL

---

## Programming Tools  

- React/Next.js (web client)
- Django REST Framework (backend)
- wgpu, winit, tokio (Rust graphics/async)
- Yjs/CRDT libraries for collaborative editing
- LSP & DAP clients
- PostgreSQL + Redis
- Tree-sitter (parsing)
- Quinn (QUIC networking)

---

## Learning Challenges  

- Implementing CRDT/OT algorithms for conflict-free collaborative editing
- Integrating Language Server Protocol (LSP) for multiple programming languages
- Building GPU-accelerated UI with wgpu for low-latency rendering
- Developing efficient rope-based text engine for large files
- Implementing real-time synchronization with offline support
- Creating multi-user presence with cursor stability

---

## Hardware/Software Platform  

- Mac, Windows, Linux
- VS Code
- Rust toolchain
- Python/Django environment
- Node.js for web components
- Docker for containerization

---

## Special Hardware/Software Requirements  

- Modern GPU recommended for optimal rendering performance
- Sufficient RAM for handling large codebases and multiple language servers
- Stable internet connection for real-time collaboration features

---

## Technical Architecture

### Client Application (Rust-based)
- GPU-accelerated UI using wgpu for low-latency rendering
- Rope-based text engine for efficient text operations
- CRDT core for conflict-free collaborative editing
- LSP & DAP clients for language intelligence and debugging
- Remote development support via SSH

### Server Infrastructure
- Stateless WebSocket edges for connection handling
- Document workers maintaining CRDT documents in memory
- Redis for pub/sub messaging
- Append-only operation logs with periodic snapshots

### Development Phases
- **MVP**: Soft locks, version checks, presence, real-time updates, comments, basic audit
- **Phase 2**: Notifications, email digests, richer audit diffs
- **Phase 3** (optional): CRDT co-editing for rich text fields

### Testing Strategy
- Convergence tests with multi-client fuzzing
- Cursor position invariants
- Performance benchmarks (120 WPM typing, 1MB files)
- LSP/DAP correctness validation
- Network latency simulation (50-150ms RTT)

### Key Technical Challenges & Solutions
- **Cursor stability**: CRDT relative positions prevent jitter
- **Unicode handling**: UTF-16 for LSP/DAP, UTF-8 for storage
- **Performance**: Target ≤8ms local echo, ≤200ms remote reflection
- **Offline support**: Operation queuing with CRDT reconciliation