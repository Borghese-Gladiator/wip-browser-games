// Boots the single game gateway that hosts every multiplayer game. Replaces the
// former per-game servers (poker-server, sheng-ji-server).
import { createGateway } from '@browser-games/game-core';

const { shutdown } = createGateway({ port: process.env.PORT || 3001 });

// On a deploy signal, drain gracefully (snapshot rooms, warn clients) before exit.
function onSignal() {
  shutdown(5_000).then(() => process.exit(0)).catch(() => process.exit(1));
}
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
