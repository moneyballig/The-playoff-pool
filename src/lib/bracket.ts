import type { PlayoffGame, PlayoffTeam, Round } from './types';

export const MAX_PICKS = 13;

export type PickMap = { [pickKey: string]: string };

export interface Matchup {
  key: string;
  round: Round;
  conference: 'AFC' | 'NFC' | null;
  slot: number;
  home: PlayoffTeam | null;
  away: PlayoffTeam | null;
  homeLabel: string | null;
  awayLabel: string | null;
  realGame: PlayoffGame | null;
  winner: PlayoffTeam | null;
  userPick: PlayoffTeam | null;
}

export interface DerivedBracket {
  afcWC: Matchup[];
  nfcWC: Matchup[];
  afcDiv: Matchup[];
  nfcDiv: Matchup[];
  afcConf: Matchup | null;
  nfcConf: Matchup | null;
  superBowl: Matchup | null;
  champion: PlayoffTeam | null;
}

function teamBySeed(teams: PlayoffTeam[], conf: 'AFC' | 'NFC', seed: number): PlayoffTeam | null {
  return teams.find((t) => t.conference === conf && t.seed === seed) ?? null;
}

function seedOf(teams: PlayoffTeam[], team: PlayoffTeam | null): number {
  if (!team) return 99;
  return teams.find((t) => t.id === team.id)?.seed ?? 99;
}

/**
 * Builds the participant's full projected bracket with NFL reseeding:
 * Divisional: #1 seed hosts the LOWEST remaining seed; the other two
 * wild card winners meet (higher seed hosts). Higher seed hosts the
 * conference championship. AFC champion meets NFC champion in the Super Bowl.
 */
