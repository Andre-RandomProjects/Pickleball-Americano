let americanoState = {
  players: [],
  courts: 2,
  playedPairs: {}, // Changed from Set to Object for counting
  sitQueue: [],
  roundCounter: 0
};

function startAmericano(players, courts){
  // Shuffle players initially
  americanoState.players = [...players].sort(() => Math.random() - 0.5);
  americanoState.courts = courts;
  americanoState.playedPairs = {}; // Reset pairs count
  americanoState.sitQueue = [...americanoState.players]; // Full queue initially
  americanoState.roundCounter = 0;
  
  // Initialize play counts to 0
  for(let i=0; i<players.length; i++){
    for(let j=i+1; j<players.length; j++){
       const p1 = players[i];
       const p2 = players[j];
       const key = [p1,p2].sort().join("|");
       americanoState.playedPairs[key] = 0;
    }
  }
  
  americanoNextRound();
}

function americanoNextRound(){
  // Remove previous "Next Round" button if it exists
  const oldBtn = qs("americanoOutput").querySelector(".next-round-btn");
  if(oldBtn) oldBtn.remove();

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
}

function generateAmericanoRound(){
  const {players, courts, sitQueue, playedPairs} = americanoState;
  
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
  // Goal: Find a perfect pairing where playCount is minimized for all pairs.
  // Ideally, playCount should be 0 for all selected pairs until everyone has played everyone.
  
  const matches = solveBestMatches(activePlayers, courts, playedPairs);
  
  // Update pair counts
  matches.forEach(m => {
    [m.A, m.B].forEach(team => {
      const key = [...team].sort().join("|");
      if(playedPairs[key] === undefined) playedPairs[key] = 0;
      playedPairs[key]++;
    });
  });

  return {matches,sit:sitOut};
}

// Deterministic Backtracking Solver for optimal pairings
function solveBestMatches(players, courts, playedPairs) {
  let bestSolution = null;
  let minTotalCost = Infinity;

  // Generate all valid unique pairs from the active players
  const allPairs = [];
  for(let i=0; i<players.length; i++){
    for(let j=i+1; j<players.length; j++){
       const p1 = players[i];
       const p2 = players[j];
       const key = [p1,p2].sort().join("|");
       const cost = playedPairs[key] || 0;
       allPairs.push({ p1, p2, cost, key });
    }
  }

  // Sort pairs by cost (asc) to prioritize unplayed pairs
  allPairs.sort((a,b) => a.cost - b.cost);

  // We need to select 'courts * 2' pairs? No.
  // We need 'courts' MATCHES. Each match has 2 pairs (4 players).
  // Total players needed = courts * 4.
  // The input 'players' array already has exactly the number of active players (courts * 4).
  // So we need to partition the players into 'courts * 2' pairs.
  
  // 1. Find a partition of players into pairs that minimizes the sum of costs (play counts).
  // This is a "Minimum Weight Perfect Matching" problem.
  // Since N is small (e.g. 8 or 12), we can use backtracking.

  function findPartition(currentPairs, usedPlayersMask) {
    // Pruning: if current cost already exceeds best, stop (if we want strict optimization)
    // But for "True Americano", finding ANY 0-cost partition is priority.
    
    // Base case: We have enough pairs to cover all players
    // We need (players.length / 2) pairs.
    if (currentPairs.length === players.length / 2) {
      // We have a full set of pairs. Now group them into matches (courts).
      // Grouping into matches doesn't affect "partner" fairness, only "opponent" fairness.
      // For now, random grouping into matches is fine, or simple sequential.
      
      const currentCost = currentPairs.reduce((sum, p) => sum + Math.pow(p.cost, 3), 0); // Cubic penalty
      
      if (currentCost < minTotalCost) {
        minTotalCost = currentCost;
        bestSolution = [...currentPairs];
      }
      return;
    }

    // Try to add next valid pair
    // Optimization: Always pick the first available player to avoid permutations of same set
    // Find first unused player index
    let firstUnused = -1;
    for(let i=0; i<players.length; i++) {
      if (!usedPlayersMask[i]) {
        firstUnused = i;
        break;
      }
    }
    
    if (firstUnused === -1) return; // Should be covered by base case

    const p1 = players[firstUnused];

    // Try to pair p1 with every other unused player
    for (let i = firstUnused + 1; i < players.length; i++) {
      if (!usedPlayersMask[i]) {
        const p2 = players[i];
        
        // Find the cost for this pair
        const key = [p1, p2].sort().join("|");
        const cost = playedPairs[key] || 0;
        
        // Pruning: If this single pair's cost is already > minTotalCost (heuristic), skip
        // (Only works if minTotalCost is small)
        if (Math.pow(cost, 3) >= minTotalCost) continue;

        // Recurse
        usedPlayersMask[firstUnused] = true;
        usedPlayersMask[i] = true;
        currentPairs.push({ p1, p2, cost });

        findPartition(currentPairs, usedPlayersMask);
        
        // Backtrack
        if (minTotalCost === 0) return; // Found perfect solution, stop early!
        
        currentPairs.pop();
        usedPlayersMask[firstUnused] = false;
        usedPlayersMask[i] = false;
      }
    }
  }

  // Start search
  findPartition([], new Array(players.length).fill(false));

  // If no solution found (shouldn't happen with full graph), fallback to something simple?
  // Backtracking above covers all partitions, so it will find the min cost one.
  
  if (!bestSolution) {
    // Should theoretically not happen given the constraints and full connectivity
    console.error("No solution found in backtracking!");
    return []; 
  }

  // Convert pairs into matches
  // bestSolution is array of pairs: [{p1,p2}, {p1,p2}, ...]
  // We need to group them into matches: [{A:[p1,p2], B:[p3,p4]}, ...]
  
  const finalMatches = [];
  // Shuffle pairs to randomize court assignments and opponents
  const shuffledPairs = bestSolution.sort(() => Math.random() - 0.5);
  
  while(shuffledPairs.length >= 2) {
    const pairA = shuffledPairs.pop();
    const pairB = shuffledPairs.pop();
    finalMatches.push({
      A: [pairA.p1, pairA.p2],
      B: [pairB.p1, pairB.p2]
    });
  }
  
  return finalMatches;
}

function renderAmericanoRound(num,r){
  const div=document.createElement("div");
  div.className="round";
  
  // Use h3 for better structure, matching CSS expectations if any (though CSS targets .round-header h3)
  div.innerHTML=`<div class="round-header"><h3>Round ${num}</h3></div>`;
  
  const courtsDiv=document.createElement("div");
  courtsDiv.className="courts";
  
  r.matches.forEach((m,i)=>{
    courtsDiv.innerHTML+=`<div class="court">
      <div class="court-title">Court ${i+1}</div>
      <div class="vs">${m.A.join(" & ")}<br>vs<br>${m.B.join(" & ")}</div>
    </div>`;
  });
  div.appendChild(courtsDiv);
  
  if(r.sit.length){
    const sitDiv=document.createElement("div");
    sitDiv.className="sitout";
    sitDiv.innerHTML=`<strong>Sit out:</strong> ${r.sit.join(", ")}`;
    div.appendChild(sitDiv);
  }
  qs("americanoOutput").appendChild(div);
}

// Backward compatibility
function generateAmericano(players, courts){ startAmericano(players,courts); }
