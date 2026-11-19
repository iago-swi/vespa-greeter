/* Roadside models use metres, with +Y up and +Z toward the facade. */
(() => {
  'use strict';

  const stone = '#b29d80';
  const darkWood = '#69483b';
  const windowGlass = '#45646a';
  const cream = '#f6daac';
  const tau = Math.PI * 2;

  function noise(seed, n) {
    const v = Math.sin(seed * 37.19 + n * 93.87) * 43758.5453;
    return v - Math.floor(v);
  }

  function quad(a, b, c, d, color) {
    G.poly([a, b, c, d], color);
  }

  function frontPanel(x, y, z, width, height, color, direction = 1) {
    const w = width / 2, h = height / 2;
    quad([x-w*direction,y-h,z],[x+w*direction,y-h,z],
         [x+w*direction,y+h,z],[x-w*direction,y+h,z],color);
  }

  function sidePanel(x, y, z, width, height, color, direction) {
    const w = width / 2, h = height / 2;
    quad([x,y-h,z+w*direction],[x,y-h,z-w*direction],
         [x,y+h,z-w*direction],[x,y+h,z+w*direction],color);
  }

  function gableRoof(w, d, eave, rise, roof, edge, timber) {
    const hw = w/2, hd = d/2, peak = eave + rise;
    G.poly([[-hw,eave,hd],[hw,eave,hd],[0,peak,hd]],timber);
    G.poly([[hw,eave,-hd],[-hw,eave,-hd],[0,peak,-hd]],timber);
    const x = hw+.62, z = hd+.65, y = eave - rise*.62/hw;
    quad([-x,y,-z],[-x,y,z],[0,peak,z],[0,peak,-z],roof);
    quad([0,peak,-z],[0,peak,z],[x,y,z],[x,y,-z],roof);
    for (const s of [-1,1]) {
      quad([s*x,y,-s*z],[s*x,y,s*z],[s*x,y-.15,s*z],[s*x,y-.15,-s*z],edge);
      for (const back of [-1,1]) {
        const end = back*z;
        quad([0,peak,end],[s*x,y,end],[s*x,y-.16,end],[0,peak-.16,end],edge);
      }
    }
    G.tube(0,peak+.035,-z,0,peak+.035,z,.075,.075,edge,6);
  }

  function frontWindow(x,y,z,shutter,dir = 1) {
    const out = amount => z+dir*amount;
    frontPanel(x,y,out(.025),.96,1.23,cream,dir);
    frontPanel(x,y,out(.04),.73,.98,windowGlass,dir);
    frontPanel(x+.175,y+.25,out(.049),.29,.39,'#91aaa0',dir);
    frontPanel(x,y,out(.06),.055,1.02,cream,dir);
    frontPanel(x,y+.018,out(.065),.74,.055,cream,dir);
    for (const s of [-1,1]) {
      const sx = x+s*.65;
      frontPanel(sx,y,out(.055),.29,1.10,shutter,dir);
      frontPanel(sx,y+.28,out(.068),.29,.055,darkWood,dir);
      frontPanel(sx,y-.30,out(.068),.29,.055,darkWood,dir);
    }
    G.box(x,y-.63,out(.085),1.07,.095,.21,'#a98969');
  }

  function sideWindow(x,y,z,dir,shutter) {
    sidePanel(x+dir*.023,y,z,.86,1.15,cream,dir);
    sidePanel(x+dir*.04,y,z,.67,.94,windowGlass,dir);
    sidePanel(x+dir*.052,y,z,.045,.94,cream,dir);
    sidePanel(x+dir*.052,y,z,.67,.055,cream,dir);
    for (const dz of [-.58,.58])
      sidePanel(x+dir*.06,y,z+dz,.24,1.04,shutter,dir);
  }

  const housePalette = [
    ['#e8b783','#91523f','#c16b51','#566c60'],
    ['#ebc9a0','#8b5a43','#927369','#638183'],
    ['#d99579','#8b5242','#ae6854','#586a65'],
    ['#e0bd89','#815742','#9e735d','#9f5547'],
    ['#edc9a6','#896345','#b37c64','#4d7774']
  ];

  function chalet(seed) {
    const [plaster,timber,roof,shutter] = housePalette[seed%housePalette.length];
    const w = 5.8 + noise(seed,1)*1.2, d = 5 + noise(seed,2)*1.45;
    const hw=w/2, hd=d/2, eave=4.65, rise=2.15+noise(seed,3)*.45;
    G.box(0,.23,0,w+.10,.46,d+.10,stone);
    G.box(0,1.46,0,w,2.04,d,plaster);
    G.box(0,3.53,0,w+.07,2.16,d+.08,timber);
    G.box(0,2.48,0,w+.18,.16,d+.18,darkWood);
    gableRoof(w+.07,d+.08,eave,rise,roof,darkWood,timber);
    const chimneyX = -hw*.50, chimneyZ = -hd*.47;
    G.box(chimneyX,eave+rise*.60,chimneyZ,.58,2.05,.61,'#ba9c83');
    G.box(chimneyX,eave+rise*.60+1.025,chimneyZ,.73,.13,.76,'#866759');
    const frontZ = hd+.042;
    for (const x of [-w*.31,w*.31]) {
      frontWindow(x,1.43,frontZ,shutter);
      frontWindow(x,3.55,frontZ,shutter);
    }
    frontPanel(0,1.03,hd+.056,.92,1.95,'#76533e');
    frontPanel(.0,1.57,hd+.061,.50,.52,windowGlass);
    G.box(0,.15,hd+.22,1.24,.26,.47,stone);
    for (const s of [-1,1]) {
      for (const z of [-d*.25,d*.25]) {
        sideWindow(s*(hw+.04),1.46,z,s,shutter);
        sideWindow(s*(hw+.04),3.54,z,s,shutter);
      }
    }
    // Balcony framing projects a separate shadow across the pale ground storey.
    const deckZ = hd+.62;
    G.box(0,2.51,deckZ,w*.86,.19,1.25,'#896047');
    for (const x of [-w*.37,w*.37])
      G.tube(x,1.78,hd+.035,x,2.46,hd+1.15,.075,.075,darkWood,4);
    G.box(0,3.34,hd+1.19,w*.88,.13,.13,darkWood);
    G.box(0,2.71,hd+1.19,w*.84,.13,.11,'#9c7051');
    for (let i=0;i<=10;i++)
      G.box((i/10-.5)*w*.82,2.99,hd+1.19,.14,.61,.09,i%2?'#a57554':'#a87f60');
    for (const x of [-w*.417,w*.417])
      G.box(x,3.34,deckZ,.12,.13,1.20,darkWood);
    // Two flower boxes read as a band of geraniums even at road speed.
    for (const side of [-1,1]) {
      const center = side*w*.25;
      G.box(center,2.98,hd+1.31,1.13,.22,.21,'#8a5342');
      G.box(center,3.12,hd+1.31,1.12,.13,.25,'#527051');
      for (let j=0;j<5;j++)
        G.ball(center+(j-2)*.21,3.19+.05*(j%2),hd+1.35,.105,.10,.1,j%2?'#e17961':'#be5346',3,4);
    }
    const atticHeight = eave+.58;
    frontPanel(0,atticHeight,hd+.06,.53,.69,cream);
    frontPanel(0,atticHeight,hd+.07,.38,.54,windowGlass);
  }

  function church() {
    const plaster = '#f0d9ae', accent='#c9ae89';
    G.box(0,.23,0,5.65,.46,10.45,stone);
    G.box(0,2.88,0,5.5,5.32,10.2,plaster);
    gableRoof(5.5,10.2,5.55,2.6,'#aa6a53','#855342',plaster);
    const tz=5.05, th=9.2, tw=2.85;
    G.box(0,th/2,tz,tw,th,tw,'#edcc9c');
    G.box(0,.36,tz,tw+.18,.72,tw+.18,accent);
    G.box(0,6.02,tz,tw+.20,.20,tw+.20,accent);
    G.box(0,th-.05,tz,tw+.46,.29,tw+.46,'#ab8b68');
    for (const s of [-1,1]) {
      const frontZ=tz+s*tw*.5;
      frontPanel(0,8.22,frontZ+s*.035,.88,1.02,'#594f4a',s);
      frontPanel(0,8.77,frontZ+s*.038,.63,.17,'#594f4a',s);
      for (let i=0;i<4;i++) frontPanel(0,7.91+i*.19,frontZ+s*.046,.79,.055,'#8e7864',s);
      sidePanel(s*(tw*.5+.04),8.22,tz,.88,1.02,'#594f4a',s);
      for (const wz of [-3.4,-.82,1.85]) {
        sidePanel(s*2.77,3.03,wz,1.01,2,accent,s);
        sidePanel(s*2.79,3.05,wz,.74,1.74,'#5c7774',s);
        sidePanel(s*2.81,3.04,wz,.065,1.74,cream,s);
      }
    }
    const dial = [];
    for (let i=0;i<16;i++) {
      const a=i*tau/16;
      dial.push([Math.cos(a)*.54,6.91+Math.sin(a)*.54,tz+tw*.5+.08]);
    }
    G.poly(dial,'#fff0c9');
    const dialZ=tz+tw*.5+.095;
    G.tube(0,6.91,dialZ,-.20,7.16,dialZ,.03,.023,'#505950',5);
    G.tube(0,6.91,dialZ,.31,6.97,dialZ,.033,.025,'#505950',5);
    frontPanel(0,1.45,tz+tw*.5+.08,1.40,2.74,'#866143');
    frontPanel(0,1.43,tz+tw*.5+.09,1.11,2.53,'#6f5341');
    // Copper spire and lantern, in the silhouette of a Valais parish church.
    G.tube(0,th,tz,0,th+.72,tz,2.14,1.20,'#567674',4);
    G.tube(0,th+.72,tz,0,th+1.52,tz,1.20,.91,'#62827f',8);
    G.tube(0,th+1.52,tz,0,th+4.65,tz,.91,.12,'#4a696c',8);
    G.ball(0,th+4.75,tz,.17,.20,.17,'#dba75e',5,7);
    G.box(0,th+5.24,tz,.075,.87,.073,'#745f4e');
    G.box(0,th+5.29,tz,.50,.068,.073,'#745f4e');
  }

  const leafColors = [
    ['#385e51','#456e58','#537b5b','#65895f'],
    ['#315951','#3f6759','#4c745d','#618361'],
    ['#486849','#58794d','#688756','#80965c'],
    ['#3b635f','#4a7365','#60846c','#708e72'],
    ['#4d6d53','#5d805a','#70915d','#83996a']
  ];

  function pine(seed) {
    const h=6.7+noise(seed,7)*3.7, radius=h*(.145+noise(seed,8)*.05);
    const colors=leafColors[seed%leafColors.length];
    G.tube(0,0,0,.05,h*.89,0,h*.032,.03,'#735e48',6);
    const tiers=4, sides=7;
    for(let t=0;t<tiers;t++) {
      const base=h*(.18+t*.167), r=radius*(1-t*.202);
      const cx=.10*t*Math.sin(seed+1), cz=.07*t*Math.cos(seed+2);
      const top=[cx+.045,Math.min(h,base+h*(.40-t*.023)),cz];
      const rim=[];
      for(let j=0;j<sides;j++) {
        const a=t*.44+seed*.97+j*tau/sides;
        const rr=r*(.80+noise(seed,t*21+j+11)*.26);
        rim.push([cx+rr*Math.cos(a),base+h*.044*noise(seed,t*10+j+33),cz+rr*Math.sin(a)]);
      }
      for(let j=0;j<sides;j++) {
        const a=rim[j], b=rim[(j+1)%sides];
        G.poly([a,top,b],colors[Math.min(3,Math.floor(t*.6)+(noise(seed,j+5*t)>.68?1:0))]);
      }
      G.poly(rim.slice(),colors[0]);
    }
  }

  function rock(seed) {
    const w=1.25+noise(seed,2)*1.7, h=.61+noise(seed,4)*1.18;
    const depth=w*(.59+noise(seed,5)*.25), center=w*.12;
    const ring=(height,radius,shift)=>Array.from({length:7},(_,i)=>{
      const a=i*tau/7+shift, jitter=.85+.23*noise(seed,i+31);
      return [Math.cos(a)*radius*w*jitter+center*height/h,
        height+(height>0?noise(seed,i+95)*h*.11:0),Math.sin(a)*radius*depth*jitter];
    });
    const base=ring(-.13,1,0), shoulder=ring(.56*h,.90,.10), crown=ring(h,.51,.30);
    const colors=['#a99e89','#b9ad94','#a79e91','#b5a897'];
    for(let i=0;i<7;i++) {
      const next=(i+1)%7;
      quad(base[i],shoulder[i],shoulder[next],base[next],colors[(i+seed)%4]);
      quad(shoulder[i],crown[i],crown[next],shoulder[next],colors[(i+1+seed)%4]);
    }
    G.poly(crown.slice().reverse(),'#c7ba9e');
  }

  function sign(seed) {
    const dark='#4e5250';
    G.box(0,.78,0,.095,1.56,.09,'#9f9d8b');
    G.box(0,1.61,0,1.12,.69,.088,'#f3e5c5');
    for(const dir of [-1,1]) {
      const z=dir*.051;
      const sense=(seed%2?-1:1)*dir;
      const p=(x,y)=>[sense*x,1.61+y,z];
      quad(p(-.31,-.26),p(-.03,-.26),p(.29,0),p(.015,0),dark);
      quad(p(.015,0),p(.29,0),p(-.03,.26),p(-.31,.26),dark);
    }
  }

  function flowers(seed) {
    const colors = ['#f2bf54','#fff0bc','#ed876e','#c796bf'];
    for (let j=0;j<7;j++) {
      const x=(noise(seed,j*7+1)-.5)*1.02, z=(noise(seed,j*7+2)-.5)*.67;
      const h=.18+noise(seed,j*7+3)*.27;
      const flower=colors[(seed+Math.floor(j/3))%4], offset=.04*Math.sin(seed+j);
      G.tube(x,0,z,x+offset,h,z,.016,.012,'#668151',3);
      G.poly([[x,h*.4,z],[x-.13,h*.75,z+.03],[x+.01,h*.63,z+.02]],'#79905a');
      G.ball(x+offset,h,z,.071,.039,.067,flower,3,5);
    }
  }

  const models={chalet,church,pine,rock,sign,flowers};
  window.Landmarks={draw(kind,variant=0) {
    const model=models[kind];
    if (model) model(Math.abs(Math.trunc(variant))||0);
  }};
})();
