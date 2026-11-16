function qs(id){ return document.getElementById(id); }

// Make user-typed names safe to put into HTML
function escapeHtml(str){
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Read the courts box; returns an integer 1-4 or null if invalid
function readCourts(){
  const c = Number(qs("courts").value);
  return (Number.isInteger(c) && c >= 1 && c <= 4) ? c : null;
}

// RULE: every selected court must be used in every round.
// Returns a warning message if there are not enough entries to fill them, else "".
function notEnoughForCourts(mode, count, courts){
  const perCourt = mode === "teams" ? 2 : 4;
  const needed = courts * perCourt;
  if (count >= needed) return "";
  const what = mode === "teams" ? "teams" : "players";
  return `Not enough ${what} to use all ${courts} court(s). Needed: at least ${needed}, Found: ${count}. Add ${what} or lower the number of courts.`;
}

// Names that appear more than once (case-insensitive)
function findDuplicates(entries){
  const seen = new Map(), dups = new Set();
  entries.forEach(e => {
    const k = e.toLowerCase();
    if (seen.has(k)) dups.add(seen.get(k)); else seen.set(k, e);
  });
  return [...dups];
}

function showWarning(msg){
  const w = qs("warning");
  if(!w) return;
  w.textContent = msg;
  w.className = "warning";
  w.style.display = "block";
}

function hideWarning(){
  const w = qs("warning");
  if(!w) return;
  w.textContent = "";
  w.style.display = "none";
  w.className = "";
}

// LocalStorage functions
function saveTournamentData() {
  const data = {
    mode: qs("mode").value,
    entries: qs("entries").value,
    courts: qs("courts").value,
    timestamp: new Date().toISOString()
  };
  
  // Save scores for Teams mode
  if (qs("mode").value === "teams") {
    const scores = [];
    document.querySelectorAll("#rounds .court").forEach(c => {
      const inputs = c.querySelectorAll(".score-input");
      if (inputs.length === 2 && c.dataset.teamA !== undefined) {
        scores.push({
          bonus: !!c.dataset.bonus,
          team1: c.dataset.teamA,
          team2: c.dataset.teamB,
          score1: inputs[0].value,
          score2: inputs[1].value
        });
      }
    });
    data.scores = scores;
  }

  // Save schedule + scores for Americano modes so a refresh reproduces them
  if ((qs("mode").value === "americano" || qs("mode").value === "americano-ranked")
      && typeof americanoState !== "undefined"
      && americanoState.players && americanoState.players.length) {

    const americanoScores = [];
    document.querySelectorAll("#americanoOutput .round").forEach(roundDiv => {
      const roundNum = parseInt(roundDiv.dataset.roundNum);
      roundDiv.querySelectorAll(".court").forEach((courtDiv, courtIdx) => {
        const inputs = courtDiv.querySelectorAll(".americano-score-input");
        if (inputs.length === 2 && (inputs[0].value !== "" || inputs[1].value !== "")) {
          americanoScores.push({
            round: roundNum,
            court: courtIdx,
            a: inputs[0].value,
            b: inputs[1].value
          });
        }
      });
    });

    data.americano = {
      players: americanoState.players,
      playedPairs: americanoState.playedPairs,
      playedOpponents: americanoState.playedOpponents,
      sitQueue: americanoState.sitQueue,
      roundCounter: americanoState.roundCounter,
      rankedMode: americanoState.rankedMode,
      rounds: americanoState.rounds,
      scores: americanoScores
    };
  }
  
  localStorage.setItem('pickleballTournament', JSON.stringify(data));
}

function loadTournamentData() {
  const saved = localStorage.getItem('pickleballTournament');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      qs("mode").value = data.mode || 'teams';
      qs("entries").value = data.entries || '';
      qs("courts").value = data.courts || 2;
      
      // Store scores data for later restoration
      if (data.scores) {
        window.savedScores = data.scores;
      }

      // Store Americano schedule/state for later restoration
      window.savedAmericano = data.americano || null;
      
      return true;
    } catch (e) {
      console.error('Error loading saved data:', e);
      return false;
    }
  }
  return false;
}

function clearTournamentData() {
  localStorage.removeItem('pickleballTournament');
}

function clearAll(){
  if(qs("output")) qs("output").innerHTML="";
  hideWarning();
  if(qs("scoreboard")) qs("scoreboard").innerHTML="";
  if(qs("rounds")) qs("rounds").innerHTML="";
  if(qs("score")) qs("score").innerHTML="";
  if(qs("americanoOutput")) qs("americanoOutput").innerHTML="";
  if(qs("teamsTabs")) qs("teamsTabs").style.display="none";
}

function resetAll(){
  if(!confirm("Reset everything?")) return;
  qs("entries").value="";
  qs("courts").value=2;
  clearAll();
  clearTournamentData(); // Clear localStorage data
}

function switchTab(tab){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));
  qs(tab).classList.add("active");
  event.currentTarget.classList.add("active");
}

