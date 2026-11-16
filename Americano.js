let americanoState = {
  players: [],
  courts: 2,
  playedPairs: {}, // Tracks partnerships (who played WITH whom)
  playedOpponents: {}, // Tracks opponents (who played AGAINST whom)
  sitQueue: [],
  roundCounter: 0,
  rankedMode: false, // Whether to use ranking-based matchmaking
  playerStats: {}, // Individual player statistics for ranking
  rounds: [] // Persisted schedule: each generated round's {matches, sit}
};

function startAmericano(players, courts, rankedMode = false){
  // Shuffle players initially
  americanoState.players = shuffled(players);
  americanoState.courts = courts;
  americanoState.playedPairs = {}; // Reset pairs count
  americanoState.playedOpponents = {}; // Reset opponents count
  americanoState.sitQueue = [...americanoState.players]; // Full queue initially
  americanoState.roundCounter = 0;
  americanoState.rankedMode = rankedMode;
  americanoState.rounds = []; // Reset persisted schedule
  
  // Initialize player statistics
  americanoState.playerStats = {};
  players.forEach(p => {
    americanoState.playerStats[p] = {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      rating: 1000 // Start with base rating (Elo-style)
    };
  });
  
  // Initialize partnership counts to 0
  for(let i=0; i<players.length; i++){
    for(let j=i+1; j<players.length; j++){
       const p1 = players[i];
       const p2 = players[j];
       const key = [p1,p2].sort().join("|");
       americanoState.playedPairs[key] = 0;
       americanoState.playedOpponents[key] = 0;
    }
  }
  
  americanoNextRound();
}

function americanoNextRound(){
  // In ranked mode, update rankings before generating next round (except first round)
  if(americanoState.rankedMode && americanoState.roundCounter > 0) {
    updateAmericanoRankings();
  }

  const roundData = generateAmericanoRound(); // also appends to americanoState.rounds
  renderAmericanoRound(americanoState.roundCounter + 1, roundData);

  // The "Next round" button lives in the round header (built by Ui.js)
  americanoState.roundCounter++;
  
  // Initialize rankings display in ranked mode
  if(americanoState.rankedMode && americanoState.roundCounter === 1) {
    displayAmericanoRankings();
  }

  // Persist the updated schedule/state so a page refresh reproduces it
  if (typeof saveTournamentData === "function") saveTournamentData();

  // Put the new round on top and fold the previous one away
  if (typeof refreshPlayView === "function") refreshPlayView();
}

function generateAmericanoRound(){
  const {players, courts, playedPairs, playedOpponents} = americanoState;
  
  // Calculate how many can play (multiple of 4, limited by courts)
  const maxPlayable = Math.floor(players.length / 4) * 4;
  const actualPlaying = Math.min(courts * 4, maxPlayable);
  let sitCount = players.length - actualPlaying;

  // FAIR + MIXING sit-out selection.
  // 1) Whoever has sat out the least sits next (sit-out counts never differ by more than 1).
  // 2) Avoid making anyone sit two rounds in a row when it can be avoided.
  // 3) Among equally-eligible players, pick the set that leaves the most fresh
  //    partnerships on court. This stops the same groups being locked together.
  const sitOut = chooseSitOuts(players, sitCount, americanoState.rounds, playedPairs);

  // Active players for this round
  const activePlayers = players.filter(p=>!sitOut.includes(p));

  // TRUE AMERICANO LOGIC: Backtracking Solver
  // Goal: Minimize both partnership AND opponent repetition
  // In ranked mode: Also prioritize matching similar-skilled players
  
  const matches = solveBestMatches(activePlayers, courts, playedPairs, playedOpponents, americanoState.rankedMode, americanoState.playerStats);
  
  // Update partnership counts
  matches.forEach(m => {
    [m.A, m.B].forEach(team => {
      const key = [...team].sort().join("|");
      if(playedPairs[key] === undefined) playedPairs[key] = 0;
      playedPairs[key]++;
    });
    
    // Update opponent counts (each player on team A vs each player on team B)
    m.A.forEach(p1 => {
      m.B.forEach(p2 => {
        const key = [p1, p2].sort().join("|");
        if(playedOpponents[key] === undefined) playedOpponents[key] = 0;
        playedOpponents[key]++;
      });
    });
  });

  const roundData = {matches, sit: sitOut};
  americanoState.rounds.push(roundData); // Persist schedule (also drives sit-out fairness)
  return roundData;
}

