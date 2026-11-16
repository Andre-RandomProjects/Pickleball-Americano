// Ui.js - screen layout for the scheduler (setup screen, round view, side panel).
// Scheduling, scoring, saving and export stay in Main.js / Tournament.js / Americano.js.
// This file only arranges what those files render.

let setupOpen = true;              // is the setup form showing?
window.activeTournament = window.activeTournament || null; // {mode, entries, courts, keepScore} of the running tournament
window.teamsCurrentRound = window.teamsCurrentRound || 0;  // Teams mode: index of the round "now playing"

function hasTournament(){
  return !!document.querySelector("#rounds > .round, #americanoOutput > .round");
}

/* ---------- Setup screen ---------- */

function pickMode(mode){
  qs("mode").value = mode;
  syncSetupUI();
}

function pickCourts(n){
  qs("courts").value = n;
  syncSetupUI();
}

// Make the cards, court buttons, counts and "each round" box match the form values
function syncSetupUI(){
  const mode = qs("mode").value;
  const isTeams = mode === "teams";
  const entries = qs("entries").value.split("\n").map(x => x.trim()).filter(Boolean);
  const n = entries.length;
  const courts = readCourts();
  const playing = hasTournament();

  document.querySelectorAll(".mode-card").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  document.querySelectorAll(".court-btn").forEach(b =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.courts) === courts)));

  const one = isTeams ? "team" : "player";
  const many = isTeams ? "teams" : "players";
  qs("entriesLabel").textContent = isTeams ? "Teams or players, one per line" : "Players, one per line";
  qs("entryCount").textContent = n ? `${n} ${n === 1 ? one : many}` : "";

  qs("keepScoreRow").hidden = !isTeams;
  qs("keepScoreDesc").textContent = qs("keepScore").checked
    ? "Score boxes and a scoreboard."
    : "Order of play only, no scores.";

  // "Each round" preview
  const box = qs("eachRound");
  let html = `<h2>Each round</h2>`;
  if (courts === null) {
    html += `<p class="hint">Choose 1 to 4 courts.</p>`;
  } else if (n === 0) {
    html += `<p class="hint">Add ${many} to see how each round will look.</p>`;
  } else {
    const short = notEnoughForCourts(mode, n, courts);
    if (short) {
      html += `<p class="hint">${escapeHtml(short)}</p>`;
    } else {
      const onCourt = courts * (isTeams ? 2 : 4);
      const stat = (num, label) => `<div><div class="stat-num">${num}</div><div class="stat-label">${label}</div></div>`;
      const third = isTeams
        ? stat(Math.ceil((n * (n - 1) / 2) / courts), "rounds in total")
        : stat(courts, courts === 1 ? "court in use" : "courts in use");
      html += `<div class="stats">${stat(onCourt, "playing")}${stat(n - onCourt, "sitting out")}${third}</div>`;
    }
  }
  box.innerHTML = html;

  qs("setupTitle").textContent = playing ? "Tournament setup" : "New tournament";
  qs("startBtn").textContent = playing ? "Restart with these settings" : "Start tournament";
  qs("backBtn").hidden = !playing;
}

function closeSetup(){
  setupOpen = false;
}

// "Edit setup" / "Back to tournament"
function toggleSetup(){
  if (!hasTournament()) return;
  setupOpen = !setupOpen;
  if (!setupOpen && window.activeTournament) {
    // Closed without restarting: put the form back to the running tournament's settings
    const a = window.activeTournament;
    qs("mode").value = a.mode;
    qs("entries").value = a.entries;
    qs("courts").value = a.courts;
    qs("keepScore").checked = a.keepScore !== false;
    hideWarning();
  }
  refreshPlayView();
  window.scrollTo(0, 0);
}

/* ---------- Round view ---------- */

function courtLabels(court){
  return {
    a: court.dataset.labelA !== undefined ? court.dataset.labelA : court.dataset.teamA,
    b: court.dataset.labelB !== undefined ? court.dataset.labelB : court.dataset.teamB
  };
}

