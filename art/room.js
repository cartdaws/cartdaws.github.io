(async()=>{const g=window.__g; g.lab.gym.enter(false); await new Promise(r=>setTimeout(r,2000));
 g.viewmodel.scene.visible=false; g.body.setVisible=()=>{g.body.group.visible=false; g.body.v2&&g.body.v2.setVisible(false)};
 document.querySelectorAll('#hud,#weapon').forEach(e=>e.style.display='none');
 g.player.reset(__X__,__Z__,__YAW__); g.player.pitch=__PITCH__; return 1})()
