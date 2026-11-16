// TournamentMode.js - "Tournament" match type: round-robin groups, then a knockout.
//
// How it works
//  - Entries (players or teams) are drawn at random into groups of 4 to 5.
//  - Everyone in a group plays each other once. Group games are spread over the courts.
//  - The top 2 of every group go through, plus the best third-placed entries needed to
//    fill a knockout of 4, 8, 16 or 32 with no byes. (With 5, 9 or 10 groups that cannot
//    be done, so group winners plus the best runners-up go through instead.)
//  - Knockout: winners advance to the final; the two losing semi-finalists play for third.
//
// Everything lives in tournamentState (saved to the browser by Main.js). The page is
// drawn from that state; Ui.js arranges the rounds like the other match types.

let tournamentState = null;

/* ---------- Planning ---------- */

// Group count, group sizes, knockout size and who goes through, for n entries
function tournamentPlan(n){
  const G = Math.max(2, Math.floor(n / 4));
  const sizes = Array.from({ length: G }, (_, i) => Math.floor(n / G) + (i < n % G ? 1 : 0));
  const pow2 = x => { let p = 1; while (p < x) p *= 2; return p; };
  let B, direct, extra;
  const up = pow2(2 * G);
  if (up === 2 * G) { B = up; direct = 2; extra = 0; }            // top 2, exact fit
  else if (up <= 3 * G) { B = up; direct = 2; extra = B - 2 * G; } // top 2 + best thirds
  else { B = up / 2; direct = 1; extra = B - G; }                  // winners + best runners-up
  const groupGames = sizes.reduce((a, s) => a + s * (s - 1) / 2, 0);
  return { G, sizes, B, direct, extra, groupGames };
}

// Plain-language rule for who goes through
function tournamentRuleText(plan){
  const place = plan.direct === 2 ? "third-placed" : "second-placed";
  let t = plan.direct === 2 ? "The top 2 in each group go through" : "Each group winner goes through";
  if (plan.extra > 0) t += `, plus the ${plan.extra} best ${place}`;
  return `${t} (${plan.B} in the knockout).`;
}

function tournamentRoundName(size){
  return size === 2 ? "Final" : size === 4 ? "Semi finals" : size === 8 ? "Quarter finals" : `Round of ${size}`;
}

function tournamentMatchName(size, i){
  return size === 2 ? "Final" : size === 4 ? `Semi final ${i + 1}` : size === 8 ? `Quarter final ${i + 1}` : `Round of ${size} · Match ${i + 1}`;
}

// Every pairing in one group, in a sensible playing order (circle method)
function tournamentGroupPairs(list){
  const l = [...list];
  if (l.length % 2) l.push(null);
  const n = l.length, out = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = l[i], b = l[n - 1 - i];
      if (a !== null && b !== null) out.push([a, b]);
    }
    l.splice(1, 0, l.pop());
  }
  return out;
}

// Spread matches over the courts: nobody plays twice in a round, longest-rested first
function tournamentPackWaves(matches, courts){
  const remaining = [...matches], waves = [], last = {};
  while (remaining.length) {
    const w = waves.length;
    const rest = m => Math.min(w - (last[m.a] === undefined ? -2 : last[m.a]), w - (last[m.b] === undefined ? -2 : last[m.b]));
    const order = [...remaining].sort((x, y) => rest(y) - rest(x)); // stable: keeps group order on ties
    const wave = [], busy = new Set();
    for (const m of order) {
      if (wave.length >= courts) break;
      if (busy.has(m.a) || busy.has(m.b)) continue;
      wave.push(m); busy.add(m.a); busy.add(m.b);
    }
    wave.forEach(m => { last[m.a] = w; last[m.b] = w; remaining.splice(remaining.indexOf(m), 1); });
    waves.push(wave.map(m => m.id));
  }
  return waves;
}

/* ---------- Start / restore ---------- */

