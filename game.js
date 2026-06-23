"use strict";

// 0-indexed cell positions for every line that wins the game.
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetEl = document.getElementById("reset");

let board = Array(9).fill("");
let currentPlayer = "X";
let gameOver = false;

const ROW_LABELS = ["top", "middle", "bottom"];
const COL_LABELS = ["left", "center", "right"];

const cellLabel = (i) => `${ROW_LABELS[Math.floor(i / 3)]} ${COL_LABELS[i % 3]}`;

// Build the nine cell buttons once; subsequent games reuse them via reset().
const cells = [];
for (let i = 0; i < 9; i++) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "cell";
  cell.dataset.index = String(i);
  cell.setAttribute("role", "gridcell");
  cell.setAttribute("aria-label", cellLabel(i));
  cell.addEventListener("click", () => handleMove(i));
  boardEl.appendChild(cell);
  cells.push(cell);
}

function handleMove(i) {
  if (gameOver || board[i] !== "") return;

  board[i] = currentPlayer;
  cells[i].textContent = currentPlayer;
  cells[i].disabled = true;
  cells[i].setAttribute("aria-label", `${cellLabel(i)}, ${currentPlayer}`);

  const winner = findWinner();
  if (winner) {
    gameOver = true;
    statusEl.textContent = `${winner} wins!`;
    disableAll();
    return;
  }

  if (board.every((c) => c !== "")) {
    gameOver = true;
    statusEl.textContent = "It's a draw!";
    return;
  }

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  statusEl.textContent = `${currentPlayer}'s turn`;
}

function findWinner() {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function disableAll() {
  for (const cell of cells) cell.disabled = true;
}

function reset() {
  board = Array(9).fill("");
  currentPlayer = "X";
  gameOver = false;
  cells.forEach((cell, i) => {
    cell.textContent = "";
    cell.disabled = false;
    cell.setAttribute("aria-label", cellLabel(i));
  });
  statusEl.textContent = "X's turn";
}

resetEl.addEventListener("click", reset);
