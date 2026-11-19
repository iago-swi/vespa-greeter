(() => {
  'use strict';
  const $=id=>document.getElementById(id), scene=$('scene'),sky=$('sky'),skyCtx=sky.getContext('2d');
  const course=Alps.length,startLine=22,clamp=(v,l,h)=>Math.min(h,Math.max(v,l));
  const cache=new Map(), reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode='intro',dialog='',returnTo='intro',distance=0,time=0,score=0,hits=0,missed=0,errors=0;
  let traffic=[],serial=0,nextSpawn=0,saluteTime=-4,feedbackEnd=0,clock=0,last=0,startBlend=0,visibleTarget=null;
  let best=null;try{const saved=localStorage.getItem('ciao-vespa-best');if(saved!==null && Number.isFinite(+saved))best=+saved}catch{}
  let audio=null,engineTone=null,motorGain=null,sound=false;
  function initAudio(){
    if(audio)return;
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    audio=new Audio();engineTone=audio.createOscillator();engineTone.type='sawtooth';engineTone.frequency.value=47;
    const low=audio.createBiquadFilter();low.type='lowpass';low.frequency.value=195;
    motorGain=audio.createGain();motorGain.gain.value=0;engineTone.connect(low);low.connect(motorGain);motorGain.connect(audio.destination);engineTone.start();
  }
  function motor(){if(motorGain)motorGain.gain.setTargetAtTime((sound&&mode==='ride'&&!dialog) ? .022 : 0,audio.currentTime,.12)}
  function note(f,d,delay=0){
    if(!sound||!audio)return;const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+d+.02);
  }
  function toggleSound(){try{initAudio();if(!audio)return;sound=!sound;if(sound)audio.resume();$('soundIcon').setAttribute('href',sound?'#sound':'#mute');$('soundLabel').textContent=sound?'Sound on':'Sound off';$('soundBtn').setAttribute('aria-pressed',String(sound));motor();if(sound)note(523,.12)}catch{}}
  function vehicle(kind,v,wave){
    const pose=Math.round(clamp(wave,0,1)*5),key=[kind,v,pose].join('-');
    if(!cache.has(key))cache.set(key,Engine.mesh(()=>Vehicles.draw(kind,v,pose/5)));
    return cache.get(key);
  }
  const shadowCache=new Map();
  function vehicleShadow(kind){
    if(!shadowCache.has(kind))shadowCache.set(kind,Engine.mesh(()=>{
      const w=kind==='truck'?1.13:kind==='car'?.96:.44,len=kind==='truck'?2.4:kind==='car'?1.8:.98;
      for(let i=0;i<2;i++){let ring=[];for(let j=0;j<14;j++){const a=-j/14*Math.PI*2;ring.push([.08+(w-i*.09)*Math.cos(a),.025+i*.003,.04+(len-i*.1)*Math.sin(a)])}G.poly(ring,i?'#505853':'#646d64')}
    }));return shadowCache.get(kind);
  }
  const mapPoint=p=>[12+(p.x+49)*.43,66-(p.z+80)*.176];
  const mapPoints=Alps.samples.filter((p,i)=>i%7===0).map(mapPoint);
  $('mapPath').setAttribute('d','M'+mapPoints.map(p=>p.map(v=>v.toFixed(1)).join(' ')).join('L')+'Z');
  function updateMap(s){
    const pos=mapPoint(Alps.path(s+startLine));$('mapDot').setAttribute('cx',pos[0]);$('mapDot').setAttribute('cy',pos[1]);
    $('mapKm').textContent=(course/1000).toFixed(1)+' km';$('mapNote').textContent=mode==='intro'?'Loop':Math.round(distance/course*100)+'%';
  }
  function reflect(){
    scene.dataset.state=mode;$('intro').hidden=mode!=='intro';$('hud').hidden=mode==='intro';$('tap').hidden=mode!=='ride'||!!dialog;
    $('score').textContent=score;$('count').textContent=hits;$('routeLabel').textContent=mode==='intro'?'The circuit':'Your route';
    $('introBest').hidden=best===null;$('introBest').textContent='Personal best · '+best+' pts';updateMap(distance);motor();
  }
  const row=(a,b)=>'<div class="resultrow"><span>'+a+'</span><b>'+b+'</b></div>';
  function openDialog(which){
    if(!dialog)returnTo=mode;
    dialog=which;$('veil').hidden=false;$('dismiss').hidden=which==='finish';$('sheetSecond').hidden=true;
    if(which==='help'){
      $('sheetTitle').textContent='How to ride';$('sheetBody').innerHTML='<p>Your Vespa steers itself around the lake.</p><ol class="help-list"><li>Look for a motorcyclist raising a hand. A <em>Ciao!</em> appears above the rider.</li><li>Press <kbd>Space</kbd> or tap <b>Salute</b> before you pass to earn <b>10 points</b>.</li><li>Let quiet riders, cyclists, cars and trucks pass. An uninvited salute costs <b>5 points</b>.</li></ol>';
      $('sheetAction').textContent=mode==='intro'?'Got it':'Resume ride';
    }else if(which==='pause'){
      $('sheetTitle').textContent='Ride paused';$('sheetBody').innerHTML=row('Distance',Math.round(distance)+' / '+Math.round(course)+' m')+row('Score',score+' pts');
      $('sheetAction').textContent='Resume ride';$('sheetSecond').hidden=false;$('sheetSecond').textContent='Restart loop';
    }else {
      $('sheetTitle').textContent='Giro completo!';$('sheetBody').innerHTML=row('Final score',score+' pts')+row('Greetings returned',hits+' / '+(hits+missed))+row('Uninvited salutes',errors)+row('Personal best',best+' pts');$('sheetAction').textContent='Ride again';$('sheetSecond').hidden=false;$('sheetSecond').textContent='Title screen';
    }
    $('callout').hidden=true;$('tap').hidden=true;motor();$('sheetAction').focus({preventScroll:true});
  }
  function closeDialog(){
    if(dialog==='finish')return;dialog='';$('veil').hidden=true;reflect();
    (mode==='intro'?$('start'):$('tap')).focus({preventScroll:true});
  }
  const seq=['moto','car','moto','cycle','moto','truck','moto','car','moto','moto','cycle','truck','moto','car','moto','cycle'];
  function spawn(d){
    const n=serial++,kind=seq[n%seq.length],v=kind==='vespa'?0:n%3;
    traffic.push({kind,v,d,speed:kind==='cycle'?3.7:kind==='truck'?6.8:kind==='car'?9:7.6,
      greets:kind==='moto'&&(n===0||n===4||(n!==2&&Math.random()<.69)),acted:false,miss:false,onset:36+Math.random()*7});
  }
  function start(){
    dialog='';$('veil').hidden=true;mode='ride';distance=time=score=hits=errors=missed=serial=0;
    startBlend=0;traffic=[];saluteTime=-4;feedbackEnd=0;visibleTarget=null;$('feedback').className='';
    spawn(64);spawn(147);nextSpawn=4.8;reflect();$('start').blur();$('sheetAction').blur();
  }
  function title(){
    mode='intro';dialog='';$('veil').hidden=true;distance=0;traffic=[];$('feedback').className='';$('callout').hidden=true;reflect();$('start').focus();
  }
  function toast(message,bad=false){
    $('feedback').textContent=message;$('feedback').className=bad?'show error':'show';feedbackEnd=time+1.35;
  }
  function salute(){
    if(mode!=='ride'||dialog||time-saluteTime<.68)return;
    saluteTime=time;
    const rider=traffic.find(t=>t.d>0&&t.d<=t.onset&&t.greets&&!t.acted);
    if(rider){rider.acted=true;hits++;score+=10;toast('Ciao!  +10');note(659,.14);note(880,.2,.10)}
    else{errors++;score-=5;toast('Uninvited salute  −5',true);note(196,.2)}
    $('score').textContent=score;$('count').textContent=hits;
  }
  $('start').onclick=start;$('helpBtn').onclick=()=>{if(!dialog)openDialog('help')};$('soundBtn').onclick=toggleSound;$('pauseBtn').onclick=()=>{if(!dialog)openDialog('pause')};
  $('tap').onclick=salute;$('dismiss').onclick=closeDialog;
  $('sheetAction').onclick=()=>dialog==='finish'?start():closeDialog();
  $('sheetSecond').onclick=()=>dialog==='finish'?title():start();
  $('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('fullBtn').hidden=true}};
  if(!document.fullscreenEnabled)$('fullBtn').hidden=true;
  document.addEventListener('fullscreenchange',()=>{$('fullBtn').setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Enter full screen')});
  document.addEventListener('keydown',e=>{
    if(e.code==='Tab'&&dialog){
      const buttons=[...$('veil').querySelectorAll('button:not([hidden])')];
      if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus()}
      else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus()}
      return;
    }
    if(e.repeat){if(['Space','KeyP','Escape','Enter'].includes(e.code))e.preventDefault();return}
    if(dialog){if(e.code==='Escape'||(e.code==='KeyP'&&dialog==='pause')){e.preventDefault();closeDialog()}return}
    if(mode==='ride'&&e.code==='Space'){e.preventDefault();salute()}
    else if(mode==='ride'&&(e.code==='KeyP'||e.code==='Escape')){e.preventDefault();openDialog('pause')}
    else if(mode==='intro'&&e.code==='Enter'&&(!document.activeElement?.closest('button')||document.activeElement===$('start'))){e.preventDefault();start()}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='ride'&&!dialog)openDialog('pause');last=0});
  function update(dt){
    time+=dt;startBlend=Math.min(1,startBlend+dt*.8);
    const speed=11.6+1.2*Math.sin(distance/course*Math.PI*4);
    distance=Math.min(course,distance+speed*dt);
    if(engineTone)engineTone.frequency.value=45+speed*.7+Math.sin(time*4)*.85;
    nextSpawn-=dt;if(nextSpawn<=0&&distance<course-65){spawn(145);nextSpawn=4.15+Math.random()*1.1}
    for(const t of traffic){
      t.d-=dt*(speed+t.speed);
      if(t.d<=0&&t.greets&&!t.acted&&!t.miss){t.miss=true;missed++;if(feedbackEnd<time)toast('Greeting missed')}
    }
    traffic=traffic.filter(t=>t.d> -16);
    if(time>=feedbackEnd)$('feedback').className='';
    if(distance>=course){mode='finish';best=best===null?score:Math.max(score,best);try{localStorage.setItem('ciao-vespa-best',String(best))}catch{}reflect();openDialog('finish');note(523,.15);note(659,.16,.14);note(784,.34,.27)}
    updateMap(distance);
  }
  // Painted cloud banks are anchored to compass bearings as the camera turns.
  const skyClouds=Array.from({length:32},(_,i)=>({a:i*.593,size:11+(i*31%36),height:7+i*23%18,seed:i}));
  function skyPaint(heading,fov,pitch){
    const w=sky.clientWidth,h=sky.clientHeight;if(sky.width!==w||sky.height!==h){sky.width=w;sky.height=h}
    const ctx=skyCtx,g=ctx.createLinearGradient(0,0,0,h*.81);g.addColorStop(0,'#83bfc9');g.addColorStop(.45,'#c6ddd5');g.addColorStop(.76,'#f3e1c1');g.addColorStop(1,'#f7dab0');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const lens=h/(2*Math.tan(fov*Math.PI/360));
    const bearing=a=>Math.atan2(Math.sin(a-heading),Math.cos(a-heading));
    const project=(a,e)=>{const diff=bearing(a);if(Math.abs(diff)>1.5)return null;return [w/2+lens*Math.tan(diff),h/2-lens*Math.tan(e-pitch)/Math.cos(diff)]};
    let sun=project(-.58,.246);if(sun){
      let [x,y]=sun,r=h*.051;let glow=ctx.createRadialGradient(x,y,r*.3,x,y,r*4);
      glow.addColorStop(0,'#fff2c8c2');glow.addColorStop(1,'#fff0c600');ctx.fillStyle=glow;ctx.fillRect(x-r*4,y-r*4,r*8,r*8);ctx.fillStyle='#fff0bd';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    for(const c of skyClouds){
      let p=project(c.a,c.height*Math.PI/180);if(!p)continue;const sz=h*c.size/1400;
      if(p[0]<-sz*5||p[0]>w+sz*5)continue;
      ctx.save();ctx.translate(p[0],p[1]);ctx.scale(sz,sz);ctx.fillStyle=c.seed%2?'#f7eddaa1':'#fff2dca8';
      ctx.beginPath();ctx.moveTo(-3.7,.27);ctx.bezierCurveTo(-3.3,-.01,-2.85,-.1,-2.4,-.1);ctx.bezierCurveTo(-2.1,-.37,-1.8,-.52,-1.4,-.42);ctx.bezierCurveTo(-1.18,-.91,-.81,-1.08,-.28,-.86);ctx.bezierCurveTo(.12,-1.35,.84,-1.12,1.04,-.69);ctx.bezierCurveTo(1.51,-.83,1.85,-.49,1.98,-.39);ctx.bezierCurveTo(2.5,-.51,2.85,-.26,3.04,-.12);ctx.lineTo(4.1,.17);ctx.bezierCurveTo(2.4,.31,-2.6,.37,-3.7,.27);ctx.fill();ctx.restore();
    }
  }
  function render(){
    const mobile=scene.clientWidth/scene.clientHeight<.9;
    const intro=mode==='intro',s=distance+startLine,p=Alps.path(s),r=Alps.at(s,1.68,.035);
    const blend=intro?0:startBlend*startBlend*(3-2*startBlend);
    const offset=intro&&!reduced?Math.sin(clock*.105)*.065:0;
    const side=(mobile?1.2:.85)*(1-blend),back=(mobile?4.65:4.45)*(1-blend)+4.2*blend;
    const front=[Math.sin(p.ang),0,Math.cos(p.ang)],right=[p.rx,0,p.rz];
    const eye=[r[0]-front[0]*back+right[0]*(side+offset),r[1]+(mobile?1.68:1.96)*(1-blend)+1.85*blend,r[2]-front[2]*back+right[2]*(side+offset)];
    const peek=Alps.at(s+8,1.6),fov=mobile?60:49;
    const framing=(mobile?-.31:-.49)*(1-blend);
    const lookAngle=p.ang+framing+blend*Math.atan2(Math.sin(Math.atan2(peek[0]-r[0],peek[2]-r[2])-p.ang),Math.cos(Math.atan2(peek[0]-r[0],peek[2]-r[2])-p.ang))*.58;
    const pitch=mobile?(-.3*(1-blend)-.13*blend):(-.11-.025*blend);
    const target=[eye[0]+Math.sin(lookAngle),eye[1]+Math.tan(pitch),eye[2]+Math.cos(lookAngle)];
    Engine.begin(eye,target,fov);skyPaint(lookAngle,fov,pitch);Alps.draw();
    Engine.draw(vehicleShadow('vespa'),...r,p.ang);
    const wave=mode==='ride'?Math.max(0,Math.sin(clamp((time-saluteTime)/.76,0,1)*Math.PI)) :0;
    Engine.draw(vehicle('vespa',0,wave),...r,p.ang);
    visibleTarget=null;
    const list=intro?[{kind:'moto',v:1,d:26,greets:false},{kind:'car',v:2,d:55,greets:false}]:traffic;
    for(const t of list){
      const pos=Alps.at(s+t.d,-1.7,.036),angle=Alps.path(s+t.d).ang+Math.PI;
      const active=t.greets&&t.d<=t.onset&&t.d>0,w=active?clamp((t.onset-t.d)/3,0,1):0;
      Engine.draw(vehicleShadow(t.kind),...pos,angle);
      Engine.draw(vehicle(t.kind,t.v,w),...pos,angle,1,3);
      if(active&&!t.acted&&!dialog&&mode==='ride'){const v=Engine.project(pos[0],pos[1]+2.05,pos[2]);if(v.d>0)visibleTarget=v}
    }
    Engine.end();
    $('callout').hidden=!visibleTarget;
    if(visibleTarget){$('callout').style.left=clamp(visibleTarget.x*100,4,94)+'%';$('callout').style.top=clamp(visibleTarget.y*100,12,94)+'%'}
  }
  let drawnWidth=0,drawnHeight=0,prevMode='',prevDialog='';
  function frame(stamp){
    const dt=last?Math.min((stamp-last)/1000,.12):0;last=stamp;
    if(!document.hidden){
      if(mode==='ride'&&!dialog)update(dt);
      clock+=dt;
      if((mode==='ride'&&!dialog)||(mode==='intro'&&!reduced&&!dialog && (clock%(Engine.hardware?.07:.25)<dt))||drawnWidth!==scene.clientWidth||drawnHeight!==scene.clientHeight||prevMode!==mode||prevDialog!==dialog){
        render();drawnWidth=scene.clientWidth;drawnHeight=scene.clientHeight;prevMode=mode;prevDialog=dialog;
      }
    }
    requestAnimationFrame(frame);
  }
  reflect();requestAnimationFrame(frame);
})();
