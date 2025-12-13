# Shared Wishlist

A minimalist, dual-user wishlist. Designed for sharing and managing desired items between two users with distinct visual profiles.

## Tech Stack

- **Framework:** Astro (SSR mode)
- **Styling:** TailwindCSS v4
- **Language:** TypeScript
- **Backend/DB:** Firebase Firestore
- **API:** Node.js (Astro API Routes)
- **Deployment:** Vercel

## Features

- **Server-Side Rendering (SSR):** Instant data updates and SEO optimization via Vercel Adapter.
- **Custom REST API:** Internal Node.js endpoints (`/api/items`) handling all write operations with server-side validation.
- **Dynamic Theming:** Context-aware design system that adapts color palettes based on the active user profile.
- **Cursor-Based Pagination:** Efficient "Load More" functionality for managing large lists.
- **Secure Input System:** PIN-protected interface for creating and editing items to prevent unauthorized changes.
- **Full CRUD:** Create, Read, Update, and Delete capabilities with a custom UI menu.
