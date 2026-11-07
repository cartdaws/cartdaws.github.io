(async()=>{const g=window.__g, sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const G=await import('/src/world/roomgeom.js');
 g.nextSeed=__SEED__; g.lab.start(true); await sleep(1500); const r=g.run.rooms[__IDX__];
 g.viewmodel.scene.visible=false; g.body.setVisible=()=>{g.body.group.visible=false; g.body.v2&&g.body.v2.setVisible(false)}; document.querySelectorAll('#hud,#weapon').forEach(e=>e.style.display='none');
 for(const e of g.enemies) e.pos.y=-50;
 const p=G.doorPos(r,r.inSide), d={zmin:[0,1],zmax:[0,-1],xmin:[1,0],xmax:[-1,0]}[r.inSide]; const yaw={zmin:Math.PI,zmax:0,xmin:-Math.PI/2,xmax:Math.PI/2}[r.inSide];
 g.player.reset(p.x+d[0]*__BACK__, p.z+d[1]*__BACK__, yaw); g.player.pitch=__PITCH__; return {shape:r.shape, inSide:r.inSide, w:r.w, d:r.d}})()
