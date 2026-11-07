(async()=>{const g=window.__g, sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const G=await import('/src/world/roomgeom.js'); const out=[];
 for(const seed of __SEEDS__){
  g.nextSeed=seed; g.lab.start(true); await sleep(1500); const E=g.encounter, run=g.run; const rec={seed, rooms:run.rooms.length, side:run.sideRooms.length, loops:run.loops.length, log:[]};
  let guard=0, last=-1, stuck=0;
  while(E.i < E.rooms.length-1 && guard++<60){
    const r=E.room; const p=G.doorPos(r,r.inSide), d={zmin:[0,1],zmax:[0,-1],xmin:[1,0],xmax:[-1,0]}[r.inSide];
    if(E.i===last) stuck++; else {stuck=0; last=E.i;}
    if(stuck>8){ rec.log.push('STUCK at '+E.i+' state '+E.state); break; }
    g.player.reset(p.x+d[0]*2.6, p.z+d[1]*2.6, 0); g.player.dead=false; g.player.health=100; await sleep(900);
    for(let k=0;k<6;k++){ for(const e of g.enemies) if(e.alive) e.die(true); await sleep(500); }
  }
  rec.finalI=E.i; rec.total=E.rooms.length-1; rec.state=E.state;
  // side doors of combat rooms opened, loops live
  rec.sideDoorsOpen=run.rooms.every(r=>!r.sideDoors||r.sideDoors.every(d=>d.target===0||d.closeness<0.5));
  rec.loopsLive=run.loops.every(l=>l.live);
  rec.pickups=g.pickups.items?g.pickups.items.length:undefined;
  out.push(rec); }
 return out})()
