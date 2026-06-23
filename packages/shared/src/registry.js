// Hand-maintained registry of games shown on the portal.
// To add a game: create games/<id>/, add an entry here, and add its index.html
// to the `input` map in vite.config.js.
export const games = [
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "Two-player X and O on a 3×3 grid. First to three in a row wins.",
    emoji: "⭕",
    path: "/games/tic-tac-toe/",
  },
  {
    id: "poker",
    title: "Texas Hold'em",
    description: "4-player online poker. Multiplayer — open in four browser tabs.",
    emoji: "🃏",
    path: "/games/poker/",
  },
  {
    id: "sheng-ji",
    title: "Sheng Ji (升级)",
    description: "4-player online trick-taking card game. Multiplayer — open in four browser tabs.",
    emoji: "🀄",
    path: "/games/sheng-ji/",
  },
];
