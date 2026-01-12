function qs(id){ return document.getElementById(id); }

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
    document.querySelectorAll(".court").forEach(c => {
      const vs = c.querySelector(".vs");
      const inputs = c.querySelectorAll(".score-input");
      if (vs && inputs.length === 2 && vs.textContent !== "Unused") {
        const parts = vs.textContent.split(" vs ");
        if (parts.length === 2) {
          scores.push({
            team1: parts[0],
            team2: parts[1],
            score1: inputs[0].value,
            score2: inputs[1].value
          });
        }
      }
    });
    data.scores = scores;
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
  if(qs("warning")) qs("warning").innerHTML="";
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
  const mode = qs("mode").value;
  const entries = qs("entries").value.split("\n").map(x=>x.trim()).filter(Boolean);
  const courts = parseInt(qs("courts").value);

  if(mode==="teams"){
    if(entries.length < courts * 2) {
      qs("warning").innerHTML = `Not enough teams to fill ${courts} courts. Needed: ${courts*2}, Found: ${entries.length}.`;
      return;
    }
    if(entries.length<2){ qs("warning").innerHTML="At least 2 teams required."; return; }
    qs("teamsTabs").style.display="block";
    const rounds = generateTeamRounds(entries,courts);
    rounds.forEach((r,i)=>renderTeamRound(i+1,r));
    buildScoreboard(entries);
    saveTournamentData(); // Save after successful generation
  }

  if(mode==="americano"){
    if(entries.length < courts * 4) {
      qs("warning").innerHTML = `Not enough players to fill ${courts} courts. Needed: ${courts*4}, Found: ${entries.length}.`;
      return;
    }
    if(entries.length < 4){ qs("warning").innerHTML="At least 4 players required."; return; }
    startAmericano(entries,courts); // progressive next round
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

  const rounds = document.querySelectorAll(".round");
  rounds.forEach((round, roundIndex) => {
    const roundNum = roundIndex + 1;
    const courts = round.querySelectorAll(".court");

    courts.forEach((court, courtIndex) => {
      const vs = court.querySelector(".vs");
      const inputs = court.querySelectorAll(".score-input");

      if (vs && vs.textContent !== "Unused" && inputs.length === 2) {
        const parts = vs.textContent.split(" vs ");
        if (parts.length === 2) {
          const score1 = inputs[0].value || "0";
          const score2 = inputs[1].value || "0";
          csvContent += `${roundNum};Court ${courtIndex + 1};"${parts[0]}";${score1};"${parts[1]}";${score2}\n`;
        }
      }
    });
  });

  downloadCSV(csvContent, "tournament_export.csv");
}

function exportAmericanoData(players, courts) {
  let csvContent = "data:text/csv;charset=utf-8,";

  // Header
  csvContent += "Pickleball Tournament Export\n\n";
  csvContent += `Mode;"Doubles (Americano)"\n`;
  csvContent += `Players;"${players.join(", ")}"\n`;
  csvContent += `Courts;"${courts}"\n`;
  csvContent += `Date;"${new Date().toLocaleDateString()}"\n\n`;

  // Rounds section
  csvContent += "ROUNDS\n";
  csvContent += "Round;Court;Player 1;Player 2;vs;Player 3;Player 4;Sitting Out\n";

  const americanoOutput = document.querySelector("#americanoOutput");
  if (americanoOutput) {
    const rounds = americanoOutput.querySelectorAll(".round");
    rounds.forEach((round, roundIndex) => {
      const roundNum = roundIndex + 1;
      const courts = round.querySelectorAll(".court");
      const sitoutDiv = round.querySelector(".sitout");
      const sittingOut = sitoutDiv ? sitoutDiv.textContent.replace("Sitting out: ", "").trim() : "";

      courts.forEach((court, courtIndex) => {
        const courtTitle = court.querySelector(".court-title").textContent;
        const team1 = court.querySelectorAll(".team")[0];
        const team2 = court.querySelectorAll(".team")[1];
        const p1 = team1.querySelectorAll(".player")[0].textContent;
        const p2 = team1.querySelectorAll(".player")[1].textContent;
        const p3 = team2.querySelectorAll(".player")[0].textContent;
        const p4 = team2.querySelectorAll(".player")[1].textContent;

        csvContent += `${roundNum};${courtTitle};"${p1}";"${p2}";vs;"${p3}";"${p4}";"${sittingOut}"\n`;
      });
    });
  }

  downloadCSV(csvContent, "americano_export.csv");
}

function downloadCSV(csvContent, filename) {
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Function to restore scores from saved data
function restoreScores(savedScores) {
  document.querySelectorAll(".court").forEach(c => {
    const vs = c.querySelector(".vs");
    const inputs = c.querySelectorAll(".score-input");
    if (vs && inputs.length === 2 && vs.textContent !== "Unused") {
      const parts = vs.textContent.split(" vs ");
      if (parts.length === 2) {
        const team1 = parts[0];
        const team2 = parts[1];
        
        // Find matching saved score
        const savedScore = savedScores.find(s => 
          (s.team1 === team1 && s.team2 === team2) || 
          (s.team1 === team2 && s.team2 === team1)
        );
        
        if (savedScore) {
          inputs[0].value = savedScore.score1;
          inputs[1].value = savedScore.score2;
        }
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
    const mode = qs("mode").value;
    const entries = qs("entries").value.split("\n").map(x=>x.trim()).filter(Boolean);
    const courts = parseInt(qs("courts").value);
    
    if (entries.length > 0) {
      if (mode === "teams" && entries.length >= courts * 2) {
        qs("teamsTabs").style.display="block";
        const rounds = generateTeamRounds(entries,courts);
        rounds.forEach((r,i)=>renderTeamRound(i+1,r));
        buildScoreboard(entries);
        
        // Restore scores if available
        if (window.savedScores && window.savedScores.length > 0) {
          restoreScores(window.savedScores);
        }
      } else if (mode === "americano" && entries.length >= courts * 4) {
        startAmericano(entries,courts);
      }
    }
  }
}
