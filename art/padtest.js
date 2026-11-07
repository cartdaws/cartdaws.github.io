(async()=>{const g=window.__g, I=g.input, sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const out={};
 const pad={id:'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0})),vibrationActuator:{playEffect:(t,o)=>{(window.__rumbles=window.__rumbles||[]).push(o.duration);return Promise.resolve();}}};
 navigator.getGamepads=()=>[pad];
 const press=async(i,ms=500)=>{pad.buttons[i]={pressed:true,value:1};await sleep(ms);pad.buttons[i]={pressed:false,value:0};await sleep(400);};
 const hold=async(fn,ms)=>{fn(true);await sleep(ms);fn(false);};
 // 1 menu: first touch shows focus, down moves it, cross selects
 await press(13); out.focus1=document.activeElement&&document.activeElement.id; await press(13); out.focus2=document.activeElement&&document.activeElement.id; await press(12); out.focus3=document.activeElement&&document.activeElement.id;
 out.padActive=I.padActive; out.bodyPad=document.body.classList.contains('pad');
 await press(0); await sleep(2500);
 out.state=g.state; out.locked=I.locked;
 // 2 play: move forward
 const z0=g.player.pos.z, x0=g.player.pos.x, yaw0=g.player.yaw; await hold((d)=>{pad.axes[1]=d?-1:0;},1500); out.movedZ=+(g.player.pos.z-z0).toFixed(2);
 await hold((d)=>{pad.axes[2]=d?1:0;},900); out.yawDelta=+(g.player.yaw-yaw0).toFixed(2);
 // 3 fire and absorb are the mouse buttons
 pad.buttons[7]={pressed:true,value:1}; await sleep(100); out.fireHeld=I.buttons.has(0); pad.buttons[7]={pressed:false,value:0}; await sleep(100);
 pad.buttons[6]={pressed:true,value:1}; await sleep(100); out.absorbHeld=I.buttons.has(2); pad.buttons[6]={pressed:false,value:0}; await sleep(100);
 // 4 jump
 let maxY=0; const iv=setInterval(()=>{maxY=Math.max(maxY,g.player.pos.y)},10); await press(0,300); await sleep(600); clearInterval(iv); out.jumpHeight=+maxY.toFixed(2);
 // 5 dash and rumble
 const p0=g.player.pos.clone(); pad.axes[1]=-1; await press(1,300); pad.axes[1]=0; out.dashed=g.player.dashCd>0||g.player.dashing;
 out.rumbles=(window.__rumbles||[]).length;
 // 6 pause, then resume from the pause menu
 await press(9); await sleep(300); out.paused=g.paused; out.menuVisible=!document.getElementById('menu-pause').classList.contains('hidden'); 
 await press(13); out.focusInPause=document.activeElement&&document.activeElement.id; await press(9); await sleep(800); out.resumed=!g.paused;
 // 7 keyboard takes over again
 document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'})); out.padAfterKey=I.padActive; return out})()