// Fisher-Yates shuffle (unbiased, unlike sort(() => Math.random() - 0.5))
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Decide who sits out this round.
// Fairness first (fewest sit-outs so far, no back-to-back sits where avoidable),
// then mixing (choose the sitters that leave the most never-partnered pairs on court).
function chooseSitOuts(players, sitCount, pastRounds, playedPairs) {
  if (sitCount <= 0) return [];

  const sits = {};
  players.forEach(p => (sits[p] = 0));
  (pastRounds || []).forEach(r => (r.sit || []).forEach(p => { if (p in sits) sits[p]++; }));
  const lastRound = pastRounds && pastRounds.length ? pastRounds[pastRounds.length - 1] : null;
  const satLast = new Set(lastRound ? lastRound.sit : []);

  // Fill from the lowest sit-count level upwards. Whole levels that fit must sit;
  // the first level that does not fit becomes the pool we choose from.
  const levels = [...new Set(Object.values(sits))].sort((a, b) => a - b);
  const must = [];
  let pool = [];
  for (const lv of levels) {
    const group = players.filter(p => sits[p] === lv);
    if (must.length + group.length <= sitCount) must.push(...group);
    else { pool = group; break; }
  }
  let k = sitCount - must.length;
  if (k === 0) return must;

  // Prefer players who did NOT sit last round
  const fresh = pool.filter(p => !satLast.has(p));
  const stale = pool.filter(p => satLast.has(p));
  let chosenFixed = [...must];
  let candidates;
  let backToBackPenalty = 0;
  if (fresh.length > k) {
    candidates = fresh;                 // real choice without anyone sitting twice in a row
  } else if (fresh.length === k && stale.length > 0) {
    // Only one way to avoid back-to-back sits - and repeating it every round locks the
    // same groups together forever (e.g. 8 players on 1 court). Allow the whole pool,
    // but make each back-to-back sit cost something so it only happens when it mixes groups.
    candidates = pool;
    backToBackPenalty = 6;
  } else if (fresh.length === k) {
    candidates = fresh;
  } else {
    chosenFixed.push(...fresh);
    k -= fresh.length;
    candidates = stale;
  }

  // Sample subsets of candidates and keep the one that gives the best mix on court:
  // first make sure every active player has someone new to partner, then maximise new pairs.
  const keyOf = (a, b) => [a, b].sort().join("|");
  let best = null, bestScore = -Infinity;
  const tries = Math.min(120, 1 + candidates.length * 6);
  for (let t = 0; t < tries; t++) {
    const pick = shuffled(candidates).slice(0, k);
    const sitSet = new Set([...chosenFixed, ...pick]);
    const active = players.filter(p => !sitSet.has(p));
    let newPairs = 0;
    const hasNew = new Set();
    for (let i = 0; i < active.length; i++)
      for (let j = i + 1; j < active.length; j++)
        if ((playedPairs[keyOf(active[i], active[j])] || 0) === 0) {
          newPairs++; hasNew.add(active[i]); hasNew.add(active[j]);
        }
    const b2b = pick.filter(p => satLast.has(p)).length;
    const score = hasNew.size * 10 + newPairs - b2b * backToBackPenalty + Math.random() * 0.5;
    if (score > bestScore) { bestScore = score; best = pick; }
  }
  return [...chosenFixed, ...best];
}

