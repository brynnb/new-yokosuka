// Authoring-time curves shared by walkthrough-guided chases. These are normal
// scene records consumed by the existing presenter, not a second chase runtime.
export function createChasePath(points) {
  if(!Array.isArray(points)||points.length<3||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw Error("Invalid authored chase path");
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const cumulative=[0];for(let i=1;i<points.length;i++){
    const d=distance(points[i-1],points[i]);if(d===0)throw Error("Repeated authored chase station");
    cumulative.push(cumulative.at(-1)+d);
  }
  function at(value){
    value=Math.max(0,Math.min(cumulative.at(-1),value));let i=1;while(i<cumulative.length-1&&cumulative[i]<value)i++;
    const t=(value-cumulative[i-1])/(cumulative[i]-cumulative[i-1]);return points[i].map((v,k)=>points[i-1][k]+(v-points[i-1][k])*t);
  }
  function pose(value){
    const p=at(value),q=at(Math.min(cumulative.at(-1),value+.05)),dx=q[0]-p[0],dz=q[2]-p[2];
    return{x:-p[0],y:p[1],z:p[2],rotationX:0,rotationY:180-Math.atan2(dx,dz)*180/Math.PI,rotationZ:0};
  }
  function camera(value){
    const p=at(value),q=at(value+.05),length=Math.hypot(q[0]-p[0],q[2]-p[2])||1,dx=(q[0]-p[0])/length,dz=(q[2]-p[2])/length;
    return{positionX:-(p[0]-dx*4+dz*1.2),positionY:p[1]+2.2,positionZ:p[2]-dz*4-dx*1.2,
      targetX:-(p[0]+dx*2),targetY:p[1]+1.1,targetZ:p[2]+dz*2,roll:0,perspective:65};
  }
  return {cumulative,at,pose,camera};
}

export function curveTrack(samples){
  if(samples.length<2||samples.some((s,i)=>!Number.isFinite(s.time)||(i>0&&s.time<=samples[i-1].time)))throw Error("Invalid authored chase samples");
  return{channels:Object.fromEntries(Object.keys(samples[0].value).map(key=>{
    const values=samples.map(x=>x.value[key]);
    // Avoid a full spin when a road heading crosses the 0/360-degree seam.
    if(key==="rotationY")for(let i=1;i<values.length;i++)values[i]=values[i-1]+Math.atan2(Math.sin((values[i]-values[i-1])*Math.PI/180),Math.cos((values[i]-values[i-1])*Math.PI/180))*180/Math.PI;
    return[key,{times:samples.map(x=>x.time),values,tangents:values.map((v,i)=>{
      const a=Math.max(0,i-1),b=Math.min(values.length-1,i+1);return(values[b]-values[a])/(samples[b].time-samples[a].time);
    })}];
  }))};
}
