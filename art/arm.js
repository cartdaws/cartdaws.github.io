(async()=>{const g=window.__g; const {MUTATIONS}=await import('/src/v2/mutations.js'); g.lab.gym.enter(false); await new Promise(r=>setTimeout(r,1200));
 const E=g.evolution; const id='__ID__'; E.grow(MUTATIONS[id]); E.deepen(E.equipped[0]); E.deepen(E.equipped[0]); E.equipped[0].grow=1; E.selected=0; E.recompute(); E.applyLook(true);
 g.player.reset(0,88,0); g.player.pitch=0; E.energy=100;
 await new Promise(r=>setTimeout(r,1500));
 if('__FIRE__'==='1'){ E.cool=0; const a=E.active.attack; const ti=2; E.energy-=a.cost[ti]; const ab=E.abilities; const f={blast:'blast',rail:'rail',seek:'seek',slam:'slam'}[a.type]; ab[f](a,ti,1); await new Promise(r=>setTimeout(r,__WAIT__)); }
 return E.equipped.map(q=>q.m.id+':'+q.tier)})()
