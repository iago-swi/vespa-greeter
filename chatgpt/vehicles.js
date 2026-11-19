// Hand-built vehicle models. All dimensions are in metres, with the nose along +Z.
(() => {
  'use strict';
  const tau = 2 * Math.PI;
  const chrome = '#d6e2dc', deepChrome = '#748d91', rubber = '#263138';
  const cream = '#f5e7c6', leather = '#553a2d', skin = '#c88e66';
  const mint = '#83d5bb', mintShade = '#48a494';
  const colorways = ['#c74f39', '#266879', '#d5a645', '#508c72'];
  const jackets = ['#284859', '#99473a', '#435a50', '#475774'];
  const { cos, sin, PI } = Math;
  const rod = (a, b, r, color, end = r, n = 7) =>
    G.tube(...a, ...b, r, end, color, n);
  const oval = (x,y,z,w,h,d,c) => G.ball(x,y,z,w,h,d,c,5,12);

  // Horizontal elliptical sections produce controlled silhouettes and upholstery seams.
  function shell(rings, color, sides = 12) {
    const sections = rings.map(([y, z, xRadius, zRadius]) =>
      Array.from({length:sides}, (_, i) => [xRadius*cos(i*tau/sides),y,z+zRadius*sin(i*tau/sides)]));
    G.poly(sections[0], color);
    for (let row=1; row<sections.length; row++) {
      const lower=sections[row-1], upper=sections[row];
      for (let i=0; i<sides; i++) {
        const j=(i+1)%sides;
        G.poly([lower[i],upper[i],upper[j],lower[j]],color);
      }
    }
    G.poly(sections[sections.length-1].slice().reverse(), color);
  }

  // Profile revolves around the axle. The separate wall and rim bands read at a distance.
  function wheel(x, y, z, radius, width, bicycle=false, whitewall=false) {
    const n=bicycle?16:14;
    const r=(f)=>f*radius;
    const rings=bicycle
      ? [[-width*.46,.90],[-width*.5,.96],[0,1],[width*.5,.96],[width*.46,.90]]
      : [[-width*.45,.60],[-width*.51,.79],[-width*.47,.91],[-width*.28,.98],
        [0,1],[width*.28,.98],[width*.47,.91],[width*.51,.79],[width*.45,.60]];
    const p=(s,i)=>[x+s[0], y+r(s[1])*cos(tau*i/n),z+r(s[1])*sin(tau*i/n)];
    for(let k=1;k<rings.length;k++) {
      const tint=whitewall&&(k===1||k===rings.length-1)?cream:rubber;
      for(let i=0;i<n;i++) {
        G.poly([p(rings[k-1],i),p(rings[k-1],i+1),p(rings[k],i+1),p(rings[k],i)],tint);
      }
    }
    if (bicycle) {
      for(let i=0;i<8;i++) {
        const a=i*PI/8;
        rod([x,y+cos(a)*r(.91),z+sin(a)*r(.91)],[x,y-cos(a)*r(.91),z-sin(a)*r(.91)],.008,chrome,.008,4);
      }
    } else {
      rod([x-width*.48,y,z],[x+width*.48,y,z],r(.615),deepChrome,r(.615),12);
      rod([x-width*.55,y,z],[x+width*.55,y,z],r(.42),chrome,r(.42),10);
    }
  }

  function scooter() {
    wheel(0,.238,-.55,.238,.112,false,true);
    wheel(0,.238,.64,.238,.11,false,true);
    // Floorboard, rubber strips and the curved, pressed-steel leg shield.
    G.box(0,.28,.18,.43,.075,.83,mintShade);
    G.box(0,.324,.18,.42,.023,.76,mint);
    for(const x of [-.15,-.085,.085,.15])
      G.box(x,.34,.18,.019,.012,.60,rubber);
    shell([[.29,.50,.185,.095],[.42,.54,.240,.12],[.66,.57,.282,.118],
      [.87,.60,.265,.095],[.94,.61,.223,.074]],mint);
    for(const s of [-1,1]) {
      const edge=[[s*.185,.29,.50],[s*.240,.42,.54],[s*.282,.66,.57],[s*.265,.87,.60],[s*.223,.94,.61]];
      for(let i=1;i<edge.length;i++) rod(edge[i-1],edge[i],.009,chrome);
    }
    oval(0,.424,.66,.117,.097,.285,mint);
    rod([.06,.23,.64],[.06,.71,.55],.037,deepChrome);
    oval(0,.725,.68,.075,.17,.031,mintShade);
    // Monocoque rear and large detachable engine cowls.
    shell([[.27,-.37,.12,.32],[.36,-.39,.19,.49],[.58,-.38,.235,.54],
      [.70,-.32,.21,.48],[.78,-.27,.15,.38]],mintShade);
    for(const s of [-1,1]) {
      oval(s*.16,.52,-.40,.16,.19,.47,mint);
      rod([s*.288,.52,-.60],[s*.314,.54,-.31],.009,chrome);
      if(s===1) for(let i=0;i<3;i++)
        rod([s*.296,.49+i*.028,-.47],[s*.311,.49+i*.028,-.35],.005,mintShade,.005,5);
    }
    shell([[.71,-.24,.163,.38],[.75,-.25,.196,.416],[.78,-.25,.203,.424]],cream);
    shell([[.76,-.25,.201,.423],[.81,-.25,.206,.42],[.833,-.24,.166,.37]],leather);
    G.box(0,.545,-.885,.146,.11,.04,chrome,-.09);
    G.box(0,.553,-.911,.117,.064,.024,'#b93931',-.09);
    G.box(0,.415,-.865,.177,.089,.024,cream,-.11);
    for(const x of [-.059,-.027,.012,.042]) G.box(x,.413,-.88,.015,.035,.006,'#4a5552',-.11);
    // Rear parcel rack and a small strapped leather valise.
    for(const s of [-1,1]) {
      rod([s*.159,.58,-.71],[s*.16,.72,-.91],.012,chrome);
      rod([s*.16,.72,-.91],[s*.16,.72,-.61],.012,chrome);
    }
    rod([-.16,.72,-.91],[.16,.72,-.91],.012,chrome);
    G.box(0,.803,-.744,.418,.162,.226,'#ac6940');
    G.box(0,.876,-.744,.427,.033,.234,'#be8052');
    for(const x of [-.129,.129]){
      G.box(x,.807,-.744,.026,.176,.240,leather);
      G.box(x,.798,-.866,.031,.028,.007,'#e7c180');
    }
    // Cast handlebar nacelle, circular headlamp and two round mirrors.
    rod([0,.88,.59],[0,1.045,.55],.052,mintShade);
    rod([-.275,1.032,.506],[.275,1.032,.506],.025,chrome);
    oval(0,1.045,.562,.192,.067,.085,mint);
    rod([0,1.066,.571],[0,1.066,.676],.076,mint,.084,12);
    rod([0,1.066,.675],[0,1.066,.685],.072,cream,.072,12);
    for (const s of [-1,1]) {
      rod([s*.201,1.035,.506],[s*.31,1.038,.50],.022,rubber);
      rod([s*.211,1.06,.529],[s*.314,1.225,.544],.009,chrome);
      oval(s*.322,1.25,.546,.060,.050,.019,chrome);
    }
  }

  function helmet(y, z, color, stripe, vintage) {
    const rx=.151, ry=.166, rz=.158;
    // The face is inset under the visor and framed by the ear pads.
    oval(0,y-.048,z+.042,.116,.132,.132,skin);
    oval(0,y+.013,z-.016,rx,ry,rz,color);
    for(const s of [-1,1]) {
      oval(s*.117,y-.071,z+.015,.030,.065,.062,leather);
      oval(s*.134,y-.063,z+.024,.019,.047,.046,color);
    }
    for(let k=0;k<12;k++) {
      const a=-1.83+k*3.46/12, b=-1.83+(k+1)*3.46/12;
      const p=(x,t)=>[x,y+.013+(ry+.002)*cos(t),z-.016+(rz+.002)*sin(t)];
      G.poly([p(-.018,a),p(-.018,b),p(.018,b),p(.018,a)],stripe);
    }
    oval(0,y+.025,z+.11,.139,.017,.076,vintage?cream:rubber);
    if(vintage) {
      rod([-.117,y-.017,z+.147],[.117,y-.017,z+.147],.008,leather);
      for(const s of [-1,1]) {
        oval(s*.054,y-.020,z+.148,.047,.028,.020,deepChrome);
        oval(s*.054,y-.020,z+.161,.038,.019,.010,'#344c50');
      }
    } else {
      oval(0,y-.011,z+.140,.118,.039,.026,'#263d47');
    }
  }

  function rider(wave, variant, hero, cyclist=false) {
    const coat=hero?'#284d59':jackets[variant%jackets.length];
    const trousers=hero?'#394650':'#353e49';
    const elbow=hero?'#335b65':coat;
    const shift=cyclist?.16:0;
    const pose=(x,y,z)=>[x,y+shift,z+(cyclist?.095:0)];
    for(const s of [-1,1]) {
      const thigh=pose(s*.109,.819,-.235), knee=pose(s*.152,.64,.106);
      const ankle=cyclist?pose(s*.12,.32+(s>0?.09:0),.04):pose(s*.147,.387,.10);
      rod(thigh,knee,.097,trousers,.078);
      rod(knee,ankle,.076,trousers,.052);
      oval(ankle[0],ankle[1]-.01,ankle[2]+.045,.065,.048,.130,leather);
    }
    // Tapered waist, shaped shoulders and the storm flap across the jacket.
    const zz=cyclist?.12:0;
    shell([[.827+shift,-.231+zz,.145,.15],[.918+shift,-.220+zz,.169,.153],
      [1.073+shift,-.193+zz,.181,.161],[1.184+shift,-.155+zz,.202,.138],
      [1.242+shift,-.147+zz,.133,.119]],coat,10);
    const backZ=-.32+zz;
    G.poly([[-.155,1.146+shift,backZ+.044],[0,1.121+shift,backZ-.019],[0,1.153+shift,backZ-.013],[-.155,1.171+shift,backZ+.052]],elbow);
    G.poly([[0,1.121+shift,backZ-.019],[.155,1.146+shift,backZ+.044],[.155,1.171+shift,backZ+.052],[0,1.153+shift,backZ-.013]],elbow);
    for(const s of [-1,1]) {
      const shoulder=pose(s*.169,1.167,-.149);
      const amount=s<0?wave:0;
      const bend=pose(s*(.233+.14*amount),1.024+.272*amount,.062-.145*amount);
      const palm=pose(s*(.26+.263*amount),1.039+.459*amount,.483-.540*amount);
      // Handlebar reach extends forward, with a separate cuff and glove.
      rod(shoulder,bend,.082,coat,.061);
      oval(...bend,.061,.063,.061,elbow);
      const cuff=bend.map((v,i)=>v+(palm[i]-v)*.83);
      rod(bend,cuff,.063,coat,.045);
      rod(cuff,palm,.046,hero?'#9b6949':rubber,.032);
      oval(...palm,.043,.044,.055,hero?'#99714f':rubber);
      if(amount>.12) for(let i=0;i<2;i++) {
        const tip=[palm[0]+(i?-.031:.010)*amount,palm[1]+(.05+i*.011)*amount,palm[2]];
        rod([palm[0]+(i?-.011:.009),palm[1]+.01,palm[2]],tip,.012,hero?'#99714f':rubber,.008,5);
      }
    }
    const scarf=hero?'#d16840':colorways[(variant+2)%4];
    oval(0,1.257+shift,-.147+zz,.113,.052,.103,scarf);
    if(hero) {
      const a=[-.067,1.259,-.217], b=[-.141,1.215,-.335], c=[-.20,1.234,-.434], d=[-.226,1.19,-.505];
      for(const [i,j] of [[a,b],[b,c],[c,d]])
        G.poly([i,[i[0]+.051,i[1]+.004,i[2]-.008],[j[0]+.046,j[1]+.007,j[2]-.009],j],scarf);
    }
    helmet(1.432+shift,-.127+zz,hero?cream:(cyclist?'#ead186':colorways[variant%4]),hero?'#bd553a':cream,hero);
  }

  function motorcycle(variant) {
    const body=colorways[variant%4];
    wheel(0,.287,-.66,.287,.14);
    wheel(0,.287,.70,.287,.112);
    oval(0,.491,-.62,.142,.099,.306,body);
    oval(0,.519,.705,.099,.076,.204,body);
    for(const s of [-1,1]) {
      rod([s*.09,.28,.7],[s*.09,.97,.45],.026,chrome);
      rod([s*.11,.33,-.62],[s*.12,.67,-.29],.034,deepChrome);
      rod([s*.13,.56,-.02],[s*.16,.29,-.12],.025,chrome);
      rod([s*.16,.29,-.12],[s*.16,.30,-.74],.043,chrome);
      G.box(s*.153,.59,-.60,.095,.24,.30,leather);
    }
    rod([0,.68,-.51],[0,.46,.04],.057,rubber);
    rod([0,.46,.04],[0,.86,.41],.062,rubber);
    oval(0,.52,.05,.14,.16,.18,'#536064');
    for(let i=0;i<3;i++) G.box(0,.496+i*.038,.105,.296,.014,.197,deepChrome);
    oval(0,.774,.19,.152,.152,.270,body);
    oval(0,.764,-.32,.164,.073,.31,leather);
    rod([-.28,1.012,.483],[.28,1.012,.483],.023,chrome);
    rod([0,.96,.465],[0,.96,.576],.104,chrome,.093,12);
    rod([0,.96,.575],[0,.96,.59],.081,'#ffdfa1',.081,12);
    for(const s of [-1,1]){
      oval(s*.136,.929,.535,.032,.029,.028,'#d88a3a');
      rod([s*.213,1.01,.48],[s*.285,1.148,.495],.01,deepChrome);
      oval(s*.292,1.166,.495,.039,.032,.016,deepChrome);
    }
    G.box(0,.558,-.868,.113,.057,.028,'#b74f3d');
  }

  function bicycle(variant){
    const body=colorways[(variant+2)%4];
    wheel(0,.335,-.575,.335,.042,true);
    wheel(0,.335,.54,.335,.042,true);
    const rear=[0,.335,-.575], crank=[0,.302,-.028], seat=[0,.911,-.224], head=[0,.878,.37], front=[0,.335,.54];
    for(const [a,b,r] of [[rear,crank,.015],[rear,seat,.017],[crank,seat,.023],[seat,head,.023],[head,crank,.024],[head,front,.019]]) rod(a,b,r,body);
    oval(0,.955,-.229,.084,.034,.139,leather);
    rod(head,[0,1.193,.525],.018,chrome);
    rod([-.235,1.194,.51],[.235,1.194,.51],.014,rubber);
    rod([-.124,.365,-.05],[.124,.225,-.012],.016,chrome);
  }

  // The little two-door saloon uses window pillars, glass on all sides and chrome bumpers.
  function car(variant){
    const body=colorways[(variant+1)%4], glass='#7299a0';
    for(const x of [-.64,.64]) for(const z of [-.915,.915])
      wheel(x,.281,z,.281,.123,false,true);
    G.box(0,.488,0,1.31,.408,2.74,body);
    G.box(0,.652,0,1.415,.209,2.49,body);
    G.box(0,.763,.815,1.32,.131,.887,body,-.041);
    G.box(0,.749,-.994,1.32,.102,.51,body,.043);
    const base=.756, top=1.307, wb=.656, wt=.523, f=.562, ft=.235, r=-.865, rt=-.606;
    const sides=[-1,1];
    for(const s of sides) {
      G.poly([[s*wb,base,r],[s*wt,top,rt],[s*wt,top,ft],[s*wb,base,f]],body);
      const lo=s*(wb+.003), hi=s*(wt+.009);
      G.poly([[lo,base+.047,r+.08],[hi,top-.04,rt+.054],[hi,top-.04,-.242],[lo,base+.047,-.25]],glass);
      G.poly([[lo,base+.047,-.198],[hi,top-.04,-.19],[hi,top-.04,ft-.042],[lo,base+.047,f-.071]],glass);
      rod([s*.701,.643,-.98],[s*.701,.643,.97],.012,chrome);
      G.box(s*.704,.70,-.19,.021,.023,.107,chrome);
      oval(s*.749,.843,.456,.066,.047,.054,chrome);
    }
    G.poly([[-wb,base,f],[wb,base,f],[wt,top,ft],[-wt,top,ft]],body);
    G.poly([[-.596,base+.05,f-.021],[.596,base+.05,f-.021],[.483,top-.037,ft+.03],[-.483,top-.037,ft+.03]],glass);
    G.poly([[-wb,base,r],[-wt,top,rt],[wt,top,rt],[wb,base,r]],body);
    G.poly([[-.58,base+.06,r+.016],[-.474,top-.038,rt-.027],[.474,top-.038,rt-.027],[.58,base+.06,r+.016]],glass);
    G.box(0,top+.012,(ft+rt)/2,1.066,.072,ft-rt+.03,cream);
    for(const s of sides) {
      rod([s*.513,.597,1.33],[s*.513,.597,1.385],.103,chrome,.096,10);
      rod([s*.513,.597,1.381],[s*.513,.597,1.39],.081,'#ffe6ac',.081,10);
      G.box(s*.551,.557,-1.376,.141,.104,.03,'#b94336');
    }
    G.box(0,.402,1.374,1.35,.069,.115,chrome);
    G.box(0,.402,-1.376,1.35,.069,.115,chrome);
    for(let i=0;i<3;i++) G.box(0,.531+i*.032,1.375,.44,.012,.016,chrome);
  }

  function truck(variant){
    const cab=variant%2?'#d98a59':'#639889', box='#ddcdb2', border='#ac9c84', glass='#64888e';
    for(const x of [-.867,.867]) for(const z of [-1.27,1.53]) wheel(x,.40,z,.40,.196);
    G.box(0,.498,.055,1.66,.26,4.42,'#3a4243');
    G.box(0,1.523,-.635,1.86,1.72,3.16,box);
    for(const x of [-.935,.935]) {
      G.box(x,2.35,-.635,.034,.054,3.18,border);
      G.box(x,.705,-.635,.034,.065,3.18,border);
      for(const z of [-2.19,-1.39,-.591,.21,.927])
        G.box(x,1.55,z,.024,1.61,.029,border);
    }
    G.box(0,.88,1.552,1.76,.745,1.298,cab);
    G.box(0,1.559,1.45,1.744,.70,1.14,cab);
    G.box(0,1.66,2.026,1.537,.421,.019,glass);
    G.box(0,1.66,2.04,.037,.431,.018,cab);
    G.box(0,1.947,1.446,1.795,.107,1.224,cream);
    for(const s of [-1,1]) {
      G.box(s*.877,1.647,1.497,.019,.405,.83,glass);
      G.box(s*.892,1.302,1.195,.028,.032,.122,deepChrome);
      rod([s*.86,1.49,1.823],[s*1.01,1.66,1.802],.016,deepChrome);
      G.box(s*1.026,1.686,1.801,.09,.163,.066,rubber);
      G.box(s*.679,1.002,2.209,.257,.14,.025,'#ffe4ab');
      G.box(s*.679,.865,2.209,.113,.063,.026,'#e39a44');
    }
    G.box(0,.927,2.212,.825,.295,.02,'#415558');
    for(let i=0;i<4;i++) G.box(0,.813+i*.066,2.229,.79,.016,.018,deepChrome);
    G.box(0,.614,2.207,1.82,.129,.12,chrome);
  }

  window.Vehicles = {
    draw(kind,variant=0,wave=0) {
      variant=Math.abs(variant|0);
      if(kind==='car') return car(variant);
      if(kind==='truck') return truck(variant);
      if(kind==='cycle') { bicycle(variant); return rider(0,variant,false,true); }
      const hero=kind==='vespa';
      if(hero) scooter(); else motorcycle(variant);
      rider(Math.min(1,Math.max(0,wave)),variant,hero);
    }
  };
})();