// Enhanced Pairing Algorithm with Sit-Out Awareness (fixes 2-court issues)
function solveBestMatches(players, courts, playedPairs, playedOpponents, rankedMode = false, playerStats = {}) {
  // In RANKED mode: Use skill-first approach
  if (rankedMode && Object.keys(playerStats).length > 0) {
    return solveRankedMatches(players, courts, playedPairs, playedOpponents, playerStats);
  }
  
  // ENHANCED REGULAR mode: Prioritize unplayed pairs among ACTIVE players
  const shuffledPlayers = shuffled(players);
  
  // Calculate global unplayed partnership counts (for prioritization)
  const unplayedCounts = {};
  for (const player of shuffledPlayers) {
    let unplayedPartners = 0;
    for (const other of shuffledPlayers) {
      if (player === other) continue;
      const key = [player, other].sort().join("|");
      if ((playedPairs[key] || 0) === 0) {
        unplayedPartners++;
      }
    }
    unplayedCounts[player] = unplayedPartners;
  }
  
  // Build ALL possible pairs with enhanced costs
  const allPairs = [];
  for (let i = 0; i < shuffledPlayers.length; i++) {
    for (let j = i + 1; j < shuffledPlayers.length; j++) {
      const p1 = shuffledPlayers[i];
      const p2 = shuffledPlayers[j];
      const key = [p1, p2].sort().join("|");
      const playCount = playedPairs[key] || 0;
      
      // EXPONENTIAL cost to heavily penalize repeats
      let cost = playCount === 0 ? 0 : Math.pow(100, playCount);
      
      // BONUS: If both players have many unplayed partners, prioritize them
      // This helps players who are "behind" in their partnership coverage
      if (playCount === 0) {
        const avgUnplayed = (unplayedCounts[p1] + unplayedCounts[p2]) / 2;
        // Higher unplayed count = lower cost (higher priority)
        cost = -avgUnplayed; // Negative cost = highest priority
      }
      
      allPairs.push({ p1, p2, key, playCount, cost });
    }
  }
  
  // Sort by cost (negative costs come first, then 0, then exponential)
  allPairs.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    // If same cost, randomize to avoid bias
    return Math.random() - 0.5;
  });
  
  // Greedy selection with lookahead
  const selectedPairs = [];
  const usedPlayers = new Set();
  
  while (selectedPairs.length < shuffledPlayers.length / 2) {
    // Find first available pair (not using already-paired players)
    let selected = null;
    for (const pair of allPairs) {
      if (!usedPlayers.has(pair.p1) && !usedPlayers.has(pair.p2)) {
        selected = pair;
        break;
      }
    }
    
    if (!selected) {
      console.error("Could not find available pair!");
      break;
    }
    
    selectedPairs.push(selected);
    usedPlayers.add(selected.p1);
    usedPlayers.add(selected.p2);
    
    // Remove used pair from pool
    const index = allPairs.indexOf(selected);
    allPairs.splice(index, 1);
  }
  
  if (selectedPairs.length === 0) {
    console.error("No pairs could be formed!");
    return [];
  }

  // Improve the greedy result: picking pairs one at a time can force the last players
  // into a much-repeated partnership. Re-split any two pairs if that lowers total cost.
  const pairCost = (a, b) => {
    const k = [a, b].sort().join("|");
    const n = playedPairs[k] || 0;
    return n === 0 ? -(unplayedCounts[a] + unplayedCounts[b]) / 2 : Math.pow(100, n);
  };
  const mk = (a, b) => ({ p1: a, p2: b, key: [a, b].sort().join("|"), playCount: playedPairs[[a, b].sort().join("|")] || 0, cost: pairCost(a, b) });
  let improvedPairs = true, guard = 0;
  while (improvedPairs && guard++ < 50) {
    improvedPairs = false;
    for (let i = 0; i < selectedPairs.length; i++) {
      for (let j = i + 1; j < selectedPairs.length; j++) {
        const { p1: a, p2: b } = selectedPairs[i], { p1: c, p2: d } = selectedPairs[j];
        const now = pairCost(a, b) + pairCost(c, d);
        const alt1 = pairCost(a, c) + pairCost(b, d);
        const alt2 = pairCost(a, d) + pairCost(b, c);
        if (alt1 < now - 1e-9 && alt1 <= alt2) {
          selectedPairs[i] = mk(a, c); selectedPairs[j] = mk(b, d); improvedPairs = true;
        } else if (alt2 < now - 1e-9) {
          selectedPairs[i] = mk(a, d); selectedPairs[j] = mk(b, c); improvedPairs = true;
        }
      }
    }
  }
  
  // Group pairs into matches, minimizing opponent repetition
  const matchCombinations = findBestMatchPairing(selectedPairs, playedOpponents, false, playerStats);
  
  return matchCombinations;
}