// Read a court's score boxes: null when the court has none
function courtScore(court){
  const ins = court.querySelectorAll("input.score-box");
  if (ins.length !== 2) return null;
  const va = ins[0].value, vb = ins[1].value;
  return {
    ins,
    any: va !== "" || vb !== "",
    both: va !== "" && vb !== "",
    a: parseInt(va) || 0,
    b: parseInt(vb) || 0
  };
}

// Status pill + winner emphasis on one court card
function refreshCourt(court){
  const status = court.querySelector(".court-status");
  const sc = courtScore(court);
  const teamA = court.querySelector(".team-a"), teamB = court.querySelector(".team-b");
  if (!sc) { if (status) status.textContent = ""; return; }
  if (status) {
    status.textContent = sc.both ? "Score entered" : "Waiting for score";
    status.classList.toggle("done", sc.both);
  }
  const aWins = sc.both && sc.a > sc.b, bWins = sc.both && sc.b > sc.a;
  if (teamA) teamA.classList.toggle("lose", bWins);
  if (teamB) teamB.classList.toggle("lose", aWins);
  sc.ins[0].classList.toggle("win", aWins);
  sc.ins[1].classList.toggle("win", bWins);
}

// One-line summary shown when a round is collapsed
function updateRoundSummary(round){
  const games = round.querySelector(".rs-games");
  if (!games) return;
  let html = "";
  round.querySelectorAll(".court").forEach((court, i) => {
    const l = courtLabels(court);
    const A = escapeHtml(l.a), B = escapeHtml(l.b);
    const bonus = !!court.dataset.bonus;
    const sc = courtScore(court);
    let inner;
    if (sc && sc.any) {
      inner = `${bonus ? '<span class="rs-court">Bonus</span> · ' : ""}`
        + `${sc.a > sc.b ? `<strong>${A}</strong>` : A} ${sc.a} – ${sc.b} ${sc.b > sc.a ? `<strong>${B}</strong>` : B}`;
    } else {
      inner = `<span class="rs-court">Court ${i + 1}${bonus ? " · Bonus" : ""}</span> · ${A} v ${B}`;
    }
    html += `<span class="rs-game${bonus ? " bonus" : ""}">${inner}</span>`;
  });
  games.innerHTML = html;

  const toggle = round.querySelector(".rs-toggle");
  if (toggle) {
    const hasBoxes = !!round.querySelector("input.score-box");
    toggle.textContent = round.classList.contains("open") ? "Close"
      : (round.classList.contains("finished") && hasBoxes ? "Edit" : "Open");
  }
}

// A round is complete when every counted (non-bonus) court has both scores
function roundComplete(round){
  const courts = [...round.querySelectorAll(".court")].filter(c => !c.dataset.bonus);
  return courts.every(c => { const sc = courtScore(c); return sc && sc.both; });
}

// Build the header, section headings and fold button inside a round container (once)
function ensureFlowHelpers(container){
  if (container.querySelector(":scope > .play-head")) return;
  const head = document.createElement("div");
  head.className = "play-head";
  head.innerHTML = `
    <div>
      <div class="eyebrow">Now playing</div>
      <h1 class="round-title"></h1>
    </div>
    <div class="head-side">
      <div class="progress-wrap" hidden>
        <div class="progress-text"></div>
        <div class="progress"><div class="progress-fill"></div></div>
      </div>
      <div class="next-wrap">
        <span class="next-note"></span>
        <button type="button" class="next-round-btn btn-primary">Next round</button>
      </div>
    </div>`;
  head.querySelector(".next-round-btn").onclick = nextRoundClick;
  container.appendChild(head);

  const mk = (cls, text, order) => {
    const h = document.createElement("h2");
    h.className = "flow-heading " + cls;
    h.textContent = text;
    h.style.order = order;
    container.appendChild(h);
  };
  mk("h-upnext", "Up next", 50);
  mk("h-finished", "Finished rounds", 500);

  const fold = document.createElement("button");
  fold.type = "button";
  fold.className = "fold-btn btn-secondary";
  fold.style.order = 400;
  fold.onclick = () => { container.classList.toggle("show-all"); refreshPlayView(); };
  container.appendChild(fold);
}

