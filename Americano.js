export function generateAmericano(players, courts){
  const rounds = [];
  const pool = [...players];
  const slots = courts * 4;

  // Track all pairings
  const allPairs = new Set();
  for(let i=0;i<pool.length;i++){
    for(let j=i+1;j<pool.length;j++){
      allPairs.add([pool[i],pool[j]].sort().join("|"));
    }
  }

  // Track which pairs have already played
  let usedPairs = new Set();

  // Sit-out queue
  let sitQueue = [...pool];

  // Generate enough rounds to ensure everyone can pair properly
  const maxRounds = Math.ceil(allPairs.size / (courts * 6)) * 2;

  for(let r=0; r<maxRounds; r++){
    const sitCount = Math.max(0, pool.length - slots);
    if(sitQueue.length < sitCount) sitQueue = [...pool];
    const sitOut = sitQueue.splice(0, sitCount);
    const active = pool.filter(p => !sitOut.includes(p));

    const matches = [];
    const usedThisRound = new Set();

    while(active.filter(p => !usedThisRound.has(p)).length >= 4){
      const candidates = active.filter(p => !usedThisRound.has(p));
      // pick first 4 players that have minimal repeat pairings
      let bestCombo = null;
      let minRepeat = Infinity;
      for(let i=0;i<candidates.length-3;i++){
        for(let j=i+1;j<candidates.length-2;j++){
          for(let k=j+1;k<candidates.length-1;k++){
            for(let l=k+1;l<candidates.length;l++){
              const combo = [candidates[i],candidates[j],candidates[k],candidates[l]];
              let repeat = 0;
              const pairs = [
                [combo[0],combo[1]], [combo[0],combo[2]], [combo[0],combo[3]],
                [combo[1],combo[2]], [combo[1],combo[3]], [combo[2],combo[3]]
              ];
              for(const p of pairs){
                if(usedPairs.has(p.sort().join("|"))) repeat++;
              }
              if(repeat < minRepeat){ minRepeat=repeat; bestCombo=combo;}
            }
          }
        }
      }

      if(!bestCombo) break;
      const A = [bestCombo[0], bestCombo[1]];
      const B = [bestCombo[2], bestCombo[3]];
      matches.push({A,B});
      bestCombo.forEach(p => usedThisRound.add(p));

      const pairsToAdd = [[A[0],A[1]],[B[0],B[1]],[A[0],B[0]],[A[0],B[1]],[A[1],B[0]],[A[1],B[1]]];
      pairsToAdd.forEach(p => usedPairs.add(p.sort().join("|")));
    }

    rounds.push({matches,sit:sitOut});

    if(usedPairs.size >= allPairs.size) usedPairs.clear();
  }

  return rounds;
}

export function renderAmericanoRound(num,r){
  const div=document.createElement("div");
  div.className="round";
  div.innerHTML=`<div class="round-header">Round ${num}</div>`;
  const courtsDiv=document.createElement("div");
  courtsDiv.className="courts";

  r.matches.forEach((m,i)=>{
    courtsDiv.innerHTML+=`
      <div class="court">
        <div class="court-title">Court ${i+1}</div>
        <div class="vs">
          ${m.A[0]} & ${m.A[1]}<br>vs<br>${m.B[0]} & ${m.B[1]}
        </div>
      </div>`;
  });
  div.appendChild(courtsDiv);

  const sit=document.createElement("div");
  sit.className="sitout";
  sit.innerHTML=`<strong>Sit out:</strong> ${r.sit.join(", ")||"None"}`;
  div.appendChild(sit);
  document.getElementById("americanoOutput").appendChild(div);
}
