(async()=>{const g=window.__g; const P=await import('/src/world/procgen.js'); g.lab.start(true); await new Promise(r=>setTimeout(r,1500));
 P.disposeRun(g,g.run); const N=__N__, S0=__S0__, RETRY=__R__; const rows=[]; const t0=performance.now(); const themes={}, shapes={}, issueTypes={}, byShape={}, shapeTotal={}, attempts={};
 let sideRooms=0, doorOff=[], rects=0, tall=new Set(), sizes=new Set();
 for(let k=0;k<N;k++){ const seed=S0+k*101; const run=P.generateRun(g,{seed,retries:RETRY}); attempts[run.attempt]=(attempts[run.attempt]||0)+1;
  const rr=run.rooms.filter(r=>r.kind!=='lift'); for(const r of rr){ themes[r.theme.id]=(themes[r.theme.id]||0)+1; const sh=r.shape||'rect'; shapes[sh]=(shapes[sh]||0)+1; shapeTotal[sh]=(shapeTotal[sh]||0)+1; tall.add(r.h); sizes.add(r.w+'x'+r.d); }
  for(const i of run.issues){ const t=i.split(':')[0]; issueTypes[t]=(issueTypes[t]||0)+1; const m=i.match(/room (\d+)/); if(m){ const r=run.rooms[+m[1]-1]; const key=(r&&r.shape)+'/'+t; byShape[key]=(byShape[key]||0)+1; } }
  for(const rj of run.rejected||[]) for(const i of rj.issues){ const t=i.split(':')[0]; issueTypes['rej_'+t]=(issueTypes['rej_'+t]||0)+1; }
  rows.push({seed,issues:run.issues.length,first:run.issues[0]||''}); P.disposeRun(g,run); }
 const bad=rows.filter(r=>r.issues);
 return {ms:Math.round(performance.now()-t0), runs:N, invalidFinal:bad.length, attempts, issueTypes, byShape, shapes, themes, heights:[...tall].sort().length, sizes:sizes.size, examples:bad.slice(0,4).map(r=>r.seed+': '+r.first)}})()
