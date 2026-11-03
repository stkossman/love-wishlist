# Shared Wishlist

A minimalist, dual-user wishlist. Designed for sharing and managing desired items between two users with distinct visual profiles.

## Tech Stack

- **Framework:** Astro (SSR mode)
- **Styling:** TailwindCSS v4
- **Language:** TypeScript
- **Backend/DB:** Firebase Firestore
- **API:** Node.js (Astro API Routes)
- **Integrations:** Telegram Bot API (Telegraf)
- **Deployment:** Vercel

## Features

- **Server-Side Rendering (SSR):** Instant data updates and SEO optimization via Vercel Adapter.
- **Custom REST API:** Internal Node.js endpoints (`/api/items`) handling all write operations with server-side validation.
- **Telegram Notifications:** Real-time alerts sent to a private group upon item creation or deletion, powered by a server-side bot service.
- **Dynamic Theming:** Context-aware design system that adapts color palettes based on the active user profile.
- **Cursor-Based Pagination:** Efficient "Load More" functionality for managing large lists.
- **Mutation authorization:** Server-verified PIN with signed HttpOnly sessions for item and media changes.
- **Full CRUD:** Create, Read, Update, and Delete capabilities with a custom UI menu.

## Development and security setup

Use Node.js 22+ and Bun. Install with `bun install`, configure the private variables in `.env.example`, then run `bun run dev`.

Run `bun run test`, `bun run typecheck`, `bun run check`, and `bun run build` for verification.

Read [SECURITY.md](SECURITY.md) before enabling production writes. It documents secret rotation, Admin SDK credentials, the mutation endpoint inventory, proposed Firestore rules, required shared login rate limiting, and manual verification steps. Read routes remain unauthenticated at the application level. No production rules are deployed automatically.
