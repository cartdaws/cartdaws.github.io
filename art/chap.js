(async()=>{const g=window.__g; g.lab.start(true); await new Promise(r=>setTimeout(r,2500));
 g.viewmodel.scene.visible=false; g.body.setVisible=()=>{g.body.group.visible=false; g.body.v2&&g.body.v2.setVisible(false)};
 document.querySelectorAll('#hud,#weapon').forEach(e=>e.style.display='none');
 const R=g.run.rooms, i=__I__, r=R[i]; g.player.reset(r.cx, r.z1-1.8, 0); g.player.pitch=0.12;
 g.enemies.forEach(e=>{e.pos.y=-50}); 
 return R.map(q=>q.theme.id+':'+q.kind).join(' ')})()
