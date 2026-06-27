// Boots the single game gateway that hosts every multiplayer game. Replaces the
// former per-game servers (poker-server, sheng-ji-server).
import { createGateway } from '@browser-games/game-core';

createGateway({ port: process.env.PORT || 3001 });
