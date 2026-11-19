import React, { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment, Text } from '@react-three/drei'

function RobotModel({pose}) {
  if(!pose)return null
  return <group position={[pose.y/1000,0.16,pose.x/1000]} rotation={[0,Math.PI+(pose.heading||0)*Math.PI/180,0]}>
    <mesh castShadow position={[0,.12,0]}><boxGeometry args={[.42,.22,.48]}/><meshStandardMaterial color="#e23b46" roughness={.5}/></mesh>
    <mesh position={[0,.245,-.08]}><boxGeometry args={[.18,.035,.22]}/><meshStandardMaterial color="#f6f6f6"/></mesh>
    <mesh position={[0,.18,-.28]}><boxGeometry args={[.08,.06,.12]}/><meshStandardMaterial color="#ff9ca3"/></mesh>
    {[-1,1].flatMap(x=>[-1,1].map(z=><mesh key={`${x}-${z}`} position={[x*.235,.08,z*.17]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.075,.075,.055,20]}/><meshStandardMaterial color="#17181c"/></mesh>))}
    <mesh position={[0,.31,-.02]}><boxGeometry args={[.08,.025,.08]}/><meshStandardMaterial color="#f4a3a8"/></mesh>
  </group>
}
function sampleGeometry(s,t){
  if(s.type==='turn')return {...s.p0}
  if(s.type==='linear'||s.type==='pose')return{x:s.p0.x+(s.p3.x-s.p0.x)*t,y:s.p0.y+(s.p3.y-s.p0.y)*t}
  if(s.type==='arc'){const c=s.center||{x:(s.p0.x+s.p3.x)/2,y:(s.p0.y+s.p3.y)/2},u=1-t;return{x:u*u*s.p0.x+2*u*t*c.x+t*t*s.p3.x,y:u*u*s.p0.y+2*u*t*c.y+t*t*s.p3.y}}
  if(s.type==='polyline'||s.type==='spline'||s.type==='smart'){
    const pts=s.waypoints?.length>1?s.waypoints:[s.p0,s.p3]
    if(s.type==='polyline'||(s.type==='smart'&&s.smartCurve===false)){const z=t*(pts.length-1),i=Math.min(pts.length-2,Math.floor(z)),u=z-i;return{x:pts[i].x+(pts[i+1].x-pts[i].x)*u,y:pts[i].y+(pts[i+1].y-pts[i].y)*u}}
    const z=t*(pts.length-1),i=Math.min(pts.length-2,Math.floor(z)),u=z-i,p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)]
    const f=(a,b,c,d)=>.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)
    return{x:f(p0.x,p1.x,p2.x,p3.x),y:f(p0.y,p1.y,p2.y,p3.y)}
  }
  const u=1-t;return{x:u*u*u*s.p0.x+3*u*u*t*s.p1.x+3*u*t*t*s.p2.x+t*t*t*s.p3.x,y:u*u*u*s.p0.y+3*u*u*t*s.p1.y+3*u*t*t*s.p2.y+t*t*t*s.p3.y}
}
function PathLines({segments}) {
  const points=useMemo(()=>segments.flatMap(s=>Array.from({length:61},(_,i)=>{const p=sampleGeometry(s,i/60);return [p.y/1000,.035,p.x/1000]})),[segments])
  if(points.length<2)return null
  return <line><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array(points.flat()),3]}/></bufferGeometry><lineBasicMaterial color="#ff5964" linewidth={3}/></line>
}
function FieldElements({preset}) {
  if(preset==='decode') return <group>
    <mesh position={[0,.28,0]}><boxGeometry args={[.55,.55,.55]}/><meshStandardMaterial color="#aeb2bc"/></mesh>
    <mesh position={[-1.28,.18,-1.28]}><boxGeometry args={[.62,.35,.62]}/><meshStandardMaterial color="#2874e8"/></mesh>
    <mesh position={[1.28,.18,1.28]}><boxGeometry args={[.62,.35,.62]}/><meshStandardMaterial color="#df3d4b"/></mesh>
    <mesh position={[-1.35,.1,1.35]}><boxGeometry args={[.55,.2,.55]}/><meshStandardMaterial color="#2874e8"/></mesh>
    <mesh position={[1.35,.1,-1.35]}><boxGeometry args={[.55,.2,.55]}/><meshStandardMaterial color="#df3d4b"/></mesh>
    <mesh position={[-1.2,.2,-.1]}><boxGeometry args={[.42,.4,.3]}/><meshStandardMaterial color="#2563eb"/></mesh>
    <mesh position={[1.2,.2,.1]}><boxGeometry args={[.42,.4,.3]}/><meshStandardMaterial color="#dc3545"/></mesh>
  </group>
  if(preset==='biobuzz') return <group>
    <mesh position={[0,.52,0]}><boxGeometry args={[1.25,.95,.95]}/><meshStandardMaterial color="#858b97" transparent opacity={.85}/></mesh>
    <mesh position={[0,1.04,0]}><boxGeometry args={[1.35,.08,.12]}/><meshStandardMaterial color="#c0c4cc"/></mesh>
    {[-1,1].map((side)=> <group key={side} position={[side*.36,.62,0]}>
      <mesh><boxGeometry args={[.42,.3,.42]}/><meshStandardMaterial color={side<0?'#2874e8':'#df3d4b'}/></mesh>
    </group>)}
    {[-1,1].flatMap(x=>[-1,1].map(z=><group key={`${x}-${z}`} position={[x*1.52,.2,z*1.52]}>
      <mesh><cylinderGeometry args={[.18,.18,.38,12]}/><meshStandardMaterial color="#eab308"/></mesh>
      <mesh position={[0,.24,0]}><torusGeometry args={[.18,.035,8,16]}/><meshStandardMaterial color="#facc15"/></mesh>
    </group>))}
  </group>
  return null
}

