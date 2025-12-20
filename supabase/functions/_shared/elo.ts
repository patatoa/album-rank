// Minimal Elo implementation (extracted to a shared module for reuse)
export type EloResult = {
  playerRating: number;
  opponentRating: number;
};

export const expectedScore = (ratingA: number, ratingB: number) =>
  1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));

export const calculateElo = (playerRating: number, opponentRating: number, playerWon: boolean, k = 32): EloResult => {
  const playerExpected = expectedScore(playerRating, opponentRating);
  const opponentExpected = expectedScore(opponentRating, playerRating);

  const playerScore = playerWon ? 1 : 0;
  const opponentScore = playerWon ? 0 : 1;

  return {
    playerRating: playerRating + k * (playerScore - playerExpected),
    opponentRating: opponentRating + k * (opponentScore - opponentExpected)
  };
};