export function buildBracket(teams: PlayoffTeam[], games: PlayoffGame[], picks: PickMap): DerivedBracket {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const pickOf = (key: string) => (picks[key] ? byId.get(picks[key]) ?? null : null);

  const wcGames = games.filter((g) => g.round === 'wild_card');
  const divGames = games.filter((g) => g.round === 'divisional');
  const confGames = games.filter((g) => g.round === 'conference');
  const sbGame = games.find((g) => g.round === 'super_bowl') ?? null;

  const buildWc = (conf: 'AFC' | 'NFC'): Matchup[] =>
    wcGames
      .filter((g) => g.conference === conf)
      .sort((a, b) => a.game_slot - b.game_slot)
      .map((g) => {
        const home = g.home_team_id ? byId.get(g.home_team_id) ?? null : null;
        const away = g.away_team_id ? byId.get(g.away_team_id) ?? null : null;
        let winner: PlayoffTeam | null = null;
        if (g.status === 'final' && g.winner_team_id) {
          winner = byId.get(g.winner_team_id) ?? null;
        } else {
          const p = pickOf(g.id);
          winner = p && (p.id === home?.id || p.id === away?.id) ? p : null;
        }
        return {
          key: g.id,
          round: 'wild_card' as const,
          conference: conf,
          slot: g.game_slot,
          home,
          away,
          homeLabel: home ? `#${home.seed} ${home.abbreviation}` : null,
          awayLabel: away ? `#${away.seed} ${away.abbreviation}` : null,
          realGame: g,
          winner,
          userPick: pickOf(g.id),
        };
      });

  const buildDiv = (conf: 'AFC' | 'NFC', wc: Matchup[]): Matchup[] => {
    const winners = wc.map((m) => m.winner);
    const played = winners.every((w) => w !== null);
    const seed1 = teamBySeed(teams, conf, 1);

    // sort remaining winners by seed ascending
    const remaining = winners
      .filter((w): w is PlayoffTeam => w !== null)
      .sort((a, b) => seedOf(teams, a) - seedOf(teams, b));

    const confDivGames = divGames.filter((g) => g.conference === conf);
    const gameWithBye = seed1
      ? confDivGames.find((g) => g.home_team_id === seed1.id || g.away_team_id === seed1.id) ?? null
      : null;
    const otherGame = confDivGames.find((g) => gameWithBye && g.id !== gameWithBye.id) ?? confDivGames[0] ?? null;

    const result: Matchup[] = [];

    // slot 1: #1 seed vs lowest remaining seed
    const byeGameWinnerIsReal = gameWithBye && gameWithBye.status === 'final' && gameWithBye.winner_team_id;
    const lowest = remaining[0] ?? null;
    const home1 = seed1;
    const away1 = lowest;
    let winner1: PlayoffTeam | null = null;
    const pick1 = pickOf(`div-${conf}-1`);
    if (byeGameWinnerIsReal && gameWithBye) {
      const realW = byId.get(gameWithBye.winner_team_id!) ?? null;
      if (realW && (realW.id === home1?.id || realW.id === away1?.id)) winner1 = realW;
    }
    if (!winner1 && pick1) {
      winner1 = pick1.id === home1?.id || pick1.id === away1?.id ? pick1 : null;
    }
    result.push({
      key: `div-${conf}-1`,
      round: 'divisional',
      conference: conf,
      slot: 1,
      home: home1,
      away: away1,
      homeLabel: home1 ? `#${home1.seed} ${home1.abbreviation}` : null,
      awayLabel: away1 ? `#${away1.seed} ${away1.abbreviation}` : 'Lowest remaining seed',
      realGame: gameWithBye,
      winner: winner1,
      userPick: pick1,
    });

    // slot 2: other two winners, higher seed hosts
    const rest = remaining.slice(1);
    let home2: PlayoffTeam | null = null;
    let away2: PlayoffTeam | null = null;
    if (rest.length >= 2) {
      const a = rest[0];
      const b = rest[1];
      [home2, away2] = seedOf(teams, a) <= seedOf(teams, b) ? [a, b] : [b, a];
    } else if (played && rest.length === 1) {
      home2 = rest[0];
    }
    const pick2 = pickOf(`div-${conf}-2`);
    let winner2: PlayoffTeam | null = null;
    if (otherGame && otherGame.status === 'final' && otherGame.winner_team_id) {
      const realW = byId.get(otherGame.winner_team_id) ?? null;
      if (realW && (realW.id === home2?.id || realW.id === away2?.id)) winner2 = realW;
    }
    if (!winner2 && pick2) {
      winner2 = pick2.id === home2?.id || pick2.id === away2?.id ? pick2 : null;
    }
    result.push({
      key: `div-${conf}-2`,
      round: 'divisional',
      conference: conf,
      slot: 2,
      home: home2,
      away: away2,
      homeLabel: home2 ? `#${seedOf(teams, home2)} ${home2.abbreviation}` : null,
      awayLabel: away2 ? `#${seedOf(teams, away2)} ${away2.abbreviation}` : null,
      realGame: otherGame,
      winner: winner2,
      userPick: pick2,
    });

    return result;
  };

  const buildConf = (conf: 'AFC' | 'NFC', divs: Matchup[]): Matchup | null => {
    const w1 = divs[0]?.winner ?? null;
    const w2 = divs[1]?.winner ?? null;
    let home = w1;
    let away = w2;
    if (home && away && seedOf(teams, away) < seedOf(teams, home)) {
      [home, away] = [away, home];
    }
    const realGame = confGames.find((g) => g.conference === conf) ?? null;
    const pick = pickOf(`conf-${conf}`);
    let winner: PlayoffTeam | null = null;
    if (realGame && realGame.status === 'final' && realGame.winner_team_id) {
      const realW = byId.get(realGame.winner_team_id) ?? null;
      if (realW && (realW.id === home?.id || realW.id === away?.id)) winner = realW;
    }
    if (!winner && pick) {
      winner = pick.id === home?.id || pick.id === away?.id ? pick : null;
    }
    return {
      key: `conf-${conf}`,
      round: 'conference',
      conference: conf,
      slot: 1,
      home,
      away,
      homeLabel: home ? `#${seedOf(teams, home)} ${home.abbreviation}` : null,
      awayLabel: away ? `#${seedOf(teams, away)} ${away.abbreviation}` : null,
      realGame,
      winner,
      userPick: pick,
    };
  };

  const afcWC = buildWc('AFC');
  const nfcWC = buildWc('NFC');
  const afcDiv = buildDiv('AFC', afcWC);
  const nfcDiv = buildDiv('NFC', nfcWC);
  const afcConf = buildConf('AFC', afcDiv);
  const nfcConf = buildConf('NFC', nfcDiv);

  let superBowl: Matchup | null = null;
  let champion: PlayoffTeam | null = null;
  if (afcConf && nfcConf) {
    const afcW = afcConf.winner;
    const nfcW = nfcConf.winner;
    const pick = pickOf('sb');
    let sbWinner: PlayoffTeam | null = null;
    if (sbGame && sbGame.status === 'final' && sbGame.winner_team_id) {
      const realW = byId.get(sbGame.winner_team_id) ?? null;
      if (realW && (realW.id === afcW?.id || realW.id === nfcW?.id)) sbWinner = realW;
    }
    if (!sbWinner && pick) {
      sbWinner = pick.id === afcW?.id || pick.id === nfcW?.id ? pick : null;
    }
    superBowl = {
      key: 'sb',
      round: 'super_bowl',
      conference: null,
      slot: 1,
      home: afcW,
      away: nfcW,
      homeLabel: 'AFC Champion',
      awayLabel: 'NFC Champion',
      realGame: sbGame,
      winner: sbWinner,
      userPick: pick,
    };
    champion = sbWinner;
  }

  return { afcWC, nfcWC, afcDiv, nfcDiv, afcConf, nfcConf, superBowl, champion };
}

/** Flatten the derived bracket into all 13 matchups in selection order. */
export function allMatchups(b: DerivedBracket): Matchup[] {
  return [...b.afcWC, ...b.nfcWC, ...b.afcDiv, ...b.nfcDiv, b.afcConf, b.nfcConf, b.superBowl].filter(
    (m): m is Matchup => m !== null,
  );
}

/** Extract valid picks (team must be in the current pairing) as save payload. */
export function validPicks(b: DerivedBracket): { pick_key: string; team_id: string }[] {
  return allMatchups(b)
    .filter((m) => m.winner && (m.winner.id === m.home?.id || m.winner.id === m.away?.id))
    .map((m) => ({ pick_key: m.key, team_id: m.winner!.id }));
}
