(async()=>{const g=window.__g; g.lab.gym.enter(false); await new Promise(r=>setTimeout(r,1500));
 g.viewmodel.scene.visible=false; g.body.setVisible=()=>{g.body.group.visible=false; g.body.v2&&g.body.v2.setVisible(false)};
 document.querySelectorAll('#hud,#weapon').forEach(e=>e.style.display='none');
 g.scene.environmentIntensity=__ENV__; g.player.reset(0.2,82.6,0); g.player.pitch=-0.42; return 1})()
