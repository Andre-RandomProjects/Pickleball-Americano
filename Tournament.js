
function generateTeamRounds(teams, courts) {
    // 1. Generate a flat list of all unique matches using the Circle Method
    let list = [...teams];
    if (list.length % 2 !== 0) {
        list.push("BYE"); // Add a dummy team for odd numbers to make pairing simple
    }

    const n = list.length;
    const totalLogicalRounds = n - 1;
    const allMatches = [];

    for (let r = 0; r < totalLogicalRounds; r++) {
        for (let i = 0; i < n / 2; i++) {
            const teamA = list[i];
            const teamB = list[n - 1 - i];
            if (teamA !== "BYE" && teamB !== "BYE") {
                allMatches.push([teamA, teamB]);
            }
        }
        // Rotate the array for the next logical round, keeping the first element fixed
        const last = list.pop();
        list.splice(1, 0, last);
    }

    // 2. Group all matches into physical rounds based on court availability
    const physicalRounds = [];
    for (let i = 0; i < allMatches.length; i += courts) {
        const roundMatches = allMatches.slice(i, i + courts);
        
        // For each physical round, determine who is playing and who is sitting out
        const playingTeams = new Set();
        roundMatches.forEach(match => {
            playingTeams.add(match[0]);
            playingTeams.add(match[1]);
        });
        
        const sitOutTeams = teams.filter(team => !playingTeams.has(team));
        
        physicalRounds.push({
                    matches: roundMatches,
                    sitOut: sitOutTeams
                });
            }
            return physicalRounds;
        }

function renderTeamRound(num, r) {
    const div = document.createElement("div");
    div.className = "round";
    div.innerHTML = `<div class="round-header"><h3>Round ${num}</h3></div>`;
    const courtsDiv = document.createElement("div");
    courtsDiv.className = "courts";

    const totalCourts = parseInt(qs("courts").value);
    
    // Display matches
    // If matches > totalCourts, what to do?
    // Just list them. They will appear as Court 5, 6 etc. unless we cap it.
    // But physically they don't exist.
    // For now, let's list all matches.
    
    r.matches.forEach((m, i) => {
        courtsDiv.innerHTML += `
      <div class="court">
        <div class="court-title">Court ${i + 1}</div>
        <div class="vs">${m[0]} vs ${m[1]}</div>
        <div>
          <input class="score-input" type="number" placeholder="0"> :
          <input class="score-input" type="number" placeholder="0">
        </div>
      </div>`;
    });

    // Fill unused courts if any
    for (let i = r.matches.length; i < totalCourts; i++) {
        courtsDiv.innerHTML += `
      <div class="court" style="background:#ffe0e0; opacity:0.5;">
        <div class="court-title">Court ${i + 1}</div>
        <div class="vs">Unused</div>
      </div>`;
    }

    div.appendChild(courtsDiv);
    
    if(r.sitOut.length > 0) {
        const sit = document.createElement("div");
        sit.className = "sitout";
        sit.innerHTML = `<strong>Sit out:</strong> ${r.sitOut.join(", ")}`;
        div.appendChild(sit);
    }
    
    qs("rounds").appendChild(div);
}

function buildScoreboard(teams) {
    const data = {};
    teams.forEach(t => data[t] = { won: 0, lost: 0, points: 0, diff: 0 });

    function update() {
        // Reset
        teams.forEach(t => data[t] = { won: 0, lost: 0, points: 0, diff: 0 });

        // Gather scores
        document.querySelectorAll(".court").forEach(c => {
            const vs = c.querySelector(".vs");
            const inputs = c.querySelectorAll(".score-input");
            if (!vs || inputs.length !== 2) return;
            
            const text = vs.textContent;
            if(text === "Unused") return;
            
            const parts = text.split(" vs ");
            if(parts.length !== 2) return;
            
            const [a, b] = parts;
            const sa = parseInt(inputs[0].value) || 0;
            const sb = parseInt(inputs[1].value) || 0;
            
            // Only count if inputs are not empty? Or count 0-0?
            // "parseInt" returns NaN if empty string. || 0 makes it 0.
            // Check if user actually typed?
            // Usually we only count played games.
            // But let's assume 0-0 is valid or ignore if both empty.
            if(inputs[0].value === "" && inputs[1].value === "") return;

            data[a].points += sa;
            data[b].points += sb;
            
            data[a].diff += (sa - sb);
            data[b].diff += (sb - sa);

            if (sa > sb) { data[a].won++; data[b].lost++; }
            else if (sb > sa) { data[b].won++; data[a].lost++; }
            // Tie? Usually doesn't count as win/loss or maybe draw. 
            // Current logic ignores ties for won/lost.
        });

        const sorted = [...teams].sort((x, y) => {
            if (data[y].won !== data[x].won) return data[y].won - data[x].won; // Most wins
            if (data[y].diff !== data[x].diff) return data[y].diff - data[x].diff; // Best diff
            return data[y].points - data[x].points; // Most points
        });

        let html = `<table><tr><th>Team</th><th>Won</th><th>Lost</th><th>Diff</th><th>Points</th></tr>`;
        sorted.forEach(t => {
            html += `<tr>
                <td>${t}</td>
                <td>${data[t].won}</td>
                <td>${data[t].lost}</td>
                <td>${data[t].diff > 0 ? "+" + data[t].diff : data[t].diff}</td>
                <td>${data[t].points}</td>
            </tr>`;
        });
        html += "</table>";
        qs("score").innerHTML = html;
        
        // Save scores to localStorage
        if (typeof saveTournamentData === 'function') {
            saveTournamentData();
        }
    }

    // Attach listeners
    // Note: renderTeamRound appends elements dynamically. 
    // We need to attach listeners to the container or re-attach.
    // Event delegation on 'document' is already set up in the previous file?
    // "document.addEventListener("input", ...)" was in the previous code.
    // Let's keep it here to ensure it works.
    
    // Remove old listener if any? Hard to remove anonymous.
    // We can just rely on one global listener if we put it outside, 
    // but here we are inside a function called by generate().
    // If we add it every time, we get duplicates.
    // Better to have a named function or check.
    
    // Let's use a global handler on #rounds or document that delegates.
    if(!window.scoreboardListenerAdded){
        document.addEventListener("input", e => {
            if (e.target.classList.contains("score-input")) update();
        });
        window.scoreboardListenerAdded = true;
    }
    
    update();
}