const UPCOMING_SHOWN = 2; // later rounds are folded behind "Show all upcoming rounds"

function refreshPlayView(){
  const teamRounds = [...document.querySelectorAll("#rounds > .round")];
  const amRounds = [...document.querySelectorAll("#americanoOutput > .round")];
  const playing = teamRounds.length > 0 || amRounds.length > 0;
  if (!playing) setupOpen = true;

  qs("playPanel").hidden = !playing;
  qs("barActions").hidden = !playing;
  qs("setupPanel").hidden = playing && !setupOpen;
  qs("editSetupBtn").textContent = setupOpen ? "Close setup" : "Edit setup";
  syncSetupUI();

  const body = document.body;
  if (!playing) {
    body.classList.remove("has-side", "view-side", "has-next-bar");
    qs("rounds").classList.remove("show-all");
    qs("americanoOutput").classList.remove("show-all");
    return;
  }

  const active = window.activeTournament || {};
  let kind, container, rounds, currentIdx, showSide;
  if (teamRounds.length) {
    kind = "teams"; container = qs("rounds"); rounds = teamRounds;
    showSide = active.keepScore !== false;
    if (!(window.teamsCurrentRound >= 0)) {
      // Not saved (older save): the first round that still needs scores
      const firstOpen = rounds.findIndex(r => !roundComplete(r));
      window.teamsCurrentRound = showSide ? (firstOpen < 0 ? rounds.length - 1 : firstOpen) : 0;
    }
    currentIdx = Math.min(window.teamsCurrentRound, rounds.length - 1);
  } else {
    kind = americanoState.rankedMode ? "ranked" : "americano";
    container = qs("americanoOutput"); rounds = amRounds;
    showSide = kind === "ranked";
    currentIdx = rounds.length - 1;
  }

  ensureFlowHelpers(container);

  // Arrange: current round on top, then what's coming, then finished rounds (newest first)
  let upcoming = 0, finished = 0;
  rounds.forEach((r, i) => {
    const isCurrent = i === currentIdx, isUp = i > currentIdx, isDone = i < currentIdx;
    r.classList.toggle("current", isCurrent);
    r.classList.toggle("upcoming", isUp);
    r.classList.toggle("finished", isDone);
    if (isCurrent) r.classList.remove("open");
    r.classList.toggle("folded", isUp && (i - currentIdx) > UPCOMING_SHOWN);
    r.style.order = isCurrent ? 0 : isUp ? 100 + i : 1000 - i;
    if (isUp) upcoming++;
    if (isDone) finished++;
    r.querySelectorAll(".court").forEach(refreshCourt);
    updateRoundSummary(r);
  });

  container.querySelector(":scope > .h-upnext").hidden = upcoming === 0;
  container.querySelector(":scope > .h-finished").hidden = finished === 0;
  const fold = container.querySelector(":scope > .fold-btn");
  fold.hidden = upcoming <= UPCOMING_SHOWN;
  fold.textContent = container.classList.contains("show-all")
    ? "Show fewer upcoming rounds"
    : `Show all ${upcoming} upcoming rounds`;

  // Header
  const head = container.querySelector(":scope > .play-head");
  const isLast = kind === "teams" && currentIdx === rounds.length - 1;
  head.querySelector(".eyebrow").textContent = isLast ? "Final round" : "Now playing";
  head.querySelector(".round-title").innerHTML = `Round ${currentIdx + 1}`
    + (kind === "teams" ? ` <span class="of">of ${rounds.length}</span>` : "");

  // Progress (Teams with scores): counted games that have a score
  const prog = head.querySelector(".progress-wrap");
  let played = 0, total = 0;
  if (kind === "teams" && showSide) {
    rounds.forEach(r => r.querySelectorAll(".court").forEach(c => {
      if (c.dataset.bonus) return;
      total++;
      const sc = courtScore(c);
      if (sc && sc.any) played++;
    }));
    prog.hidden = false;
    prog.querySelector(".progress-text").textContent = `${played} of ${total} games played`;
    prog.querySelector(".progress-fill").style.width = (total ? Math.round(played / total * 100) : 0) + "%";
    prog.querySelector(".progress").setAttribute("role", "img");
    prog.querySelector(".progress").setAttribute("aria-label", `${played} of ${total} games played`);
  } else {
    prog.hidden = true;
  }

  // Next round button + "x of y scores entered"
  const nextWrap = head.querySelector(".next-wrap");
  const canNext = kind === "teams"
    ? !isLast
    : rounds.length <= americanoState.players.length * 2; // same limit as before
  nextWrap.hidden = !canNext;
  const boxes = [...rounds[currentIdx].querySelectorAll(".court")].map(courtScore).filter(Boolean);
  nextWrap.querySelector(".next-note").textContent = boxes.length
    ? `${boxes.filter(s => s.both).length} of ${boxes.length} scores entered` : "";
  body.classList.toggle("has-next-bar", canNext);

  // Side panel (scoreboard / leaderboard) and the phone tabs
  qs("playSide").hidden = !showSide;
  qs("viewTabs").hidden = !showSide;
  body.classList.toggle("has-side", showSide);
  if (!showSide) body.classList.remove("view-side");
  const sideName = kind === "teams" ? "Scoreboard" : "Leaderboard";
  qs("sideTitle").textContent = sideName;
  qs("sideTabBtn").textContent = sideName;
  qs("score").hidden = kind !== "teams";
  qs("americanoRankings").hidden = kind !== "ranked";
  qs("sideNote").textContent = kind === "teams"
    ? `${played} of ${total} games`
    : `Round ${rounds.length}`;
  qs("sideFoot").textContent = kind === "teams"
    ? "Ranked by wins, then points difference. Bonus games are not counted."
    : "Rating is based on win rate and points difference.";
  document.querySelectorAll(".view-tab").forEach(t =>
    t.setAttribute("aria-pressed", String((t.dataset.view === "side") === body.classList.contains("view-side"))));

  // App bar summary
  const count = kind === "teams"
    ? (active.entries ? active.entries.split("\n").filter(Boolean).length : 0)
    : americanoState.players.length;
  const courtCount = kind === "teams" ? Number(active.courts) : americanoState.courts;
  const modeName = kind === "teams" ? "Singles / Teams" : kind === "ranked" ? "Ranked Americano" : "Americano";
  qs("barSummary").textContent =
    `${modeName} · ${count} ${kind === "teams" ? "teams" : "players"} · ${courtCount} ${courtCount === 1 ? "court" : "courts"}`;
}