function generate(){
  clearAll();
  hideWarning();
  const mode = qs("mode").value;
  const entries = qs("entries").value.split("\n").map(x=>x.trim()).filter(Boolean);
  const courts = readCourts();

  if(courts === null){
    showWarning("Number of courts must be a whole number from 1 to 4.");
    return;
  }
  const dups = findDuplicates(entries);
  if(dups.length){
    showWarning(`Each name must be unique. Duplicated: ${dups.join(", ")}.`);
    return;
  }

  if(mode==="teams"){
    const short = notEnoughForCourts(mode, entries.length, courts);
    if(short){ showWarning(short); return; }
    qs("teamsTabs").style.display="block";
    const rounds = generateTeamRounds(entries,courts);
    rounds.forEach((r,i)=>renderTeamRound(i+1,r,courts));
    buildScoreboard(entries);
    saveTournamentData(); // Save after successful generation
  }

  if(mode==="americano" || mode==="americano-ranked"){
    const short = notEnoughForCourts(mode, entries.length, courts);
    if(short){ showWarning(short); return; }
    const rankedMode = (mode === "americano-ranked");
    startAmericano(entries, courts, rankedMode); // progressive next round
    saveTournamentData(); // Save after successful generation
  }
}

// Export functionality
function exportData() {
  const mode = qs("mode").value;
  const entries = qs("entries").value.split("\n").map(x=>x.trim()).filter(Boolean);
  const courts = parseInt(qs("courts").value);
  
  if (entries.length === 0) {
    alert("Please enter players/teams first.");
    return;
  }
  
  if (mode === "teams") {
    exportTeamsData(entries, courts);
  } else {
    exportAmericanoData(entries, courts);
  }
}

function exportTeamsData(teams, courts) {
  let csvContent = "data:text/csv;charset=utf-8,";

  // Header
  csvContent += "Pickleball Tournament Export\n\n";
  csvContent += `Mode;"Singles/Teams"\n`;
  csvContent += `Teams;"${teams.join(", ")}"\n`;
  csvContent += `Courts;"${courts}"\n`;
  csvContent += `Date;"${new Date().toLocaleDateString()}"\n\n`;

  // Scoreboard section
  csvContent += "SCOREBOARD\n";
  csvContent += "Team;Won;Lost;Points;Diff\n";

  const scoreboard = document.querySelector("#score table");
  if (scoreboard) {
    const rows = scoreboard.querySelectorAll("tr");
    rows.forEach((row, index) => {
      if (index === 0) return; // Skip header
      const cells = row.querySelectorAll("td");
      if (cells.length === 5) {
        csvContent += `"${cells[0].textContent}";${cells[1].textContent};${cells[2].textContent};${cells[4].textContent};${cells[3].textContent}\n`;
      }
    });
  }
  csvContent += "\n"; // Add a blank line for spacing

  // Rounds & Scores section
  csvContent += "ROUNDS & SCORES\n";
  csvContent += "Round;Court;Team 1;Score 1;Team 2;Score 2\n";

  const rounds = document.querySelectorAll("#rounds .round");
  rounds.forEach((round, roundIndex) => {
    const roundNum = roundIndex + 1;
    const courts = round.querySelectorAll(".court");

    courts.forEach((court, courtIndex) => {
      const inputs = court.querySelectorAll(".score-input");
      if (court.dataset.teamA !== undefined && inputs.length === 2) {
        const score1 = inputs[0].value || "0";
        const score2 = inputs[1].value || "0";
        const label = court.dataset.bonus ? `Court ${courtIndex + 1} (Bonus - not counted)` : `Court ${courtIndex + 1}`;
        csvContent += `${roundNum};${label};${csvCell(court.dataset.teamA)};${score1};${csvCell(court.dataset.teamB)};${score2}\n`;
      }
    });
  });

  downloadCSV(csvContent, "tournament_export.csv");
}

