/* A small retained-mesh renderer. World units are metres, +Y is up. */
const Engine = (() => {
  const canvas = document.getElementById('world');
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:false, powerPreference:'high-performance'});
  let buffer, current, camera, width, height, focal, aspect, activeMesh;
  const palette = new Map(), queue = [];
  const sub = (a,b) => a.map((v,i)=>v-b[i]);
  const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit = a => {const k=Math.hypot(...a)||1;return a.map(v=>v/k)};
  function rgb(c) {
    if (Array.isArray(c)) return c;
    if (!palette.has(c)) {
      let h=c.replace('#',''); if(h.length===3)h=h.split('').map(s=>s+s).join('');
      palette.set(c,[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255));
    }
    return palette.get(c);
  }
  function poly(v,color) {
    const n=unit(cross(sub(v[1],v[0]),sub(v[2],v[0]))), c=rgb(color);
    for(let i=1;i<v.length-1;i++) for(const p of [v[0],v[i],v[i+1]]) current.push(...p,...n,...c);
  }
  function box(x,y,z,w,h,d,c,rx=0,ry=0,rz=0) {
    const pts=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([a,b,e])=>{
      a*=w/2;b*=h/2;e*=d/2;
      if(rx)[b,e]=[b*Math.cos(rx)-e*Math.sin(rx),b*Math.sin(rx)+e*Math.cos(rx)];
      if(ry)[a,e]=[a*Math.cos(ry)+e*Math.sin(ry),e*Math.cos(ry)-a*Math.sin(ry)];
      if(rz)[a,b]=[a*Math.cos(rz)-b*Math.sin(rz),a*Math.sin(rz)+b*Math.cos(rz)];
      return [a+x,b+y,e+z];
    });
    for(const face of [[3,2,1,0],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])poly(face.map(i=>pts[i]),c);
  }
  function ball(x,y,z,a,b,d,c,lat=7,lon=12) {
    const pt=(i,j)=>{const u=(i/lat-.5)*Math.PI,v=j/lon*Math.PI*2;return [x+a*Math.cos(u)*Math.cos(v),y+b*Math.sin(u),z+d*Math.cos(u)*Math.sin(v)]};
    for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
      let f=[pt(i,j),pt(i+1,j),pt(i+1,j+1),pt(i,j+1)];
      if(i===0)f.pop();if(i===lat-1)f.splice(1,1);poly(f,c);
    }
  }
  function tube(x,y,z,X,Y,Z,r,R,c,n=8) {
    const a=[x,y,z],b=[X,Y,Z],axis=unit(sub(b,a));
    const u=unit(cross(axis,Math.abs(axis[1])>.9?[0,0,1]:[0,1,0])),v=cross(axis,u);
    const ring=(p,r)=>Array.from({length:n},(_,i)=>p.map((q,k)=>q+r*(u[k]*Math.cos(i*2*Math.PI/n)+v[k]*Math.sin(i*2*Math.PI/n))));
    const A=ring(a,r),B=ring(b,R);
    if(r>0)poly([...A].reverse(),c);if(R>0)poly(B,c);
    for(let i=0;i<n;i++){let j=(i+1)%n;if(R===0)poly([A[i],A[j],b],c);else if(r===0)poly([a,B[j],B[i]],c);else poly([A[i],A[j],B[j],B[i]],c)}
  }
  function mesh(fn) {
    current=[];fn();const data=new Float32Array(current);current=null;
    const m={data,count:data.length/9};
    if(gl){m.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW)}
    return m;
  }
  let loc={}, attr={}, ctx,shadowBuffer,shadowTexture,buildingShadows=false,shadowReady=false;
  if(gl){
    const vs=`attribute vec3 p,n,c;
    uniform vec3 eye,side,vertical,forward,offset;uniform vec4 obj;uniform vec2 lens;uniform float shadowPass;
    varying lowp vec3 color;varying mediump float depth;varying highp vec3 shadowCoord;
    void main(){
      vec3 a=p*obj.z;float co=obj.x,si=obj.y;
      vec3 world=vec3(co*a.x+si*a.z,a.y,-si*a.x+co*a.z)+offset;
      vec3 r=world-eye;
      vec3 normal=vec3(co*n.x+si*n.z,n.y,-si*n.x+co*n.z);
      float z=dot(r,forward);
      gl_Position=vec4(dot(r,side)*lens.x,dot(r,vertical)*lens.y,z*1.00012-.24,z);
      shadowCoord=vec3((world.x+.81*world.y-55.)/390.+.5,(world.z+.49*world.y-85.)/475.+.5,.72-world.y/180.);
      if(shadowPass>.5)gl_Position=vec4(shadowCoord*2.-1.,1.);
      float l=.84+.19*dot(normal,normalize(vec3(-.63,.76,-.38)))+.06*normal.y;
      color=c*l+vec3(.022,.014,.001)*max(0.,normal.y);depth=max(z,0.);
    }`;
    const fs=`precision highp float; varying lowp vec3 color; varying mediump float depth;varying highp vec3 shadowCoord;
    uniform float shadowPass,hasShadow;uniform sampler2D shadeMap;
    float shaded(vec2 xy){vec2 rg=texture2D(shadeMap,xy).rg;return step(rg.x+rg.y/255.+.0012,shadowCoord.z);}
    void main(){
    if(shadowPass>.5){float d=clamp(shadowCoord.z,0.,.9998);gl_FragColor=vec4(floor(d*255.)/255.,fract(d*255.),0.,1.);return;}
    float shadow=0.;
    if(hasShadow>.5&&min(shadowCoord.x,shadowCoord.y)>0.&&max(shadowCoord.x,shadowCoord.y)<1.){
      vec2 delta=vec2(.0004,0.);shadow=.25*(shaded(shadowCoord.xy+delta)+shaded(shadowCoord.xy-delta)+shaded(shadowCoord.xy+delta.yx)+shaded(shadowCoord.xy-delta.yx));}
    float haze=1.-exp(-depth*.00069);vec3 col=mix(color*mix(vec3(1.),vec3(.69,.76,.80),shadow),vec3(.81,.84,.84),haze);
    float grain=fract(sin(dot(mod(gl_FragCoord.xy,117.),vec2(12.91,37.71)))*150.13);
    gl_FragColor=vec4(col+(grain-.5)*.009,1.);}`;
    function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    for(const key of ['eye','side','vertical','forward','offset','obj','lens','shadowPass','hasShadow','shadeMap'])loc[key]=gl.getUniformLocation(program,key);
    for(const key of ['p','n','c']){attr[key]=gl.getAttribLocation(program,key);gl.enableVertexAttribArray(attr[key])}
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0);
    if(gl.getParameter(gl.MAX_TEXTURE_SIZE)>=2048){
      shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2048,2048,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
      for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
      shadowBuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shadowBuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,shadowTexture,0);
      const depthBuffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depthBuffer);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,2048,2048);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthBuffer);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)shadowBuffer=null;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);
    }
  }else ctx=canvas.getContext('2d');
  function begin(eye,target,degrees=51){
    const dpr=Math.min(window.devicePixelRatio||1,gl?1.65:1);
    width=Math.round(canvas.clientWidth*dpr);height=Math.round(canvas.clientHeight*dpr);
    if(width!==canvas.width||height!==canvas.height){canvas.width=width;canvas.height=height}
    aspect=width/height;focal=1/Math.tan(degrees*Math.PI/360);
    const f=unit(sub(target,eye)),s=unit([f[2],0,-f[0]]),u=cross(f,s);
    camera={eye,f,s,u};activeMesh=null;
    if(gl){gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);for(const [k,a] of [['eye',eye],['side',s],['vertical',u],['forward',f]])gl.uniform3fv(loc[k],a);gl.uniform2f(loc.lens,focal/aspect,focal)}
    else {ctx.clearRect(0,0,width,height);queue.length=0}
  }
  function project(x,y,z) {
    const r=sub([x,y,z],camera.eye),d=dot(r,camera.f);
    return {x:(.5+dot(r,camera.s)*focal/(2*aspect*d)),y:(.5-dot(r,camera.u)*focal/(2*d)),d};
  }
  function draw(m,x=0,y=0,z=0,angle=0,scale=1,radius=0){
    if(radius&&!buildingShadows){const p=project(x,y,z);if(p.d < -radius || (p.d>radius && (Math.abs(p.x-.5)>.55+radius*focal/(p.d*aspect)||Math.abs(p.y-.5)>.56+radius*focal/p.d)))return}
    const co=Math.cos(angle),si=Math.sin(angle);
    if(gl){if(activeMesh!==m){gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.vertexAttribPointer(attr.p,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(attr.n,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(attr.c,3,gl.FLOAT,false,36,24);activeMesh=m}
      gl.uniform3f(loc.offset,x,y,z);gl.uniform4f(loc.obj,co,si,scale,1);gl.drawArrays(gl.TRIANGLES,0,m.count);
    }else {
      const a=m.data;
      for(let i=0;i<a.length;i+=27){let pts=[],dep=0;
        const vertices=[];
        for(let j=i;j<i+27;j+=9){const r=[x+(a[j]*co+a[j+2]*si)*scale-camera.eye[0],y+a[j+1]*scale-camera.eye[1],z+(a[j+2]*co-a[j]*si)*scale-camera.eye[2]];vertices.push([dot(r,camera.s),dot(r,camera.u),dot(r,camera.f)])}
        if(vertices.every(v=>v[2]<.16))continue;
        const clipped=[];
        for(let k=0;k<3;k++){
          const p=vertices[k],q=vertices[(k+1)%3];if(p[2]>=.16)clipped.push(p);
          if((p[2]>=.16)!==(q[2]>=.16)){const t=(.16-p[2])/(q[2]-p[2]);clipped.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,.16])}
        }
        for(const v of clipped){pts.push([width*(.5+v[0]*focal/(2*aspect*v[2])),height*(.5-v[1]*focal/(2*v[2]))]);dep+=v[2]}
        dep=dep*3/clipped.length;
        if(pts.length>=3 && ![0,1].some(k=>pts.every(p=>p[k]<0)||pts.every(p=>p[k]>(k?height:width)))){
          const light=.84+.19*(-.63*(co*a[i+3]+si*a[i+5])+.76*a[i+4]-.38*(-si*a[i+3]+co*a[i+5]))+.06*a[i+4],fog=1-Math.exp(-dep/3*.00069);
          const col=[0,1,2].map(k=>Math.min(255,((1-fog)*(a[i+6+k]*light+(k===2?0:.014)*Math.max(0,a[i+4]))+fog*[.84,.85,.78][k])*255)|0);
          queue.push([dep,pts,'rgb('+col.join(',')+')']);
        }
      }
    }
  }
  function end(){if(!gl){queue.sort((a,b)=>b[0]-a[0]);for(const [,p,c] of queue){ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(...p[0]);for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);ctx.closePath();ctx.fill()}}}
  function bakeShadows(render){
    if(!shadowBuffer||shadowReady)return;
    buildingShadows=true;gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,shadowBuffer);gl.viewport(0,0,2048,2048);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(loc.shadowPass,1);
    render();gl.uniform1f(loc.shadowPass,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,shadowTexture);gl.uniform1f(loc.hasShadow,1);gl.clearColor(0,0,0,0);gl.viewport(0,0,width,height);buildingShadows=false;shadowReady=true;activeMesh=null;
  }
  window.G={poly,box,ball,tube};
  return {mesh,begin,project,draw,end,bakeShadows,hardware:!!gl};
})();