function startTournament(entries, courts){
  const plan = tournamentPlan(entries.length);
  const drawn = shuffled(entries); // random draw
  const groups = [];
  let k = 0;
  plan.sizes.forEach(s => { groups.push(drawn.slice(k, k + s)); k += s; });

  // Group matches, interleaved across groups so every group gets going early
  const perGroup = groups.map((g, gi) => tournamentGroupPairs(g).map((p, i) =>
    ({ id: `g${gi}-${i}`, stage: "group", group: gi, a: p[0], b: p[1] })));
  const matches = [];
  for (let i = 0; perGroup.some(g => i < g.length); i++) perGroup.forEach(g => { if (i < g.length) matches.push(g[i]); });

  const groupWaves = tournamentPackWaves(matches, courts);
  tournamentState = {
    entries: [...entries],
    courts,
    plan,
    groups,
    matches,                 // group matches
    waves: groupWaves.map((ids, i) => ({ title: `Group stage · Round ${i + 1} of ${groupWaves.length}`, short: `Group round ${i + 1}`, ids })),
    groupWaveCount: groupWaves.length,
    scores: {},              // id -> {sa, sb, key}
    ko: null,                // knockout, once drawn
    current: 0               // index of the round "now playing"
  };
  tournamentRenderAll();
}

function restoreTournament(saved){
  tournamentState = saved;
  if (!tournamentState.scores) tournamentState.scores = {};
  tournamentRenderAll();
}

/* ---------- Who is playing / who won ---------- */

function tournamentMatch(id){
  const s = tournamentState;
  if (id[0] === "g") return s.matches.find(m => m.id === id);
  if (!s.ko) return null;
  if (id === "third") return s.ko.third;
  for (const r of s.ko.rounds) { const m = r.find(x => x.id === id); if (m) return m; }
  return null;
}

// The two sides of a match. In later knockout rounds they come from earlier results.
function tournamentPlayers(id){
  const s = tournamentState, m = tournamentMatch(id);
  if (!m) return { a: null, b: null };
  if (m.stage === "group" || m.round === 0) return { a: m.a, b: m.b };
  if (id === "third") {
    const semis = s.ko.rounds[s.ko.rounds.length - 2];
    return { a: tournamentLoser(semis[0].id), b: tournamentLoser(semis[1].id), fromA: `Loser of ${semis[0].name}`, fromB: `Loser of ${semis[1].name}` };
  }
  const prev = s.ko.rounds[m.round - 1];
  const fa = prev[m.index * 2], fb = prev[m.index * 2 + 1];
  return { a: tournamentWinner(fa.id), b: tournamentWinner(fb.id), fromA: `Winner of ${fa.name}`, fromB: `Winner of ${fb.name}` };
}

// A result counts when both scores are in, they differ, and it was entered for these two sides
function tournamentResult(id){
  const sc = tournamentState.scores[id];
  if (!sc || sc.sa === "" || sc.sb === "") return null;
  const p = tournamentPlayers(id);
  if (p.a === null || p.b === null || sc.key !== p.a + "|" + p.b) return null;
  const sa = parseInt(sc.sa) || 0, sb = parseInt(sc.sb) || 0;
  if (sa === sb) return null; // needs a winner
  return { a: p.a, b: p.b, sa, sb, winner: sa > sb ? p.a : p.b, loser: sa > sb ? p.b : p.a };
}

function tournamentWinner(id){ const r = tournamentResult(id); return r ? r.winner : null; }
function tournamentLoser(id){ const r = tournamentResult(id); return r ? r.loser : null; }

/* ---------- Group standings and qualifiers ---------- */

function tournamentStandings(gi){
  const s = tournamentState;
  const rows = s.groups[gi].map((name, i) => ({ name, group: gi, draw: i, p: 0, w: 0, l: 0, pf: 0, pa: 0 }));
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  s.matches.filter(m => m.group === gi).forEach(m => {
    const r = tournamentResult(m.id);
    if (!r) return;
    const A = by[m.a], B = by[m.b];
    A.p++; B.p++; A.pf += r.sa; A.pa += r.sb; B.pf += r.sb; B.pa += r.sa;
    if (r.sa > r.sb) { A.w++; B.l++; } else { B.w++; A.l++; }
  });
  rows.forEach(r => r.diff = r.pf - r.pa);
  // Most wins, then best points difference, then most points scored, then draw order
  rows.sort((x, y) => (y.w - x.w) || (y.diff - x.diff) || (y.pf - x.pf) || (x.draw - y.draw));
  rows.forEach((r, i) => r.pos = i + 1);
  return rows;
}