function nextRoundClick(){
  if (document.querySelector("#rounds > .round")) {
    // Teams: the whole schedule exists already, just move on to the next round
    const last = document.querySelectorAll("#rounds > .round").length - 1;
    window.teamsCurrentRound = Math.min((window.teamsCurrentRound || 0) + 1, last);
    saveTournamentData();
    refreshPlayView();
  } else {
    americanoNextRound(); // generates, saves and refreshes
  }
  window.scrollTo(0, 0);
}

// Phone: switch between the rounds and the scoreboard / leaderboard
function switchView(view){
  document.body.classList.toggle("view-side", view === "side");
  document.querySelectorAll(".view-tab").forEach(t =>
    t.setAttribute("aria-pressed", String(t.dataset.view === view)));
}

/* ---------- Events ---------- */

// Open / close a collapsed round
document.addEventListener("click", e => {
  const toggle = e.target.closest(".rs-toggle");
  if (!toggle) return;
  const round = toggle.closest(".round");
  round.classList.toggle("open");
  updateRoundSummary(round);
});

// Any score typed: refresh pills, summaries, progress and counts
document.addEventListener("input", e => {
  if (e.target.classList && e.target.classList.contains("score-box")) refreshPlayView();
});

// Page load
function initApp(){
  restoreFromStorage();
  setupOpen = !hasTournament();
  refreshPlayView();
}
