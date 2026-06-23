// Pure tic-tac-toe logic, kept framework-free so it is easy to unit test.

// 0-indexed cell positions for every line that wins the game.
export const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const emptyBoard = () => Array(9).fill("");

// Returns "X" / "O" if a player has won, otherwise null.
export function findWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

export const isDraw = (board) =>
  board.every((cell) => cell !== "") && !findWinner(board);

const ROW_LABELS = ["top", "middle", "bottom"];
const COL_LABELS = ["left", "center", "right"];

export const cellLabel = (i) =>
  `${ROW_LABELS[Math.floor(i / 3)]} ${COL_LABELS[i % 3]}`;
