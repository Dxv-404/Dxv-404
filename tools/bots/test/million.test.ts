// Phase 1 gate check: one million hands of bot play with chips checked after every single input.
// Slow (minutes), so it runs only when GATE=1.
import { describe, it, expect } from 'vitest';
import { playGame } from '../src/run';

describe.runIf(process.env.GATE === '1')('one million hands', () => {
  it('never creates or loses a chip and never gets stuck', async () => {
    let hands = 0, showdowns = 0, sidePots = 0, twice = 0, chipErrors = 0, stuck = 0, game = 0;
    while (hands < 1_000_000) {
      const players = 2 + (game % 14);
      const rep = playGame({
        seed: 1_000 + game, players, hands: 2_000, replay: game % 50 === 0,
        config: { dealItTwice: game % 3 === 0, straddle: game % 4 === 0, anteFromLevel: game % 5 === 0 ? 2 : 0, blindUpEvery: game % 2 ? 25 : 0 },
      });
      hands += rep.hands; showdowns += rep.showdowns; sidePots += rep.sidePots; twice += rep.twice;
      chipErrors += rep.chipErrors; stuck += rep.stuck;
      expect(rep.replayOk).toBe(true);
      game++;
      await new Promise((r) => setTimeout(r, 0)); // let the test runner report progress
    }
    console.log(JSON.stringify({ hands, games: game, showdowns, sidePots, twice, chipErrors, stuck }));
    expect(chipErrors).toBe(0);
    expect(stuck).toBe(0);
    expect(sidePots).toBeGreaterThan(1000);
    expect(twice).toBeGreaterThan(100);
  }, 3_600_000);
});
