# earlove

**Discover what you haven't heard.** earlove maps your Spotify listening history to surface the gaps, blind spots, and genres you didn't know you were avoiding.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FziggyMcQ%2Fearlove&env=SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET,NEXTAUTH_SECRET&envDescription=Spotify%20credentials%20from%20developer.spotify.com%2Fdashboard&envLink=https%3A%2F%2FziggyMcQ.github.io%2Fearlove&project-name=earlove)

---

## Non-technical? Start here

**[→ Step-by-step setup guide](https://ziggyMcQ.github.io/earlove)** — a visual, 4-step wizard that walks you through everything. No coding required.

---

## Quick Start (developers)

```bash
git clone https://github.com/ziggyMcQ/earlove.git
cd earlove
npm install
cp .env.local.example .env.local
# Fill in your Spotify credentials (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) app |
| `SPOTIFY_CLIENT_SECRET` | Yes | From the same Spotify app |
| `SPOTIFY_REDIRECT_URI` | Yes | `http://localhost:3000/api/auth/callback` for local dev |
| `NEXTAUTH_SECRET` | Yes | Random string — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Local only | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_NAME` | No | Customize the app name shown in the UI (defaults to "earlove") |

### Spotify App Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app — name it anything
3. Under **Settings**, add your Redirect URI
4. Check **Web API** under "Which API/SDKs are you planning to use?"
5. Under **User Management**, add the Spotify emails of people you want to grant access

> Spotify's Developer Mode allows up to 5 users per app. Each person who deploys their own instance can invite 5 more.

---

## Architecture

- **Next.js** (App Router) with React and Tailwind CSS
- **Serverless** — deployed on Vercel, no database required
- **Stateless** — all user data is fetched from Spotify on each session; profile data is cached client-side in `localStorage`
- **Phased profile loading** — API calls are split across 6 sequential phases to stay within Spotify's rate limits
- **Time-budgeted functions** — long-running phases (genre analysis) break early to stay under Vercel's 60-second function timeout

```
src/
├── app/
│   ├── api/           # Serverless API routes (auth, profile phases, health)
│   ├── dashboard/     # Main app UI (Your Ear, Discover, Curate tabs)
│   └── page.tsx       # Landing page
├── lib/
│   ├── spotify.ts     # Spotify API client with rate-limit handling
│   ├── heard-profile.ts  # Profile building logic
│   ├── profile-cache.ts  # localStorage caching
│   └── auth.ts        # OAuth session management
└── ...
```

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-idea`)
3. Commit your changes
4. Open a Pull Request

Check out the `.cursor/rules/` directory for project-specific development guides covering rate limits, defensive coding patterns, and change safety.

---

## License

[MIT](LICENSE)