// RANKED MODE: skill-based courts with balanced teams.
// 1) Players are grouped into courts of 4 by rating (strongest four together, next four, ...),
//    so everyone plays people at their level.
// 2) Within a court, the split is chosen to give the closest game (usually #1+#4 vs #2+#3),
//    while avoiding repeat partners and repeat opponents.
// 3) A local search swaps players between neighbouring courts when that removes repeats
//    without mixing skill levels too much.
const RANKED_WEIGHTS = {
  partnerRepeat: 120,   // per previous partnership (squared count)
  opponentRepeat: 15,   // per previous meeting as opponents
  teamGap: 1,           // per rating point difference between the two teams
  courtSpread: 0.35     // per rating point between strongest and weakest on a court
};

function rankedCourtCost(four, playedPairs, playedOpponents, playerStats) {
  const r = p => (playerStats[p] && playerStats[p].rating) || 1000;
  const key = (a, b) => [a, b].sort().join("|");
  const [a, b, c, d] = four;
  const splits = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
  let best = null;
  for (const [A, B] of splits) {
    const pRep = (playedPairs[key(A[0], A[1])] || 0) ** 2 + (playedPairs[key(B[0], B[1])] || 0) ** 2;
    let oRep = 0;
    A.forEach(x => B.forEach(y => { oRep += playedOpponents[key(x, y)] || 0; }));
    const gap = Math.abs((r(A[0]) + r(A[1])) - (r(B[0]) + r(B[1]))) / 2;
    const cost = pRep * RANKED_WEIGHTS.partnerRepeat + oRep * RANKED_WEIGHTS.opponentRepeat + gap * RANKED_WEIGHTS.teamGap;
    if (!best || cost < best.cost) best = { cost, A, B };
  }
  const ratings = four.map(r);
  best.cost += (Math.max(...ratings) - Math.min(...ratings)) * RANKED_WEIGHTS.courtSpread;
  return best;
}

function solveRankedMatches(players, courts, playedPairs, playedOpponents, playerStats) {
  const r = p => (playerStats[p] && playerStats[p].rating) || 1000;
  // Shuffle first so equal ratings (e.g. round 1) are ordered randomly
  const sorted = shuffled(players).sort((a, b) => r(b) - r(a));
  const groups = [];
  for (let i = 0; i + 3 < sorted.length; i += 4) groups.push(sorted.slice(i, i + 4));

  const costs = groups.map(g => rankedCourtCost(g, playedPairs, playedOpponents, playerStats));
  // Local search: swap players between courts if total cost drops
  let improved = true, passes = 0;
  while (improved && passes++ < 20) {
    improved = false;
    for (let g1 = 0; g1 < groups.length; g1++) {
      for (let g2 = g1 + 1; g2 < groups.length; g2++) {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const n1 = [...groups[g1]], n2 = [...groups[g2]];
            [n1[i], n2[j]] = [n2[j], n1[i]];
            const c1 = rankedCourtCost(n1, playedPairs, playedOpponents, playerStats);
            const c2 = rankedCourtCost(n2, playedPairs, playedOpponents, playerStats);
            if (c1.cost + c2.cost < costs[g1].cost + costs[g2].cost - 1e-9) {
              groups[g1] = n1; groups[g2] = n2; costs[g1] = c1; costs[g2] = c2;
              improved = true;
            }
          }
        }
      }
    }
  }

  // Strongest court first (Court 1 = top court)
  const avg = g => g.reduce((s, p) => s + r(p), 0) / 4;
  return groups
    .map((g, i) => ({ g, best: costs[i] }))
    .sort((x, y) => avg(y.g) - avg(x.g))
    .map(({ best }) => ({ A: best.A, B: best.B }));
}

