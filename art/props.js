(async()=>{const g=window.__g; g.lab.gym.enter(false); await new Promise(r=>setTimeout(r,1500));
 g.viewmodel.scene.visible=false; g.body.setVisible=()=>{g.body.group.visible=false; g.body.v2&&g.body.v2.setVisible(false)};
 document.querySelectorAll('#hud,#weapon').forEach(e=>e.style.display='none');
 const names=__NAMES__; let x=-12; const G=g.lab.gym.group;
 for(const n of names){ const f=g.kit.footprint(n,0); g.kit.place(G,n,{x:x+f.w/2,y:0,z:88,rotY:0}); x+=f.w+1.2; }
 setInterval(()=>{g.player.pos.y=5.1; g.player.vy=0; g.player.pos.x=0; g.player.pos.z=88.5; g.player.pitch=-1.45;},4);
 g.player.yaw=0; return x})()
