# Real-Time Collaborative Code Editor - Project Summary

## Project Overview
A real-time collaborative code editor described as "Google Docs for developers" with full language intelligence support and multi-user editing capabilities using OT/CRDT synchronization.

## Core Features
- **Real-time collaboration** with conflict resolution
- **Language Server Protocol (LSP)** integration for autocomplete, error-checking
- **Multi-user presence** showing cursors, selections
- **Offline support** with sync on reconnect
- **Built-in debugging** via Debug Adapter Protocol (DAP)
- **Optional real-time media** (voice chat, screen sharing)

## Architecture Components

### Client Application (Rust-based)
- **GPU-accelerated UI** using wgpu for low-latency rendering
- **Rope-based text engine** for efficient text operations
- **CRDT core** for conflict-free collaborative editing
- **LSP & DAP clients** for language intelligence and debugging
- **Remote development** support via SSH

### Server Infrastructure
- **Stateless WebSocket edges** for connection handling
- **Document workers** maintaining CRDT documents in memory
- **Redis** for pub/sub messaging
- **Append-only operation logs** with periodic snapshots

## Technical Stack

### Frontend
- React with React Query
- WebSocket client
- Yjs for co-editing
- Toast and badge UI components

### Backend
- Django REST Framework
- JWT authentication
- Django Channels + WebSockets
- PostgreSQL + Redis
- Celery for background jobs

### Native Client (Primary Focus)
- **Rust** with wgpu, winit, tokio
- **Text**: ropey/xi-rope, tree-sitter, swash
- **CRDT**: yrs or diamond-types
- **Networking**: quinn (QUIC), jsonrpc-lite

## Development Phases
1. **MVP**: Soft locks, version checks, presence, real-time updates, comments, basic audit
2. **Phase 2**: Notifications, email digests, richer audit diffs
3. **Phase 3** (optional): CRDT co-editing for rich text fields

## Key Technical Challenges & Solutions
- **Cursor stability**: CRDT relative positions prevent jitter
- **Unicode handling**: UTF-16 for LSP/DAP, UTF-8 for storage
- **Performance**: Target ≤8ms local echo, ≤200ms remote reflection
- **Offline support**: Operation queuing with CRDT reconciliation

## Testing Strategy
- Convergence tests with multi-client fuzzing
- Cursor position invariants
- Performance benchmarks (120 WPM typing, 1MB files)
- LSP/DAP correctness validation
- Network latency simulation (50-150ms RTT)