// Find the best way to pair teams against each other
function findBestMatchPairing(pairs, playedOpponents, rankedMode = false, playerStats = {}) {
  if (pairs.length === 0) return [];
  if (pairs.length === 2) {
    // Only one possible match
    return [{
      A: [pairs[0].p1, pairs[0].p2],
      B: [pairs[1].p1, pairs[1].p2]
    }];
  }

  // Helper to calculate team average rating
  function getTeamRating(team) {
    if (!rankedMode || Object.keys(playerStats).length === 0) return 1000;
    const ratings = team.map(p => playerStats[p]?.rating || 1000);
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  // In RANKED mode, use a simpler, more direct approach
  if (rankedMode && Object.keys(playerStats).length > 0) {
    // Calculate rating for each pair
    const pairsWithRatings = pairs.map(pair => ({
      ...pair,
      rating: getTeamRating([pair.p1, pair.p2])
    }));
    
    // Sort pairs by rating
    pairsWithRatings.sort((a, b) => b.rating - a.rating);
    
    // Match adjacent pairs (similar skill levels)
    const matches = [];
    for (let i = 0; i < pairsWithRatings.length; i += 2) {
      if (i + 1 < pairsWithRatings.length) {
        matches.push({
          A: [pairsWithRatings[i].p1, pairsWithRatings[i].p2],
          B: [pairsWithRatings[i + 1].p1, pairsWithRatings[i + 1].p2]
        });
      }
    }
    
    return matches;
  }

  // REGULAR mode: Use exhaustive search for best rotation
  let bestMatches = null;
  let minOpponentCost = Infinity;

  // Recursive function to try all pairings
  function tryPairings(remainingPairs, currentMatches) {
    if (remainingPairs.length === 0) {
      // Calculate total opponent cost for this configuration
      let opponentCost = 0;
      
      currentMatches.forEach(match => {
        // Check how many times these players have faced each other
        match.A.forEach(p1 => {
          match.B.forEach(p2 => {
            const key = [p1, p2].sort().join("|");
            const count = playedOpponents[key] || 0;
            opponentCost += Math.pow(count, 2); // Quadratic penalty for opponent repetition
          });
        });
      });

      if (opponentCost < minOpponentCost) {
        minOpponentCost = opponentCost;
        bestMatches = JSON.parse(JSON.stringify(currentMatches)); // Deep copy
      }
      return;
    }

    // Take first pair and try matching it with each other remaining pair
    const firstPair = remainingPairs[0];
    const rest = remainingPairs.slice(1);

    for (let i = 0; i < rest.length; i++) {
      const secondPair = rest[i];
      const newMatch = {
        A: [firstPair.p1, firstPair.p2],
        B: [secondPair.p1, secondPair.p2]
      };

      // Remove both pairs from remaining
      const newRemaining = rest.filter((_, idx) => idx !== i);

      // Recurse
      currentMatches.push(newMatch);
      tryPairings(newRemaining, currentMatches);
      currentMatches.pop();
    }
  }

  tryPairings(pairs, []);

  return bestMatches || [];
}

function renderAmericanoRound(num,r){
  const div=document.createElement("div");
  div.className="round";
  div.dataset.roundNum = num;
  
  // One-line summary (shown when the round is collapsed) + full body
  div.innerHTML=`<div class="round-summary">
      <div class="rs-name">Round ${num}</div>
      <div class="rs-games"></div>
      <button type="button" class="rs-toggle btn-link">Open</button>
    </div>
    <div class="round-body">
      <div class="round-header"><h3>Round ${num}</h3></div>
    </div>`;
  const body = div.querySelector(".round-body");
  
  const courtsDiv=document.createElement("div");
  courtsDiv.className="courts";
  
  r.matches.forEach((m,i)=>{
    // Escape names so characters like < > & in a name can't break the page
    const teamA = m.A.map(escapeHtml).join("<br>");
    const teamB = m.B.map(escapeHtml).join("<br>");
    const labelA = escapeHtml(m.A.join(" & "));
    const labelB = escapeHtml(m.B.join(" & "));
    
    if (americanoState.rankedMode) {
      // Ranked mode: Add score inputs
      courtsDiv.innerHTML+=`<div class="court" data-court="${i}" data-round="${num}" data-label-a="${labelA}" data-label-b="${labelB}">
        <div class="court-head"><h3 class="court-title">Court ${i+1}</h3><span class="court-status"></span></div>
        <div class="match">
          <div class="team team-a">${teamA}</div>
          <div class="scores score-container">
            <input class="americano-score-input score-box" type="number" inputmode="numeric" placeholder="0" min="0" data-team="A" aria-label="Court ${i+1} score, ${labelA}">
            <span class="colon">:</span>
            <input class="americano-score-input score-box" type="number" inputmode="numeric" placeholder="0" min="0" data-team="B" aria-label="Court ${i+1} score, ${labelB}">
          </div>
          <div class="team team-b">${teamB}</div>
        </div>
      </div>`;
    } else {
      // Regular mode: No score inputs
      courtsDiv.innerHTML+=`<div class="court" data-label-a="${labelA}" data-label-b="${labelB}">
        <div class="court-head"><h3 class="court-title">Court ${i+1}</h3></div>
        <div class="match">
          <div class="team team-a">${teamA}</div>
          <div class="versus">v</div>
          <div class="team team-b">${teamB}</div>
        </div>
      </div>`;
    }
  });
  body.appendChild(courtsDiv);
  
  if(r.sit.length){
    const sitDiv=document.createElement("div");
    sitDiv.className="sitout";
    sitDiv.innerHTML=`<span class="sitout-label">Sitting out this round</span>
      <span class="chips">${r.sit.map(p => `<span class="chip">${escapeHtml(p)}</span>`).join("")}</span>`;
    body.appendChild(sitDiv);
  }
  qs("americanoOutput").appendChild(div);
  
  // Attach event listeners for score inputs in ranked mode
  if (americanoState.rankedMode) {
    div.querySelectorAll('.americano-score-input').forEach(input => {
      input.addEventListener('input', updateAmericanoRankings);
    });
  }
}

// Update rankings based on entered scores
function updateAmericanoRankings() {
  // Reset all player stats
  americanoState.players.forEach(p => {
    americanoState.playerStats[p] = {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      rating: 1000
    };
  });
  
  // Process all completed rounds
  qs("americanoOutput").querySelectorAll('.round').forEach(roundDiv => {
    const roundNum = parseInt(roundDiv.dataset.roundNum);
    
    roundDiv.querySelectorAll('.court').forEach(courtDiv => {
      const inputs = courtDiv.querySelectorAll('.americano-score-input');
      if (inputs.length !== 2) return;
      
      const scoreA = parseInt(inputs[0].value) || 0;
      const scoreB = parseInt(inputs[1].value) || 0;
      
      // Only process if scores are entered
      if (inputs[0].value === "" && inputs[1].value === "") return;
      
      // Look the players up from the stored schedule (never parse the on-screen
      // text: names containing "vs" or "&" would be split incorrectly)
      const courtIdx = [...roundDiv.querySelectorAll('.court')].indexOf(courtDiv);
      const match = americanoState.rounds[roundNum - 1] &&
                    americanoState.rounds[roundNum - 1].matches[courtIdx];
      if (!match) return;
      const teamA = match.A;
      const teamB = match.B;
      
      // Update stats for all players
      teamA.forEach(player => {
        const stats = americanoState.playerStats[player];
        if (stats) {
          stats.gamesPlayed++;
          stats.pointsFor += scoreA;
          stats.pointsAgainst += scoreB;
          stats.pointDiff += (scoreA - scoreB);
          if (scoreA > scoreB) stats.gamesWon++;
          else if (scoreA < scoreB) stats.gamesLost++;
        }
      });
      
      teamB.forEach(player => {
        const stats = americanoState.playerStats[player];
        if (stats) {
          stats.gamesPlayed++;
          stats.pointsFor += scoreB;
          stats.pointsAgainst += scoreA;
          stats.pointDiff += (scoreB - scoreA);
          if (scoreB > scoreA) stats.gamesWon++;
          else if (scoreB < scoreA) stats.gamesLost++;
        }
      });
    });
  });
  
  // Calculate ratings (simplified Elo-style rating)
  americanoState.players.forEach(player => {
    const stats = americanoState.playerStats[player];
    if (stats.gamesPlayed > 0) {
      const winRate = stats.gamesWon / stats.gamesPlayed;
      const avgPointDiff = stats.pointDiff / stats.gamesPlayed;
      
      // Base rating on win rate and point differential
      stats.rating = 1000 + (winRate * 400) + (avgPointDiff * 10);
      stats.rating = Math.max(500, Math.min(1500, stats.rating)); // Clamp between 500-1500
    }
  });
  
  // Update the rankings display
  displayAmericanoRankings();

  // Persist entered scores so they survive a page refresh
  if (typeof saveTournamentData === "function") saveTournamentData();
}

// Display the rankings table (in the side panel)
function displayAmericanoRankings() {
  const rankDiv = qs("americanoRankings");
  if (!rankDiv) return;
  
  // Sort players by rating
  const sortedPlayers = [...americanoState.players].sort((a, b) => {
    return americanoState.playerStats[b].rating - americanoState.playerStats[a].rating;
  });

  // Highlight the top three only once at least one score has been entered
  const anyGames = sortedPlayers.some(p => americanoState.playerStats[p].gamesPlayed > 0);
  
  let html = `
      <table class="board rankings-table${anyGames ? " has-games" : ""}">
        <tr>
          <th>Player</th>
          <th>W-L</th>
          <th>Points</th>
          <th>Diff</th>
          <th>Rating</th>
        </tr>`;
  
  sortedPlayers.forEach(player => {
    const stats = americanoState.playerStats[player];
    html += `
      <tr>
        <td>${escapeHtml(player)}</td>
        <td>${stats.gamesWon}-${stats.gamesLost}</td>
        <td>${stats.pointsFor}-${stats.pointsAgainst}</td>
        <td>${stats.pointDiff > 0 ? '+' : ''}${stats.pointDiff}</td>
        <td>${Math.round(stats.rating)}</td>
      </tr>`;
  });
  
  html += `
      </table>`;
  
  rankDiv.innerHTML = html;
}

// Show statistics for debugging and verification
function showAmericanoStats() {
  if (!americanoState.players || americanoState.players.length === 0) {
    console.log("No Americano tournament in progress.");
    return;
  }
  
  console.log("\n=== AMERICANO STATISTICS ===");
  console.log(`Total Rounds: ${americanoState.roundCounter}`);
  console.log(`Players: ${americanoState.players.join(", ")}\n`);
  
  console.log("PARTNERSHIP COUNTS (who played WITH whom):");
  const sortedPairs = Object.entries(americanoState.playedPairs)
    .sort((a, b) => b[1] - a[1]);
  
  sortedPairs.forEach(([pair, count]) => {
    console.log(`  ${pair.replace("|", " & ")}: ${count} time(s)`);
  });
  
  console.log("\nOPPONENT COUNTS (who played AGAINST whom):");
  const sortedOpponents = Object.entries(americanoState.playedOpponents)
    .sort((a, b) => b[1] - a[1]);
  
  sortedOpponents.forEach(([pair, count]) => {
    console.log(`  ${pair.replace("|", " vs ")}: ${count} time(s)`);
  });
  
  // Calculate fairness metrics
  const partnerCounts = Object.values(americanoState.playedPairs);
  const opponentCounts = Object.values(americanoState.playedOpponents);
  
  const avgPartners = partnerCounts.reduce((a,b) => a+b, 0) / partnerCounts.length;
  const avgOpponents = opponentCounts.reduce((a,b) => a+b, 0) / opponentCounts.length;
  
  const maxPartner = Math.max(...partnerCounts);
  const minPartner = Math.min(...partnerCounts);
  const maxOpponent = Math.max(...opponentCounts);
  const minOpponent = Math.min(...opponentCounts);
  
  console.log("\nFAIRNESS METRICS:");
  console.log(`  Partnerships - Min: ${minPartner}, Max: ${maxPartner}, Avg: ${avgPartners.toFixed(2)}, Range: ${maxPartner - minPartner}`);
  console.log(`  Opponents - Min: ${minOpponent}, Max: ${maxOpponent}, Avg: ${avgOpponents.toFixed(2)}, Range: ${maxOpponent - minOpponent}`);
  console.log("\nNote: Lower range values indicate better fairness/rotation.");
  console.log("Call showAmericanoStats() in console to see these stats anytime.\n");
}

// Rebuild an in-progress Americano tournament from persisted data (page refresh)
function restoreAmericano(saved, courts){
  americanoState.players = saved.players || [];
  americanoState.courts = courts;
  americanoState.playedPairs = saved.playedPairs || {};
  americanoState.playedOpponents = saved.playedOpponents || {};
  americanoState.sitQueue = saved.sitQueue || [...americanoState.players];
  americanoState.rankedMode = !!saved.rankedMode;
  americanoState.rounds = [];
  americanoState.roundCounter = 0;

  // Fresh stats; ratings get recomputed from restored scores below
  americanoState.playerStats = {};
  americanoState.players.forEach(p => {
    americanoState.playerStats[p] = {
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
      pointsFor: 0, pointsAgainst: 0, pointDiff: 0, rating: 1000
    };
  });

  // Re-render every saved round exactly as it was scheduled
  (saved.rounds || []).forEach(rd => {
    americanoState.rounds.push(rd);
    renderAmericanoRound(americanoState.roundCounter + 1, rd);
    americanoState.roundCounter++;
  });

  // Restore entered scores (ranked mode) into the recreated inputs
  if (americanoState.rankedMode && Array.isArray(saved.scores)) {
    saved.scores.forEach(s => {
      const roundDiv = qs("americanoOutput")
        .querySelector(`.round[data-round-num="${s.round}"]`);
      if (!roundDiv) return;
      const courtDiv = roundDiv.querySelectorAll(".court")[s.court];
      if (!courtDiv) return;
      const inputs = courtDiv.querySelectorAll(".americano-score-input");
      if (inputs.length === 2) {
        inputs[0].value = s.a;
        inputs[1].value = s.b;
      }
    });
  }

  // The "Next round" button is rebuilt with the round header (Ui.js)

  // Recompute ratings/standings from the restored scores
  if (americanoState.rankedMode) {
    updateAmericanoRankings();
  }
}

// Backward compatibility
function generateAmericano(players, courts){ startAmericano(players,courts); }
