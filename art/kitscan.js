(async()=>{const g=window.__g, T=window.__THREE; const res={};
 const inTri=(p,a,b,c)=>{const d=(q,r,s)=>(q[0]-s[0])*(r[1]-s[1])-(r[0]-s[0])*(q[1]-s[1]); const d1=d(p,a,b),d2=d(p,b,c),d3=d(p,c,a); const neg=(d1<-1e-9)||(d2<-1e-9)||(d3<-1e-9), pos=(d1>1e-9)||(d2>1e-9)||(d3>1e-9); return !(neg&&pos);};
 for(const [name,parts] of Object.entries(g.kit.parts)){ const planes=new Map();
  parts.forEach((pt,pi)=>{ const geo=pt.geometry, pos=geo.attributes.position, idx=geo.index; const n=idx?idx.count/3:pos.count/3;
   for(let t=0;t<n;t++){ const ix=[0,1,2].map(k=>idx?idx.getX(t*3+k):t*3+k); const P=ix.map(i=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
    const e1=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]],e2=[P[2][0]-P[0][0],P[2][1]-P[0][1],P[2][2]-P[0][2]]; const nx=e1[1]*e2[2]-e1[2]*e2[1],ny=e1[2]*e2[0]-e1[0]*e2[2],nz=e1[0]*e2[1]-e1[1]*e2[0]; const L=Math.hypot(nx,ny,nz); if(L<1e-8) continue;
    // up-facing horizontal triangles (kit Y is up in the game)
    if(ny/L<0.999) continue; if(Math.abs(P[0][1]-P[1][1])>0.0005||Math.abs(P[0][1]-P[2][1])>0.0005) continue; if(L/2<0.003) continue;
    const key=Math.round(P[0][1]*1000); let arr=planes.get(key); if(!arr) planes.set(key,arr=[]); arr.push({pi,mat:pt.matName,tri:P.map(p=>[p[0],p[2]])}); } });
  const hits=[]; for(const [key,arr] of planes){ if(arr.length<2) continue;
   for(let i=0;i<arr.length;i++) for(let j=i+1;j<arr.length;j++){ if(arr[i].pi===arr[j].pi && arr[i].mat===arr[j].mat && false) continue; const A=arr[i],B=arr[j];
     const c=[(A.tri[0][0]+A.tri[1][0]+A.tri[2][0])/3,(A.tri[0][1]+A.tri[1][1]+A.tri[2][1])/3];
     // centroid of A strictly inside B (not on an edge: adjacent triangles of a single face never contain each other's centroids)
     const d=(q,r,s)=>(q[0]-s[0])*(r[1]-s[1])-(r[0]-s[0])*(q[1]-s[1]); const d1=d(c,B.tri[0],B.tri[1]),d2=d(c,B.tri[1],B.tri[2]),d3=d(c,B.tri[2],B.tri[0]); const inside=(d1>1e-7&&d2>1e-7&&d3>1e-7)||(d1<-1e-7&&d2<-1e-7&&d3<-1e-7);
     if(inside) hits.push({y:key/1000,a:A.mat,b:B.mat,at:c.map(v=>+v.toFixed(2))}); } }
  if(hits.length) res[name]={n:hits.length,sample:hits.slice(0,3)}; }
 return res})()
