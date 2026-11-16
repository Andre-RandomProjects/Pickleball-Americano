
function generateTeamRounds(teams, courts) {
    // Guard: 0, negative or non-numeric courts would loop forever below
    courts = Math.floor(Number(courts));
    if (!(courts >= 1)) return [];
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
            bonus: [],
            sitOut: sitOutTeams
        });
    }

    // 3. Every selected court must be used. If the last round is short, fill the empty
    //    courts with BONUS rematches between teams sitting out. Bonus games are shown with
    //    score boxes but are NOT counted on the scoreboard, so standings stay fair.
    const lastRound = physicalRounds[physicalRounds.length - 1];
    if (lastRound && lastRound.matches.length < courts) {
        // Prefer the teams that have sat out most, then those who played longest ago
        const sits = {}, lastPlayed = {};
        teams.forEach(t => { sits[t] = 0; lastPlayed[t] = -1; });
        physicalRounds.forEach((r, i) => {
            r.sitOut.forEach(t => sits[t]++);
            r.matches.forEach(([a, b]) => { lastPlayed[a] = i; lastPlayed[b] = i; });
        });
        const prevRound = physicalRounds.length - 2;
        const pool = [...lastRound.sitOut].sort((x, y) =>
            (sits[y] - sits[x]) || (lastPlayed[x] - lastPlayed[y]));
        while (lastRound.matches.length + lastRound.bonus.length < courts && pool.length >= 2) {
            const a = pool.shift();
            // Partner choice: avoid a team a just met in the previous round if possible
            let idx = pool.findIndex(b => !(physicalRounds[prevRound] &&
                physicalRounds[prevRound].matches.some(m => m.includes(a) && m.includes(b))));
            if (idx < 0) idx = 0;
            const b = pool.splice(idx, 1)[0];
            lastRound.bonus.push([a, b]);
        }
        const bonusTeams = new Set(lastRound.bonus.flat());
        lastRound.sitOut = lastRound.sitOut.filter(t => !bonusTeams.has(t));
    }
    return physicalRounds;
}

function renderTeamRound(num, r, totalCourts, keepScore) {
    if (keepScore === undefined) keepScore = true;
    const div = document.createElement("div");
    div.className = "round";
    div.dataset.roundNum = num;
    // One-line summary (shown when the round is collapsed) + full body
    div.innerHTML = `<div class="round-summary">
        <div class="rs-name">Round ${num}</div>
        <div class="rs-games"></div>
        <button type="button" class="rs-toggle btn-link">Open</button>
      </div>
      <div class="round-body">
        <div class="round-header"><h3>Round ${num}</h3></div>
      </div>`;
    const body = div.querySelector(".round-body");
    const courtsDiv = document.createElement("div");
    courtsDiv.className = "courts";

    if (!totalCourts) totalCourts = parseInt(qs("courts").value) || r.matches.length;

    // Middle of a court card: score boxes, or just "v" when scores are switched off
    const middle = (a, b, courtNo) => keepScore
        ? `<div class="scores">
            <input class="score-input score-box" type="number" inputmode="numeric" min="0" placeholder="0" aria-label="Court ${courtNo} score, ${escapeHtml(a)}">
            <span class="colon">:</span>
            <input class="score-input score-box" type="number" inputmode="numeric" min="0" placeholder="0" aria-label="Court ${courtNo} score, ${escapeHtml(b)}">
          </div>`
        : `<div class="versus">v</div>`;

    r.matches.forEach((m, i) => {
        courtsDiv.innerHTML += `
      <div class="court" data-team-a="${escapeHtml(m[0])}" data-team-b="${escapeHtml(m[1])}">
        <div class="court-head"><h3 class="court-title">Court ${i + 1}</h3><span class="court-status"></span></div>
        <div class="match">
          <div class="team team-a">${escapeHtml(m[0])}</div>
          ${middle(m[0], m[1], i + 1)}
          <div class="team team-b">${escapeHtml(m[1])}</div>
        </div>
      </div>`;
    });

    // Bonus rematches fill any courts left over in the final round (not counted)
    (r.bonus || []).forEach((m, j) => {
        const i = r.matches.length + j;
        courtsDiv.innerHTML += `
      <div class="court bonus-court" data-bonus="1" data-team-a="${escapeHtml(m[0])}" data-team-b="${escapeHtml(m[1])}">
        <div class="court-head"><h3 class="court-title">Court ${i + 1} &middot; Bonus</h3><span class="court-status"></span></div>
        <div class="match">
          <div class="team team-a">${escapeHtml(m[0])}</div>
          ${middle(m[0], m[1], i + 1)}
          <div class="team team-b">${escapeHtml(m[1])}</div>
        </div>
        <div class="bonus-note">Friendly rematch - not counted</div>
      </div>`;
    });

    body.appendChild(courtsDiv);
    
    if(r.sitOut.length > 0) {
        const sit = document.createElement("div");
        sit.className = "sitout";
        sit.innerHTML = `<span class="sitout-label">Sitting out this round</span>
          <span class="chips">${r.sitOut.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</span>`;
        body.appendChild(sit);
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
        document.querySelectorAll("#rounds .court").forEach(c => {
            const inputs = c.querySelectorAll(".score-input");
            if (inputs.length !== 2) return;
            // Team names come from data attributes, not the display text,
            // so names containing " vs " still work.
            if (c.dataset.bonus) return; // bonus rematches don't count
            const a = c.dataset.teamA, b = c.dataset.teamB;
            if (a === undefined || b === undefined || !data[a] || !data[b]) return;
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

        // Highlight the top three only once at least one game has been counted
        const anyGames = teams.some(t => data[t].won + data[t].lost > 0 || data[t].points > 0);
        let html = `<table class="board${anyGames ? " has-games" : ""}"><tr><th>Team</th><th>Won</th><th>Lost</th><th>Diff</th><th>Points</th></tr>`;
        sorted.forEach(t => {
            html += `<tr>
                <td>${escapeHtml(t)}</td>
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
    // One global listener that always calls the CURRENT tournament's update.
    // (Previously it kept calling the first tournament's update, so after pressing
    // Generate again the scoreboard stopped working.)
    window.currentScoreboardUpdate = update;
    if(!window.scoreboardListenerAdded){
        document.addEventListener("input", e => {
            if (e.target.classList.contains("score-input") && window.currentScoreboardUpdate) {
                window.currentScoreboardUpdate();
            }
        });
        window.scoreboardListenerAdded = true;
    }
    
    update();
}
