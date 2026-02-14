let americanoState = {
  players: [],
  courts: 2,
  playedPairs: {}, // Tracks partnerships (who played WITH whom)
  playedOpponents: {}, // Tracks opponents (who played AGAINST whom)
  sitQueue: [],
  roundCounter: 0,
  rankedMode: false, // Whether to use ranking-based matchmaking
  playerStats: {} // Individual player statistics for ranking
};

function startAmericano(players, courts, rankedMode = false){
  // Shuffle players initially
  americanoState.players = [...players].sort(() => Math.random() - 0.5);
  americanoState.courts = courts;
  americanoState.playedPairs = {}; // Reset pairs count
  americanoState.playedOpponents = {}; // Reset opponents count
  americanoState.sitQueue = [...americanoState.players]; // Full queue initially
  americanoState.roundCounter = 0;
  americanoState.rankedMode = rankedMode;
  
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
  // Remove previous "Next Round" button if it exists
  const oldBtn = qs("americanoOutput").querySelector(".next-round-btn");
  if(oldBtn) oldBtn.remove();

  // In ranked mode, update rankings before generating next round (except first round)
  if(americanoState.rankedMode && americanoState.roundCounter > 0) {
    updateAmericanoRankings();
  }

  const roundData = generateAmericanoRound();
  renderAmericanoRound(americanoState.roundCounter + 1, roundData);

  // Next round button
  if(americanoState.roundCounter < americanoState.players.length*2){ // heuristic limit
    const btn = document.createElement("button");
    btn.textContent="Next Round";
    btn.className = "next-round-btn generate"; // Use 'generate' class for blue styling
    btn.style.marginTop = "20px";
    btn.onclick=americanoNextRound;
    qs("americanoOutput").appendChild(btn);
  }
  americanoState.roundCounter++;
  
  // Initialize rankings display in ranked mode
  if(americanoState.rankedMode && americanoState.roundCounter === 1) {
    displayAmericanoRankings();
  }
}

function generateAmericanoRound(){
  const {players, courts, sitQueue, playedPairs, playedOpponents} = americanoState;
  
  // Calculate how many can play (multiple of 4, limited by courts)
  const maxPlayable = Math.floor(players.length / 4) * 4;
  const actualPlaying = Math.min(courts * 4, maxPlayable);
  let sitCount = players.length - actualPlaying;

  // Strict Sit-Out Rotation
  // sitQueue contains players in order of "due to sit out".
  // The first 'sitCount' players in the queue MUST sit out.
  const sitOut = sitQueue.slice(0, sitCount);
  
  // Update Queue: Remove sitters from front, add to back
  // This ensures they wait the longest before sitting again.
  const newQueue = sitQueue.slice(sitCount); // Everyone else
  newQueue.push(...sitOut); // Add sitters to end
  americanoState.sitQueue = newQueue;

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

  return {matches,sit:sitOut};
}

