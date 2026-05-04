# Hoopstography

A visual timeline of professional basketball history, spanning from the sport's earliest organized roots in 1894 to the present day. Every dot is a real event — zoom in to explore eras, hover or tap to read.

Heavily inspired by [Histography.io](https://histography.io) by Matan Stauber.

## Data Sources

- **[NBA.com/history](https://www.nba.com/history)** — 1,400+ milestone events covering championships, records, rule changes, expansions, and drafts. Scraped and structured into a Supabase table (`nba_events`).
- **[Hoopsrewind.app](https://hoopsrewind.app)** — A companion project sharing a basketball event database (`sports_events`). Events are filtered to basketball only and deduplicated against the NBA.com dataset using Jaccard similarity (±1 day window, threshold 0.1).

## Tech Stack

- Vanilla JS + HTML5 Canvas (no framework)
- [Supabase](https://supabase.com) for event data (two tables: `nba_events`, `sports_events`)
- [Vite](https://vite.dev) for local dev with `.env` injection

## Running Locally

1. Create a `.env` file in the project root:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

2. Install dependencies and start the dev server:
   ```
   npm install
   npm run dev or npm run dev -- --host 
   ```

## Interaction

| Input | Action |
|---|---|
| Scroll / pinch | Zoom in and out |
| Drag | Pan the timeline |
| Hover (desktop) | Preview an event |
| Click (desktop) | Pin event popup open — click again or click away to close |
| Tap (mobile) | Open event popup — tap again to close |
