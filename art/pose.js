(async()=>{const g=window.__g, T=window.__THREE; g.lab.gym.enter(false); await new Promise(r=>setTimeout(r,1500));
 const mk=(v,x)=>{const e=g.makeEnemy({type:'android',variant:v,x,z:84}); e.inert=true; e.yaw=e.group.rotation.y=Math.PI; g.enemies.push(e); return e;};
 mk('trooper',-1.5); mk('scout',0.1); mk('heavy',1.8);
 g.viewmodel.scene.visible=false; g.body.setVisible=()=>{g.body.group.visible=false; g.body.v2&&g.body.v2.setVisible(false)}; g.player.reset(0.2,86.6,0); g.player.pitch=-0.02;
 const L=new T.PointLight(0xcfe4ff,6,9); L.position.set(0.2,2.4,86); g.scene.add(L); const L2=new T.PointLight(0xffc890,3,8); L2.position.set(-2,1.2,82.5); g.scene.add(L2);
 document.querySelectorAll('#hud,#weapon').forEach(e=>e.style.display='none'); return 1})()