// Compare entries from different groups fairly (groups can differ in size): per game played
function tournamentRate(x, y){
  const per = (r, k) => r.p ? r[k] / r.p : 0;
  return (per(y, "w") - per(x, "w")) || (per(y, "diff") - per(x, "diff")) || (per(y, "pf") - per(x, "pf")) || (x.group - y.group);
}

// Everyone going through, best first (this order is the knockout seeding)
function tournamentQualifiers(){
  const s = tournamentState, plan = s.plan;
  const tables = s.groups.map((_, gi) => tournamentStandings(gi));
  const out = [];
  for (let pos = 1; pos <= plan.direct; pos++) out.push(...tables.map(t => t[pos - 1]).sort(tournamentRate));
  if (plan.extra > 0) {
    const next = tables.map(t => t[plan.direct]).filter(Boolean).sort(tournamentRate);
    out.push(...next.slice(0, plan.extra));
  }
  return out;
}

function tournamentGroupProgress(){
  const s = tournamentState;
  const done = s.matches.filter(m => tournamentResult(m.id)).length;
  return { done, total: s.matches.length, missing: s.matches.length - done };
}

// Games with a result / all games (group games + knockout games incl. third place)
function tournamentProgress(){
  const s = tournamentState, g = tournamentGroupProgress();
  let done = g.done;
  if (s.ko) {
    s.ko.rounds.forEach(r => r.forEach(m => { if (tournamentResult(m.id)) done++; }));
    if (tournamentResult("third")) done++;
  }
  return { done, total: g.total + s.plan.B };
}

/* ---------- Knockout ---------- */

// Standard bracket order: seed 1 meets the lowest seed, 1 and 2 can only meet in the final
function tournamentSeedOrder(size){
  let order = [1, 2];
  while (order.length < size) { const n = order.length * 2; order = order.flatMap(x => [x, n + 1 - x]); }
  return order;
}

function tournamentDrawKnockout(){
  const s = tournamentState;
  if (s.ko || tournamentGroupProgress().missing > 0) return;
  const q = tournamentQualifiers(), B = s.plan.B;
  const order = tournamentSeedOrder(B);
  const first = [];
  for (let i = 0; i < B; i += 2) first.push({ A: q[order[i] - 1], B: q[order[i + 1] - 1] });

  // Where possible, don't let two entries from the same group meet again straight away
  first.forEach((m, i) => {
    if (m.A.group !== m.B.group) return;
    const j = first.findIndex((o, k) => k !== i && o.A.group !== m.B.group && o.B.group !== m.A.group && o.A.group !== o.B.group);
    if (j >= 0) { const t = m.B; m.B = first[j].B; first[j].B = t; }
  });

  const rounds = [];
  let size = B;
  rounds.push(first.map((m, i) => ({ id: `k0-${i}`, stage: "ko", round: 0, index: i, name: tournamentMatchName(size, i), a: m.A.name, b: m.B.name })));
  for (let r = 1; size > 2; r++) {
    size /= 2;
    rounds.push(Array.from({ length: size / 2 }, (_, i) => ({ id: `k${r}-${i}`, stage: "ko", round: r, index: i, name: tournamentMatchName(size, i) })));
  }
  s.ko = {
    size: B,
    seeds: q.map(r => ({ name: r.name, group: r.group, pos: r.pos })),
    rounds,
    third: { id: "third", stage: "ko", round: rounds.length - 1, index: 1, name: "Third place" }
  };

  // Knockout rounds as playing rounds (split when there are more games than courts)
  let rsize = B;
  rounds.forEach((r, ri) => {
    const isFinal = ri === rounds.length - 1;
    const label = tournamentRoundName(rsize);
    if (isFinal) {
      if (s.courts >= 2) s.waves.push({ title: "Final and third place", short: "Final", ids: ["third", r[0].id], ko: true });
      else {
        s.waves.push({ title: "Third place", short: "Third place", ids: ["third"], ko: true });
        s.waves.push({ title: "Final", short: "Final", ids: [r[0].id], ko: true });
      }
    } else {
      const parts = Math.ceil(r.length / s.courts);
      for (let p = 0; p < parts; p++) {
        s.waves.push({
          title: parts > 1 ? `${label} · Part ${p + 1} of ${parts}` : label,
          short: parts > 1 ? `${label} ${p + 1}/${parts}` : label,
          ids: r.slice(p * s.courts, (p + 1) * s.courts).map(m => m.id), ko: true
        });
      }
    }
    rsize /= 2;
  });

  s.current = s.groupWaveCount; // move on to the first knockout round
  tournamentRenderAll();
  if (typeof saveTournamentData === "function") saveTournamentData();
}