function FieldPerimeter({sizeX,sizeY}) {
  const wall=.055,h=.12
  return <group>
    <mesh position={[0,h/2,-sizeX/2]}><boxGeometry args={[sizeY,h,wall]}/><meshStandardMaterial color="#9da1aa"/></mesh>
    <mesh position={[0,h/2,sizeX/2]}><boxGeometry args={[sizeY,h,wall]}/><meshStandardMaterial color="#9da1aa"/></mesh>
    <mesh position={[-sizeY/2,h/2,0]}><boxGeometry args={[wall,h,sizeX]}/><meshStandardMaterial color="#9da1aa"/></mesh>
    <mesh position={[sizeY/2,h/2,0]}><boxGeometry args={[wall,h,sizeX]}/><meshStandardMaterial color="#9da1aa"/></mesh>
  </group>
}
function Obstacles({items}) {
  return <>{items.map(o=><mesh key={o.id} position={[o.y/1000,.12,o.x/1000]}><boxGeometry args={[(o.width||o.size||420)/1000,.24,(o.length||o.size||420)/1000]}/><meshStandardMaterial color="#e33b46" transparent opacity={.42}/></mesh>)}</>
}
export default function Scene3D({segments=[],robot=null,field={},obstacles=[]}) {
  const sizeX=(field.length||3657.6)/1000,sizeY=(field.width||3657.6)/1000
  return <div className="scene3d">
    <Canvas camera={{position:[4.8,4.5,5.8],fov:42}} shadows>
      <color attach="background" args={['#111216']}/>
      <ambientLight intensity={.8}/>
      <directionalLight position={[4,8,5]} intensity={1.7} castShadow/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.025,0]} receiveShadow><planeGeometry args={[sizeY,sizeX]}/><meshStandardMaterial color="#25272d" roughness={.9}/></mesh>
      <Grid args={[sizeY,sizeX]} position={[0,.002,0]} cellSize={.25} cellThickness={.5} sectionSize={1} sectionColor="#565963" cellColor="#363941" fadeDistance={20}/>
      <FieldElements preset={field.preset}/>
      <PathLines segments={segments}/>
      <Obstacles items={obstacles}/>
      <RobotModel pose={robot}/>
      <OrbitControls makeDefault/>
      <Environment preset="city"/>
    </Canvas>
    <div className="scene-hint">Drag to orbit · scroll to zoom · right-drag to pan · robot follows timeline</div>
  </div>
}
