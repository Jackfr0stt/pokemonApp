import React, { createContext, useContext, useState } from 'react';

export type GameId = 'radical-red' | 'emerald-imperium';

interface GameContextValue {
  game: GameId;
  setGame: (g: GameId) => void;
}

const GameContext = createContext<GameContextValue>({
  game: 'radical-red',
  setGame: () => {},
});

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [game, setGame] = useState<GameId>('radical-red');
  return (
    <GameContext.Provider value={{ game, setGame }}>
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => useContext(GameContext);