// Deterministic Backtracking Solver for optimal pairings with opponent tracking
function solveBestMatches(players, courts, playedPairs, playedOpponents, rankedMode = false, playerStats = {}) {
  let bestSolution = null;
  let minTotalCost = Infinity;

  // We need to partition players into 'courts * 2' pairs (to form 'courts' matches)
  // Step 1: Find optimal partner pairings
  // Step 2: Find optimal opponent matchings (with ranking consideration if ranked mode)

  function findPartition(currentPairs, usedPlayersMask) {
    // Base case: We have enough pairs to cover all players
    if (currentPairs.length === players.length / 2) {
      // Calculate partnership cost
      let partnershipCost = currentPairs.reduce((sum, p) => sum + Math.pow(p.cost, 3), 0);
      
      // In ranked mode, add penalty for mismatched skill levels in partnerships
      if (rankedMode && Object.keys(playerStats).length > 0) {
        currentPairs.forEach(pair => {
          const rating1 = playerStats[pair.p1]?.rating || 1000;
          const rating2 = playerStats[pair.p2]?.rating || 1000;
          const ratingDiff = Math.abs(rating1 - rating2);
          // Small penalty for skill mismatch in partnerships (we want balanced teams)
          partnershipCost += ratingDiff * 0.1;
        });
      }
      
      if (partnershipCost < minTotalCost) {
        minTotalCost = partnershipCost;
        bestSolution = [...currentPairs];
      }
      return;
    }

    // Find first unused player
    let firstUnused = -1;
    for(let i=0; i<players.length; i++) {
      if (!usedPlayersMask[i]) {
        firstUnused = i;
        break;
      }
    }
    
    if (firstUnused === -1) return;

    const p1 = players[firstUnused];

    // Try to pair p1 with every other unused player
    for (let i = firstUnused + 1; i < players.length; i++) {
      if (!usedPlayersMask[i]) {
        const p2 = players[i];
        
        // Calculate partnership cost
        const key = [p1, p2].sort().join("|");
        const cost = playedPairs[key] || 0;
        
        // Pruning: Skip if this pair alone exceeds current best
        if (Math.pow(cost, 3) >= minTotalCost) continue;

        // Recurse
        usedPlayersMask[firstUnused] = true;
        usedPlayersMask[i] = true;
        currentPairs.push({ p1, p2, cost, key });

        findPartition(currentPairs, usedPlayersMask);
        
        // Early exit if perfect solution found (only in non-ranked mode)
        if (minTotalCost === 0 && !rankedMode) return;
        
        // Backtrack
        currentPairs.pop();
        usedPlayersMask[firstUnused] = false;
        usedPlayersMask[i] = false;
      }
    }
  }

  // Find best partner pairings
  findPartition([], new Array(players.length).fill(false));

  if (!bestSolution) {
    console.error("No solution found in backtracking!");
    return [];
  }

  // Step 2: Group pairs into matches, minimizing opponent repetition
  // In ranked mode, also consider skill-based matchmaking
  const matchCombinations = findBestMatchPairing(bestSolution, playedOpponents, rankedMode, playerStats);
  
  return matchCombinations;
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

  let bestMatches = null;
  let minOpponentCost = Infinity;

  // Helper to calculate team average rating
  function getTeamRating(team) {
    if (!rankedMode || Object.keys(playerStats).length === 0) return 1000;
    const ratings = team.map(p => playerStats[p]?.rating || 1000);
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  // Recursive function to try all pairings
  function tryPairings(remainingPairs, currentMatches) {
    if (remainingPairs.length === 0) {
      // Calculate total cost for this configuration
      let opponentCost = 0;
      let rankingCost = 0;
      
      currentMatches.forEach(match => {
        // Check how many times these players have faced each other
        match.A.forEach(p1 => {
          match.B.forEach(p2 => {
            const key = [p1, p2].sort().join("|");
            const count = playedOpponents[key] || 0;
            opponentCost += Math.pow(count, 2); // Quadratic penalty for opponent repetition
          });
        });
        
        // In ranked mode, penalize mismatched team ratings
        if (rankedMode) {
          const teamARating = getTeamRating(match.A);
          const teamBRating = getTeamRating(match.B);
          const ratingDiff = Math.abs(teamARating - teamBRating);
          
          // Strong penalty for mismatched teams (we want competitive matches)
          rankingCost += Math.pow(ratingDiff / 100, 2);
        }
      });
      
      // Combine costs (ranking cost is more important in ranked mode)
      const totalCost = rankedMode ? (opponentCost + rankingCost * 5) : opponentCost;

      if (totalCost < minOpponentCost) {
        minOpponentCost = totalCost;
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
  
  // Use h3 for better structure, matching CSS expectations if any (though CSS targets .round-header h3)
  div.innerHTML=`<div class="round-header"><h3>Round ${num}</h3></div>`;
  
  const courtsDiv=document.createElement("div");
  courtsDiv.className="courts";
  
  r.matches.forEach((m,i)=>{
    const teamA = m.A.join(" & ");
    const teamB = m.B.join(" & ");
    
    if (americanoState.rankedMode) {
      // Ranked mode: Add score inputs
      courtsDiv.innerHTML+=`<div class="court" data-court="${i}" data-round="${num}">
        <div class="court-title">Court ${i+1}</div>
        <div class="vs">${teamA}<br>vs<br>${teamB}</div>
        <div class="score-container">
          <input class="americano-score-input" type="number" placeholder="0" min="0" data-team="A"> :
          <input class="americano-score-input" type="number" placeholder="0" min="0" data-team="B">
        </div>
      </div>`;
    } else {
      // Regular mode: No score inputs
      courtsDiv.innerHTML+=`<div class="court">
        <div class="court-title">Court ${i+1}</div>
        <div class="vs">${teamA}<br>vs<br>${teamB}</div>
      </div>`;
    }
  });
  div.appendChild(courtsDiv);
  
  if(r.sit.length){
    const sitDiv=document.createElement("div");
    sitDiv.className="sitout";
    sitDiv.innerHTML=`<strong>Sit out:</strong> ${r.sit.join(", ")}`;
    div.appendChild(sitDiv);
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
  document.querySelectorAll('.round').forEach(roundDiv => {
    const roundNum = parseInt(roundDiv.dataset.roundNum);
    
    roundDiv.querySelectorAll('.court').forEach(courtDiv => {
      const inputs = courtDiv.querySelectorAll('.americano-score-input');
      if (inputs.length !== 2) return;
      
      const scoreA = parseInt(inputs[0].value) || 0;
      const scoreB = parseInt(inputs[1].value) || 0;
      
      // Only process if scores are entered
      if (inputs[0].value === "" && inputs[1].value === "") return;
      
      // Extract player names from vs text
      const vsDiv = courtDiv.querySelector('.vs');
      const vsText = vsDiv.textContent;
      const parts = vsText.split('vs');
      
      if (parts.length !== 2) return;
      
      const teamAText = parts[0].trim();
      const teamBText = parts[1].trim();
      
      const teamA = teamAText.split('&').map(p => p.trim());
      const teamB = teamBText.split('&').map(p => p.trim());
      
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
}

// Display the rankings table
function displayAmericanoRankings() {
  let rankDiv = qs("americanoRankings");
  
  if (!rankDiv) {
    // Create rankings div if it doesn't exist
    rankDiv = document.createElement("div");
    rankDiv.id = "americanoRankings";
    rankDiv.style.marginTop = "20px";
    
    // Insert before the first round
    const firstRound = qs("americanoOutput").querySelector('.round');
    if (firstRound) {
      qs("americanoOutput").insertBefore(rankDiv, firstRound);
    } else {
      qs("americanoOutput").appendChild(rankDiv);
    }
  }
  
  // Sort players by rating
  const sortedPlayers = [...americanoState.players].sort((a, b) => {
    return americanoState.playerStats[b].rating - americanoState.playerStats[a].rating;
  });
  
  let html = `
    <div class="rankings-container">
      <h3>Player Rankings</h3>
      <table class="rankings-table">
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Rating</th>
          <th>Games</th>
          <th>W-L</th>
          <th>Points</th>
          <th>Diff</th>
        </tr>`;
  
  sortedPlayers.forEach((player, index) => {
    const stats = americanoState.playerStats[player];
    const rank = index + 1;
    const tier = rank <= sortedPlayers.length / 3 ? 'top-tier' : 
                 rank <= sortedPlayers.length * 2 / 3 ? 'mid-tier' : 'low-tier';
    
    html += `
      <tr class="${tier}">
        <td>${rank}</td>
        <td><strong>${player}</strong></td>
        <td>${Math.round(stats.rating)}</td>
        <td>${stats.gamesPlayed}</td>
        <td>${stats.gamesWon}-${stats.gamesLost}</td>
        <td>${stats.pointsFor}-${stats.pointsAgainst}</td>
        <td>${stats.pointDiff > 0 ? '+' : ''}${stats.pointDiff}</td>
      </tr>`;
  });
  
  html += `
      </table>
    </div>`;
  
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

// Backward compatibility
function generateAmericano(players, courts){ startAmericano(players,courts); }