function exportAmericanoData(players, courts) {
  // Built from the stored schedule (americanoState.rounds), not from page markup
  if (typeof americanoState === "undefined" || !americanoState.rounds || !americanoState.rounds.length) {
    alert("Generate a schedule first.");
    return;
  }
  const ranked = !!americanoState.rankedMode;
  let csvContent = "data:text/csv;charset=utf-8,";

  // Header
  csvContent += "Pickleball Tournament Export\n\n";
  csvContent += `Mode;${csvCell(ranked ? "Doubles (Americano - Ranked)" : "Doubles (Americano)")}\n`;
  csvContent += `Players;${csvCell(americanoState.players.join(", "))}\n`;
  csvContent += `Courts;"${americanoState.courts}"\n`;
  csvContent += `Date;"${new Date().toLocaleDateString()}"\n\n`;

  // Rankings (ranked mode)
  if (ranked) {
    csvContent += "RANKINGS\n";
    csvContent += "Rank;Player;Rating;Games;Won;Lost;Points For;Points Against;Diff\n";
    [...americanoState.players]
      .sort((a, b) => americanoState.playerStats[b].rating - americanoState.playerStats[a].rating)
      .forEach((p, i) => {
        const s = americanoState.playerStats[p];
        csvContent += `${i + 1};${csvCell(p)};${Math.round(s.rating)};${s.gamesPlayed};${s.gamesWon};${s.gamesLost};${s.pointsFor};${s.pointsAgainst};${s.pointDiff}\n`;
      });
    csvContent += "\n";
  }

  // Rounds section
  csvContent += "ROUNDS\n";
  csvContent += ranked
    ? "Round;Court;Player 1;Player 2;Score;vs;Score;Player 3;Player 4;Sitting Out\n"
    : "Round;Court;Player 1;Player 2;vs;Player 3;Player 4;Sitting Out\n";

  const roundDivs = qs("americanoOutput") ? qs("americanoOutput").querySelectorAll(".round") : [];
  americanoState.rounds.forEach((r, ri) => {
    const sittingOut = csvCell(r.sit.join(", "));
    const courtDivs = roundDivs[ri] ? roundDivs[ri].querySelectorAll(".court") : [];
    r.matches.forEach((m, ci) => {
      if (ranked) {
        const ins = courtDivs[ci] ? courtDivs[ci].querySelectorAll(".americano-score-input") : [];
        const sa = ins[0] ? ins[0].value : "", sb = ins[1] ? ins[1].value : "";
        csvContent += `${ri + 1};Court ${ci + 1};${csvCell(m.A[0])};${csvCell(m.A[1])};${sa};vs;${sb};${csvCell(m.B[0])};${csvCell(m.B[1])};${sittingOut}\n`;
      } else {
        csvContent += `${ri + 1};Court ${ci + 1};${csvCell(m.A[0])};${csvCell(m.A[1])};vs;${csvCell(m.B[0])};${csvCell(m.B[1])};${sittingOut}\n`;
      }
    });
  });

  downloadCSV(csvContent, ranked ? "americano_ranked_export.csv" : "americano_export.csv");
}

// Quote a CSV cell (handles quotes inside names)
function csvCell(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function downloadCSV(csvContent, filename) {
  const prefix = "data:text/csv;charset=utf-8,";
  const body = csvContent.startsWith(prefix) ? csvContent.slice(prefix.length) : csvContent;
  const encodedUri = prefix + encodeURIComponent("\uFEFF" + body); // BOM so Excel reads accents correctly
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Function to restore scores from saved data
function restoreScores(savedScores) {
  document.querySelectorAll("#rounds .court").forEach(c => {
    const inputs = c.querySelectorAll(".score-input");
    if (inputs.length === 2 && c.dataset.teamA !== undefined) {
      const team1 = c.dataset.teamA;
      const team2 = c.dataset.teamB;
      const isBonus = !!c.dataset.bonus;
      const same = s => !!s.bonus === isBonus;
      const savedScore = savedScores.find(s => same(s) && s.team1 === team1 && s.team2 === team2);
      const swapped = !savedScore && savedScores.find(s => same(s) && s.team1 === team2 && s.team2 === team1);
      if (savedScore) {
        inputs[0].value = savedScore.score1;
        inputs[1].value = savedScore.score2;
      } else if (swapped) {
        // Scores were saved the other way round - put each score with its own team
        inputs[0].value = swapped.score2;
        inputs[1].value = swapped.score1;
      }
    }
  });
  
  // Trigger scoreboard update
  const event = new Event('input', { bubbles: true });
  document.querySelector(".score-input")?.dispatchEvent(event);
}

// Page load restoration function
function restoreFromStorage() {
  if (loadTournamentData()) {
    // If we have saved data, automatically generate the rounds
    hideWarning();
    const mode = qs("mode").value;
    const entries = qs("entries").value.split("\n").map(x=>x.trim()).filter(Boolean);
    const courts = readCourts();
    
    if (entries.length > 0 && courts !== null && findDuplicates(entries).length === 0) {
      if (mode === "teams" && !notEnoughForCourts(mode, entries.length, courts)) {
        qs("teamsTabs").style.display="block";
        const rounds = generateTeamRounds(entries,courts);
        rounds.forEach((r,i)=>renderTeamRound(i+1,r,courts));
        buildScoreboard(entries);
        
        // Restore scores if available
        if (window.savedScores && window.savedScores.length > 0) {
          restoreScores(window.savedScores);
        }
      } else if ((mode === "americano" || mode === "americano-ranked") && !notEnoughForCourts(mode, entries.length, courts)) {
        const rankedMode = (mode === "americano-ranked");
        // If we have a saved schedule, reproduce it exactly (and restore scores);
        // otherwise generate a fresh tournament.
        if (window.savedAmericano && Array.isArray(window.savedAmericano.rounds) && window.savedAmericano.rounds.length > 0) {
          restoreAmericano(window.savedAmericano, courts);
        } else {
          startAmericano(entries, courts, rankedMode);
        }
      }
    }
  }
}
