(async()=>{const g=window.__g; const P=await import('/src/world/procgen.js'); g.lab.start(true); await new Promise(r=>setTimeout(r,1500));
 P.disposeRun(g,g.run); const N=__N__, S0=__S0__, rows=[]; const t0=performance.now(); const kinds={}, shapes={}, issueTypes={};
 for(let k=0;k<N;k++){ const seed=S0+k*101; const run=P.generateRun(g,{seed,retries:0});
  const rr=run.rooms.filter(r=>r.kind!=='lift'); for(const r of rr){ const key=r.theme.id; kinds[key]=(kinds[key]||0)+1; const sh=r.shape||'rect'; shapes[sh]=(shapes[sh]||0)+1; }
  for(const i of run.issues){ const t=i.split(':')[0]; issueTypes[t]=(issueTypes[t]||0)+1; }
  rows.push({seed,rooms:run.rooms.length,issues:run.issues.length,first:run.issues[0]||'', sig:rr.map(r=>[r.w,r.d,r.h].join('x')).join(' ')});
  P.disposeRun(g,run); }
 const bad=rows.filter(r=>r.issues); const sigs=new Set(rows.map(r=>r.sig));
 return {ms:Math.round(performance.now()-t0), runs:N, invalid:bad.length, issueTypes, themes:kinds, shapes, distinctLayouts:sigs.size, examples:bad.slice(0,6).map(r=>r.seed+': '+r.first)}})()
