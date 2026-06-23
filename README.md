# Tic-Tac-Toe

A two-player tic-tac-toe game that runs entirely in the browser. It is a
zero-dependency static web app — one HTML file and one JavaScript file, no
framework and no build step. Players click cells on a 3×3 grid to place X and O
alternately; the game announces the winner or a draw and offers a reset.

## Build / install

No build step and no dependencies. There is nothing to install — the app is
plain HTML, CSS, and JavaScript served as-is.

## Run (dev)

Open `index.html` directly in a browser, or serve the directory with any static
file server, e.g.:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000/. There is no separate dev/watch mode.

## Run (prod)

There is no separate production build or server. Serve the same static files
from any web server / static host (the directory contains everything needed).
The `python3 -m http.server` command above works equally well for a local
production-style serve.

## File hierarchy

```
.
├── index.html   # Page markup, styles, and the board container; loads game.js
├── game.js      # Game logic: board state, move handling, win/draw detection, reset
└── README.md    # This file
```
