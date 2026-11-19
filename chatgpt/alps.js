const Alps = (() => {
  const TAU=Math.PI*2, points=[[0,0],[-4,48],[-29,93],[-47,138],[-42,179],[-15,221],[38,251],[88,249],[127,218],[136,168],[122,134],[123,102],[149,67],[157,23],[143,-20],[107,-64],[62,-77],[23,-52]];
  const wrap=(n,m)=>(n%m+m)%m;
  const random=(i)=>{const k=Math.sin(i*78.233+19.1)*43758.5453;return k-Math.floor(k)};
  const pick=(a,i)=>a[Math.floor(random(i)*a.length)];
  function spline(t){
    const i=Math.floor(t),u=t-i,a=points[wrap(i-1,points.length)],b=points[i%points.length],c=points[(i+1)%points.length],d=points[(i+2)%points.length];
    return b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*u+(2*a[k]-5*v+4*c[k]-d[k])*u*u+(-a[k]+3*v-3*c[k]+d[k])*u*u*u));
  }
  const samples=[];let length=0;
  for(let i=0;i<=points.length*36;i++){
    const p=spline(i/36);if(i)length+=Math.hypot(p[0]-samples[i-1].x,p[1]-samples[i-1].z);
    samples.push({x:p[0],z:p[1],s:length});
  }
  function path(s){
    s=wrap(s,length);let lo=0,hi=samples.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].s>s)hi=mid;else lo=mid}
    const a=samples[lo],b=samples[hi],t=(s-a.s)/(b.s-a.s),ang=Math.atan2(b.x-a.x,b.z-a.z);
    const phase=s/length*TAU;
    return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:9.4+2.1*Math.sin(phase+.6)+1.8*Math.cos(phase*2-.25)+.55*Math.sin(phase*4),ang,rx:Math.cos(ang),rz:-Math.sin(ang)};
  }
  function height(s,off){
    const p=path(s),phase=wrap(s,length)/length*TAU;
    if(off< -4.5){let d=-off-4.5;return p.y-Math.min(2,d*.12)-Math.max(0,d-3)*(.51+.17*Math.sin(phase*4))+.18*Math.sin(d*.6+phase*11)*Math.min(1,d/5)}
    if(off>4.5){let d=off-4.5;return p.y+d*(.22+.15*Math.cos(phase*2))+.15*Math.sin(d*.48+phase*8)*Math.min(d/5,1)}
    return p.y;
  }
  function at(s,off=0,lift=0){const p=path(s);return [p.x+p.rx*off,height(s,off)+lift,p.z+p.rz*off]}
  const props=[], cache=new Map(), terrain=[], shadows=[];
  const add=(kind,variant,s,off,ang=0,scale=1)=>{const p=at(s,off,-.08);props.push({kind,v:variant,pos:p,a:path(s).ang+ang,k:scale})};
  function landmark(kind,v){let key=kind+v;if(!cache.has(key))cache.set(key,Engine.mesh(()=>Landmarks.draw(kind,v)));return cache.get(key)}
  const tri=(a,b,c,col)=>G.poly([a,b,c],col);
  function surface(a,b,c,d,cl,cr=cl){tri(a,d,c,cl);tri(a,c,b,cr)}
  const grass=['#9ea963','#afa960','#a4ad69','#a9b375','#b4b373','#98a766','#b9ba78'];
  const meadow=['#91a465','#a4ad67','#96a568','#a9b271','#9fa767','#adb476'];
  const rock=['#9e9278','#b9a384','#8a8c7d','#aca087','#c2b292','#929380'];
  function segment(s,n){return s*length/n}
  const roadWidth=3.65,steps=275;
  // Short terrain sections provide useful bounds for frustum culling.
  for(let block=0;block<steps;block+=11){
    const m=Engine.mesh(()=>{
      for(let j=block;j<Math.min(steps,block+11);j++){
        const a=segment(j,steps),b=segment(j+1,steps);
        const band=(l,r,col,lift=0)=>surface(at(a,l,lift),at(a,r,lift),at(b,r,lift),at(b,l,lift),col);
        band(-roadWidth,roadWidth,'#777c78');
        for(const side of [-1,1]){
          band(side*3.53-.045,side*3.53+.045,'#e8ddba',.015);
          let bounds=side<0?[-37,-24,-16,-11,-7.7,-4.55,-3.65]:[3.65,4.55,7.5,12,19,29];
          for(let k=0;k<bounds.length-1;k++){
            const l=bounds[k],r=bounds[k+1],edge=side<0?k===5:k===0;
            let cols=edge?['#c6ba98']:l< -11?rock:l>8?meadow:grass;
            surface(at(a,l),at(a,r),at(b,r),at(b,l),pick(cols,j+k*23),pick(cols,j+92+k*4));
          }
        }
        const h=at(a,29),h2=at(b,29),center=[56,39,99];
        G.poly([h,h2,center],pick(meadow,Math.floor(j/4)));
      }
    });
    terrain.push({m,p:at(segment(block+5,steps)),rad:170});
  }
  const roadDetails=Engine.mesh(()=>{
    for(let s=0;s<length;s+=7.8){
      const e=s+3.35;surface(at(s,-.072,.025),at(s,.072,.025),at(e,.072,.025),at(e,-.072,.025),'#efe5c7');
    }
    for(let i=0;i<1600;i++){
      const s=random(i*3)*length,o=(random(i*3+1)-.5)*7.05,p=at(s,o,.022),w=.012+random(i+52)*.035;
      tri(p,[p[0]+w,p[1],p[2]+.045],[p[0]+w*1.7,p[1],p[2]],i%3?'#888b80':'#696f6b');
    }
    // Weathered timber guardrails reveal the shape of the lake bends.
    for(let s=0;s<length-3;s+=3.4){
      const t=s/length;if((t>.21&&t<.29)||(t>.48&&t<.6)||(t>.8&&t<.88))continue;
      const a=at(s,-4.2),b=at(s+3.4,-4.2);
      G.box(a[0],a[1]+.47,a[2],.18,.94,.2,'#806b55',0,path(s).ang);
      for(const y of [.5,.84])G.tube(a[0],a[1]+y,a[2],b[0],b[1]+y,b[2],.086,.086,'#b5a084',5);
    }
    for(let s=9;s<length;s+=19){
      const side=Math.round(s/19)%3?-1:1,p=at(s,side*3.94),a=path(s).ang;
      G.box(p[0],p[1]+.39,p[2],.14,.79,.18,'#efead5',0,a);
      G.box(p[0],p[1]+.6,p[2],.147,.17,.186,'#454a45',0,a);
    }
  });
  for(let i=0;i<135;i++){
    const s=(i*.618034%1)*length;
    let o=(i%5===0?-1:1)*(8+random(i+81)*22);
    if(o>0 && ((s<130&&s>17)||(s>length*.44&&s<length*.52)))o+=12;
    if(o<0&&s<140)continue;
    add('pine',i%7,s,o,random(i+17)*TAU,.52+random(i+18)*.75);
  }
  const orchard=Engine.mesh(()=>{
    for(let i=0;i<22;i++){
      const s=i<8?25+i*14:220+(i-8)*43,o=7.7+random(i+85)*8.2;
      const [x,y,z]=at(s,o),h=2.8+random(i+91)*1.6;
      G.tube(x,y-.2,z,x+.08,y+h,z,.17,.09,'#79644d',6);
      for(let b=0;b<5;b++){
        const a=b*2.4+i,dx=Math.cos(a)*(b===4?.35:1.15),dz=Math.sin(a)*(b===4?.35:1.13),dy=h+(b===4?1.5:.15)+random(b+i)*.4;
        G.tube(x,y+h*.62,z,x+dx,y+dy,z+dz,.095,.036,'#847254',5);
        G.ball(x+dx,y+dy,z+dz,1.45,1.55,1.43,pick(['#95a35e','#9aa763','#b9b56a','#92a266','#a5ad6b','#a8b16c'],b+i*2),4,7);
      }
    }
  });
  for(let i=0;i<65;i++){let s=random(i+147)*length;add('rock',i%4,s,(i%2?-1:1)*(5+random(i+97)*14),random(i)*TAU,.32+random(i+27)*.85)}
  for(let i=0;i<145;i++){let s=i*length/145;add('flowers',i%5,s,(i%2?-1:1)*(3.87+random(i+423)*2.2),i*2,.75+random(i+8)*.7)}
  for(const [i,s,o,k] of [[0,42,12,1],[1,62,18,.95],[2,79,12,1],[3,94,24,1.07],[1,113,16,.95],[2,136,13,.83],[4,160,22,.91],[0,178,13,.87],[2,length*.46,10,.9],[1,length*.49,19,1],[4,length*.53,12,.92],[0,length*.76,16,.89],[3,length*.8,12,1.02]])add('chalet',i,s,o,-1.6+random(i+s)*.44,k);
  add('church',1,103,26,-1.5,1.08);
  for(let s of [78,153,346,489,611,754])add('sign',0,s,4.85,Math.PI,.92);
  const waterMesh=Engine.mesh(()=>{
    G.poly([[-1800,-.6,-1800],[-1800,-.6,1800],[1800,-.6,1800],[1800,-.6,-1800]],'#72b6b0');
    for(let i=0;i<4100;i++){
      const x=(random(i*3+633)-.5)*1350,z=(random(i*3+646)-.5)*1350, w=.4+random(i+25)**3*15,d=.06+random(i+984)*.43;
      G.poly([[x-w,0,z],[x-.2*w,0,z+d],[x+w,0,z],[x+.4*w,0,z-d]],pick(['#a8d2c5','#81c3ba','#92cbc0','#b2d5c5','#7ebeb4'],i));
    }
    for(const [x,z,a] of [[-69,50,.3],[-113,103,-.25],[-124,21,.64],[180,-134,-.13]]){
      const base=.24, mast=8.4, sail=(dx,y,dz)=>[x+dx*Math.cos(a)+dz*Math.sin(a),y,z-dx*Math.sin(a)+dz*Math.cos(a)];
      G.poly([sail(-.55,.45,-2.5),sail(-.76,.48,.7),sail(0,.58,3.1),sail(.76,.48,.7),sail(.55,.45,-2.5)],'#eee9ce');
      G.tube(x,base,z,x,mast,z,.07,.035,'#795d49',5);
      G.poly([sail(.03,1.13,-.08),sail(.1,mast-.19,0),sail(.28,1.24,-3.05)],'#fff1cd');
      G.poly([sail(.05,1.4,.27),sail(.03,mast-.72,.15),sail(.24,1.12,2.65)],'#d98763');
    }
  });
  // Radial ridgelines surround the circuit. Irregular snowlines follow each peak's gullies.
  const mountains=Engine.mesh(()=>{
    const n=184;
    for(let layer=0;layer<3;layer++){
      const rad=[1070,668,375][layer],base=[130,81,23][layer],amp=[224,122,56][layer],off=layer*1.81;
      const rings=[];
      for(let row=0;row<6;row++){let rowPts=[];
        for(let i=0;i<n;i++){
          const a=TAU*i/n, peak=Math.pow(Math.abs(Math.sin(3*a+off+.8*Math.sin(2*a+off))),1.6);
          const ridges=.34+.55*peak+.19*Math.cos(8*a+off)+.13*Math.sin(13*a-off)+.085*Math.cos(23*a+1)+.063*random(i+layer*48);
          const high=(base+amp*ridges)*[.81,.85,.88][layer], frac=[0,.19,.43,.67,.81,1][row];
          const r=rad*(.59+frac*.41)+[.10,.12,.10,.08,.05,.014][row]*rad*(random(i*4+layer+47)-.52);
          const v=a+(1-frac)*.018*Math.sin(5*a+layer)+.005*(random(i+row*79)-.5);
          rowPts.push([45+Math.sin(v)*r,-8+high*(frac+(row>0&&row<5?(random(i*7+row*18)-.5)*.097:0)),85+Math.cos(v)*r]);
        }rings.push(rowPts)
      }
      const low=[['#95a6b2','#a2b1b6','#91a6b0'],['#739294','#86a49e','#7c9998'],['#638a76','#739981','#7e9e85']][layer];
      const high=[['#8b9aa9','#a4b0bd','#b3b4b9','#bab4b5'],['#829a9f','#91a2a2','#81969a','#acaba5'],['#749382','#92a78d','#829b85']][layer];
      for(let row=0;row<5;row++)for(let i=0;i<n;i++){
        const j=(i+1)%n,p=[rings[row][i],rings[row][j],rings[row+1][j],rings[row+1][i]],snow=layer===0?175:layer===1?150:1000;
        for(let k=0;k<2;k++){
          const f=k?[p[0],p[2],p[3]]:[p[0],p[1],p[2]];
          const y=f.reduce((s,v)=>s+v[1],0)/3;
          const colors=y>snow+14*Math.sin(i*.88)?['#f2e9da','#dae3df','#f6ead7','#e2e4de','#c9d6d9']:row>=2?high:low;
          G.poly(f.reverse(),pick(colors,i*7+row*59+layer*3+k));
        }
      }
    }
  });
  // Distant firs on the far shore have a simpler silhouette at this distance.
  const farTrees=Engine.mesh(()=>{
    for(let i=0;i<940;i++){
      const a=random(i*3+18)*TAU,r=235+random(i*3+53)*30,x=45+Math.sin(a)*r,z=85+Math.cos(a)*r;
      const h=3+random(i+95)*8,y=-2+Math.max(0,r-230)*.21,w=h*.24;
      const c=pick(['#6d9282','#789987','#729583','#829f89','#688f80'],i);
      G.tube(x,y,z,x,y+h,z,w,0,c,4);
    }
  });
  const groundShade=Engine.mesh(()=>{
    for(const p of props){
      if(p.kind!=='pine'&&p.kind!=='chalet'&&p.kind!=='church')continue;
      const [x,y,z]=p.pos,w=p.k*(p.kind==='pine'?1.7:3.5);
      G.poly([[x-w,y+.15,z],[x,y+.15,z+w],[x+w*2.3,y+.15,z+w*.8],[x+w*2.8,y+.15,z-w*.4],[x,y+.15,z-w]],'#849360');
    }
  });
  function draw(){
    Engine.bakeShadows(()=>{
      for(const t of terrain)Engine.draw(t.m);
      Engine.draw(roadDetails);Engine.draw(orchard);
      for(const p of props)if(['pine','chalet','church','rock','sign'].includes(p.kind))Engine.draw(landmark(p.kind,p.v),...p.pos,p.a,p.k);
    });
    Engine.draw(waterMesh);Engine.draw(mountains);Engine.draw(farTrees);
    for(const t of terrain)Engine.draw(t.m);
    Engine.draw(roadDetails);Engine.draw(groundShade);Engine.draw(orchard);
    for(const p of props){
      const pr=Engine.project(...p.pos);
      if(pr.d < -15 || pr.d>(Engine.hardware?265:115) || (pr.d>12 && Math.abs(pr.x-.5)>.55+15/pr.d))continue;
      Engine.draw(landmark(p.kind,p.v),...p.pos,p.a,p.k,p.k*(p.kind==='church'?18:12));
    }
  }
  return {path,at,length,samples,draw};
})();
