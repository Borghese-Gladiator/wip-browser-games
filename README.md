# Browser Games

A small gaming portal: a landing page that lists games, with each game living in
its own page. Built as an npm-workspaces monorepo using Vite + React.

## Layout

```
.
├── index.html              # Portal entry (root page)
├── vite.config.js          # Multi-page build: portal + one entry per game
├── package.json            # Workspaces root + scripts
├── packages/
│   └── shared/             # @portal/shared
│       └── src/
│           ├── registry.js # Hand-maintained list of games
│           └── theme.css   # Shared design tokens
├── portal/                 # @portal/app — the landing page (React)
│   └── src/
│       ├── main.jsx
│       ├── Portal.jsx      # Renders a card per registry entry
│       └── portal.css
└── games/
    └── tic-tac-toe/        # @portal/game-tic-tac-toe
        ├── index.html      # Game page entry (/games/tic-tac-toe/)
        └── src/
            ├── main.jsx
            ├── TicTacToe.jsx
            ├── ttt.js       # Pure game logic (unit-tested)
            └── ttt.test.js
```

## Install

```
npm install
```

## Run (dev)

```
npm run dev
```

Open the printed URL for the portal; click a game card to navigate to it.

## Build / preview (prod)

```
npm run build
npm run preview
```

## Test

```
npm test
```

Unit tests cover the pure game logic (e.g. `games/tic-tac-toe/src/ttt.js`).

## Adding a game

1. Create `games/<id>/` with an `index.html` and a `src/main.jsx` entry (use
   `games/tic-tac-toe/` as a template).
2. Add an entry to `packages/shared/src/registry.js` (`id`, `title`,
   `description`, `emoji`, `path`).
3. Add the game's `index.html` to the `input` map in `vite.config.js`.

Shared theme tokens live in `@portal/shared/theme.css`; import it from each
game's entry to stay visually consistent.