// Throw the knockout away so group scores can be corrected
function tournamentReopenGroups(){
  const s = tournamentState;
  if (!s.ko) return;
  if (!confirm("Reopen the group stage? The knockout draw and its scores will be removed.")) return;
  Object.keys(s.scores).forEach(id => { if (id[0] !== "g") delete s.scores[id]; });
  s.ko = null;
  s.waves = s.waves.slice(0, s.groupWaveCount);
  s.current = s.groupWaveCount - 1;
  tournamentRenderAll();
  if (typeof saveTournamentData === "function") saveTournamentData();
  if (typeof refreshPlayView === "function") refreshPlayView();
}

/* ---------- Drawing the page ---------- */

// Two-person team names ("Ann & Bob") go on two lines
function tournamentNameHtml(name){
  return escapeHtml(name).split(" &amp; ").join("<br>");
}

function tournamentRenderAll(){
  const s = tournamentState, out = qs("tournamentOutput");
  out.innerHTML = "";
  s.waves.forEach((w, wi) => {
    const div = document.createElement("div");
    div.className = "round";
    div.dataset.roundNum = wi + 1;
    div.dataset.title = w.title;
    div.innerHTML = `<div class="round-summary">
        <div class="rs-name">${escapeHtml(w.short)}</div>
        <div class="rs-games"></div>
        <button type="button" class="rs-toggle btn-link">Open</button>
      </div>
      <div class="round-body">
        <div class="round-header"><h3>${escapeHtml(w.title)}</h3></div>
        <div class="courts"></div>
      </div>`;
    const courts = div.querySelector(".courts");
    w.ids.forEach((id, ci) => {
      const m = tournamentMatch(id);
      const tag = m.stage === "group" ? `Group ${m.group + 1}` : m.name;
      const sc = s.scores[id] || { sa: "", sb: "" };
      courts.insertAdjacentHTML("beforeend", `<div class="court" data-mid="${id}" data-label-a="" data-label-b="">
        <div class="court-head">
          <h3 class="court-title">Court ${ci + 1} <span class="court-tag">${escapeHtml(tag)}</span></h3>
          <span class="court-status"></span>
        </div>
        <div class="match">
          <div class="team team-a"></div>
          <div class="scores">
            <input class="tournament-score-input score-box" type="number" inputmode="numeric" min="0" placeholder="0" value="${escapeHtml(sc.sa)}">
            <span class="colon">:</span>
            <input class="tournament-score-input score-box" type="number" inputmode="numeric" min="0" placeholder="0" value="${escapeHtml(sc.sb)}">
          </div>
          <div class="team team-b"></div>
        </div>
      </div>`);
    });
    out.appendChild(div);
  });
  tournamentSync();
}

