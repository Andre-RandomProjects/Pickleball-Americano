import { generateTeamRounds, renderTeamRound, buildScoreboard } from './Tournament.js';
import { generateAmericano, renderAmericanoRound } from './Americano.js';

const qs = id => document.getElementById(id);

function clearAll(){
  qs("warning").innerHTML = "";
  qs("rounds").innerHTML = "";
  qs("score").innerHTML = "";
  qs("americanoOutput").innerHTML = "";
  qs("teamsTabs").style.display = "none";
}

function switchTab(tabId){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add("active");
  qs(tabId).classList.add("active");
}

function resetAll(){
  if(!confirm("Reset everything?")) return;
  qs("entries").value = "";
  qs("courts").value = 2;
  clearAll();
}

qs("generateBtn").addEventListener("click", generate);
qs("resetBtn").addEventListener("click", resetAll);
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", e => switchTab(t.dataset.tab)));

function generate(){
  clearAll();
  let entries = qs("entries").value.split("\n").map(x=>x.trim()).filter(Boolean);
  let courts = parseInt(qs("courts").value);
  if(courts > 4) courts = 4;

  if(qs("mode").value === "teams"){
    if(entries.length < 2 * courts){
      qs("warning").innerHTML =
        `Not enough teams to fill all courts.<br>${entries.length} teams for ${courts} courts.<br>Total teams required: ${2*courts}`;
      return;
    }
    qs("teamsTabs").style.display = "block";
    const rounds = generateTeamRounds(entries, courts);
    rounds.forEach((r,i) => renderTeamRound(i+1,r));
    buildScoreboard(entries);
  } else {
    if(entries.length < courts*4){
      qs("warning").innerHTML =
        `Not enough players to fill all courts.<br>${entries.length} players for ${courts} courts.<br>Total players required: ${courts*4}`;
      return;
    }
    const rounds = generateAmericano(entries, courts);
    rounds.forEach((r,i) => renderAmericanoRound(i+1,r));
  }
}
