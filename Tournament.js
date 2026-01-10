export function generateTeamRounds(teams, courts){
  let list = [...teams];
  const n = list.length;
  if(n%2) list.push("BYE");
  const allMatches = [];

  for(let r=0; r<list.length-1; r++){
    const matches = [];
    for(let i=0; i<list.length/2; i++){
      const a=list[i], b=list[list.length-1-i];
      if(a!=="BYE" && b!=="BYE") matches.push([a,b]);
    }
    allMatches.push(...matches);
    list.splice(1,0,list.pop());
  }

  const rounds = [];
  while(allMatches.length){
    const roundMatches = [];
    const usedTeams = new Set();
    for(let i=0; i<allMatches.length && roundMatches.length<courts; i++){
      const m = allMatches[i];
      if(!usedTeams.has(m[0]) && !usedTeams.has(m[1])){
        roundMatches.push(m);
        usedTeams.add(m[0]); usedTeams.add(m[1]);
        allMatches.splice(i,1);
        i--;
      }
    }
    let j=0;
    while(roundMatches.length < courts && allMatches.length){
      const m = allMatches[j];
      roundMatches.push(m);
      usedTeams.add(m[0]); usedTeams.add(m[1]);
      allMatches.splice(j,1);
    }
    const sitOut = teams.filter(t => !usedTeams.has(t));
    rounds.push({matches: roundMatches, sitOut});
  }
  return rounds;
}

export function renderTeamRound(num,r){
  const div=document.createElement("div");
  div.className="round";
  div.innerHTML=`<div class="round-header">Round ${num}</div>`;
  const courtsDiv=document.createElement("div");
  courtsDiv.className="courts";

  const totalCourts=parseInt(document.getElementById("courts").value);
  r.matches.forEach((m,i)=>{
    courtsDiv.innerHTML+=`
      <div class="court">
        <div class="court-title">Court ${i+1}</div>
        <div class="vs">${m[0]} vs ${m[1]}</div>
        <div>
          <input class="score-input" type="number"> :
          <input class="score-input" type="number">
        </div>
      </div>`;
  });
  for(let i=r.matches.length;i<totalCourts;i++){
    courtsDiv.innerHTML+=`
      <div class="court" style="background:#ffe0e0">
        <div class="court-title">Court ${i+1}</div>
        <div class="vs">Unused</div>
      </div>`;
  }
  div.appendChild(courtsDiv);
  const sit=document.createElement("div");
  sit.className="sitout";
  sit.innerHTML=`<strong>Sit out:</strong> ${r.sitOut.join(", ")||"None"}`;
  div.appendChild(sit);
  document.getElementById("rounds").appendChild(div);
}

export function buildScoreboard(teams){
  const data = {};
  teams.forEach(t => data[t] = {won:0,lost:0,points:0});
  function update(){
    teams.forEach(t => data[t] = {won:0,lost:0,points:0});
    document.querySelectorAll(".court").forEach(c=>{
      const vs=c.querySelector(".vs");
      const inputs=c.querySelectorAll(".score-input");
      if(!vs||inputs.length!==2) return;
      const [a,b]=vs.textContent.split(" vs ");
      const sa=parseInt(inputs[0].value)||0;
      const sb=parseInt(inputs[1].value)||0;
      data[a].points+=sa; data[b].points+=sb;
      if(sa>sb){data[a].won++; data[b].lost++;}
      if(sb>sa){data[b].won++; data[a].lost++;}
    });
    const sorted = [...teams].sort((x,y)=>{
      if(data[y].won !== data[x].won) return data[y].won - data[x].won;
      return data[y].points - data[x].points;
    });
    let html=`<table><tr><th>Team</th><th>Won</th><th>Lost</th><th>Points</th></tr>`;
    sorted.forEach(t => html+=`<tr><td>${t}</td><td>${data[t].won}</td><td>${data[t].lost}</td><td>${data[t].points}</td></tr>`);
    html+="</table>";
    document.getElementById("score").innerHTML=html;
  }
  document.addEventListener("input", e=>{if(e.target.classList.contains("score-input")) update();});
  update();
}