// Bring names, locks and the side panel in line with the current results
function tournamentSync(){
  const s = tournamentState;
  if (!s) return;
  // Rounds are in playing order, so results flow forward in one pass
  qs("tournamentOutput").querySelectorAll(".court").forEach(court => {
    const id = court.dataset.mid, m = tournamentMatch(id);
    if (!m) return;
    const p = tournamentPlayers(id);
    const ins = court.querySelectorAll("input");
    const sc = s.scores[id];
    const known = p.a !== null && p.b !== null;

    // A score entered for different players (an earlier result changed) no longer applies
    if (sc && (!known || sc.key !== p.a + "|" + p.b)) {
      delete s.scores[id];
      ins[0].value = ""; ins[1].value = "";
    }

    const labelA = p.a !== null ? p.a : p.fromA, labelB = p.b !== null ? p.b : p.fromB;
    court.dataset.labelA = labelA;
    court.dataset.labelB = labelB;
    const ta = court.querySelector(".team-a"), tb = court.querySelector(".team-b");
    ta.innerHTML = p.a !== null ? tournamentNameHtml(p.a) : escapeHtml(p.fromA);
    tb.innerHTML = p.b !== null ? tournamentNameHtml(p.b) : escapeHtml(p.fromB);
    ta.classList.toggle("tbd", p.a === null);
    tb.classList.toggle("tbd", p.b === null);

    // Locked: players not known yet, or a group game after the knockout has been drawn
    const locked = !known || (m.stage === "group" && !!s.ko);
    ins.forEach((inp, i) => {
      inp.disabled = locked;
      inp.setAttribute("aria-label", `${m.stage === "group" ? "Group " + (m.group + 1) : m.name} score, ${i === 0 ? labelA : labelB}`);
    });
    court.classList.toggle("pending", !known);
  });
  tournamentRenderSide();
}

// Called by Ui.js after its own pass, to adjust the status pills
function tournamentDecorate(){
  const s = tournamentState;
  if (!s) return;
  qs("tournamentOutput").querySelectorAll(".court").forEach(court => {
    const status = court.querySelector(".court-status");
    if (!status) return;
    const id = court.dataset.mid;
    const p = tournamentPlayers(id);
    const sc = s.scores[id];
    if (p.a === null || p.b === null) { status.textContent = "Waiting for players"; status.classList.remove("done"); }
    else if (sc && sc.sa !== "" && sc.sb !== "" && !tournamentResult(id)) { status.textContent = "Needs a winner"; status.classList.remove("done"); }
  });
}

function tournamentRenderSide(){
  const s = tournamentState, side = qs("tournamentSide");
  if (!side || !s) return;
  let html = "";

  if (s.ko) {
    const fin = tournamentResult(s.ko.rounds[s.ko.rounds.length - 1][0].id);
    const third = tournamentResult("third");
    if (fin) {
      html += `<div class="podium">
        <div class="podium-row first"><span class="podium-place">Winner</span><span class="podium-name">${escapeHtml(fin.winner)}</span></div>
        <div class="podium-row"><span class="podium-place">Second place</span><span class="podium-name">${escapeHtml(fin.loser)}</span></div>
        ${third ? `<div class="podium-row"><span class="podium-place">Third place</span><span class="podium-name">${escapeHtml(third.winner)}</span></div>` : ""}
      </div>`;
    }

    html += `<h3 class="side-sub">Knockout</h3>`;
    let size = s.ko.size;
    s.ko.rounds.forEach((r, ri) => {
      html += `<div class="ko-round"><div class="ko-round-name">${tournamentRoundName(size)}</div>`;
      const list = ri === s.ko.rounds.length - 1 ? [r[0], s.ko.third] : r;
      list.forEach(m => {
        const p = tournamentPlayers(m.id), res = tournamentResult(m.id);
        const A = p.a !== null ? escapeHtml(p.a) : `<span class="tbd">${escapeHtml(p.fromA)}</span>`;
        const B = p.b !== null ? escapeHtml(p.b) : `<span class="tbd">${escapeHtml(p.fromB)}</span>`;
        const label = m.id === "third" ? `<span class="ko-tag">Third place</span> ` : "";
        html += res
          ? `<div class="ko-line">${label}${res.sa > res.sb ? `<strong>${A}</strong>` : A} ${res.sa} – ${res.sb} ${res.sb > res.sa ? `<strong>${B}</strong>` : B}</div>`
          : `<div class="ko-line">${label}${A} v ${B}</div>`;
      });
      html += `</div>`;
      size /= 2;
    });
    html += `<button type="button" class="btn-link reopen-btn" onclick="tournamentReopenGroups()">Reopen group stage</button>`;
  }

  // Groups, with everyone currently going through highlighted
  const going = new Set((s.ko ? s.ko.seeds : (tournamentGroupProgress().done ? tournamentQualifiers() : [])).map(q => q.name));
  s.groups.forEach((g, gi) => {
    html += `<h3 class="side-sub">Group ${gi + 1}</h3>
      <table class="board group"><tr><th>${g.length} in group</th><th>P</th><th>W</th><th>L</th><th>Diff</th></tr>`;
    tournamentStandings(gi).forEach(r => {
      html += `<tr class="${going.has(r.name) ? "q" : ""}"><td>${escapeHtml(r.name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`;
    });
    html += `</table>`;
  });
  side.innerHTML = html;
}

/* ---------- Score entry ---------- */

// Capture phase: the state is updated before Ui.js refreshes the screen
document.addEventListener("input", e => {
  if (!e.target.classList || !e.target.classList.contains("tournament-score-input") || !tournamentState) return;
  const court = e.target.closest(".court");
  const id = court.dataset.mid, ins = court.querySelectorAll("input");
  const p = tournamentPlayers(id);
  if (p.a === null || p.b === null) return;
  if (ins[0].value === "" && ins[1].value === "") delete tournamentState.scores[id];
  else tournamentState.scores[id] = { sa: ins[0].value, sb: ins[1].value, key: p.a + "|" + p.b };
  tournamentSync();
  if (typeof saveTournamentData === "function") saveTournamentData();
}, true);

/* ---------- Export ---------- */

function exportTournamentData(name){
  const s = tournamentState;
  if (!s) { alert("Generate a schedule first."); return; }
  let csv = "data:text/csv;charset=utf-8,";
  csv += "Pickleball Tournament Export\n\n";
  if (name) csv += `Name;${csvCell(name)}\n`;
  csv += `Mode;"Tournament (groups then knockout)"\n`;
  csv += `Entries;"${s.entries.length}"\n`;
  csv += `Courts;"${s.courts}"\n`;
  csv += `Date;"${new Date().toLocaleDateString()}"\n\n`;

  if (s.ko) {
    const fin = tournamentResult(s.ko.rounds[s.ko.rounds.length - 1][0].id), third = tournamentResult("third");
    if (fin) {
      csv += "RESULT\n";
      csv += `Winner;${csvCell(fin.winner)}\nSecond place;${csvCell(fin.loser)}\n`;
      if (third) csv += `Third place;${csvCell(third.winner)}\n`;
      csv += "\n";
    }
  }

  csv += "GROUP STANDINGS\n";
  csv += "Group;Position;Name;Played;Won;Lost;Points For;Points Against;Diff\n";
  s.groups.forEach((_, gi) => tournamentStandings(gi).forEach(r => {
    csv += `Group ${gi + 1};${r.pos};${csvCell(r.name)};${r.p};${r.w};${r.l};${r.pf};${r.pa};${r.diff}\n`;
  }));
  csv += "\n";

  csv += "MATCHES\n";
  csv += "Round;Court;Stage;Side 1;Score 1;Side 2;Score 2\n";
  s.waves.forEach(w => w.ids.forEach((id, ci) => {
    const m = tournamentMatch(id), p = tournamentPlayers(id), sc = s.scores[id] || { sa: "", sb: "" };
    const stage = m.stage === "group" ? `Group ${m.group + 1}` : m.name;
    csv += `${csvCell(w.title)};Court ${ci + 1};${csvCell(stage)};${csvCell(p.a !== null ? p.a : p.fromA)};${sc.sa};${csvCell(p.b !== null ? p.b : p.fromB)};${sc.sb}\n`;
  }));

  downloadCSV(csv, "tournament_groups_knockout_export.csv");
}
