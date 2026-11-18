import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Plus, Upload, Download, Play, Pause, Trash2, RotateCcw, MousePointer2, Route, Clock3, Settings2, Grid3X3, Eye, Box, Crosshair, ImagePlus, Copy, Code2, Square, ChevronLeft, ChevronRight } from 'lucide-react'
import Scene3D from './Scene3D.jsx'

const FIELD_MM = 3657.6
const point = (x=0,y=0)=>({x,y})
const uid = ()=>Math.random().toString(36).slice(2,10)
const MOVEMENT_TYPES = [
  {value:'bezier',label:'Cubic Bezier',description:'4 control points'},
  {value:'linear',label:'Linear',description:'Straight line · hold heading'},
  {value:'pose',label:'Drive + turn',description:'Translate and rotate together'},
  {value:'turn',label:'Turn in place',description:'Rotate without translating'},
  {value:'arc',label:'Arc',description:'Curved quadratic arc'},
  {value:'polyline',label:'Polyline',description:'Sharp waypoint turns'},
  {value:'spline',label:'Spline',description:'Smooth multi-waypoint curve'}
]
const newSegment = (start, index=0, type='bezier')=>({
  id:uid(),name:`Path ${index+1}`,type,p0:{...start},
  p1:{x:start.x+260,y:start.y},p2:{x:start.x+540,y:start.y+220},
  p3:{x:start.x+800,y:start.y+260},center:{x:start.x+400,y:start.y+360},
  waypoints:[{...start},{x:start.x+400,y:start.y+180},{x:start.x+800,y:start.y+260}],
  maxVelocity:250,maxAcceleration:450,maxAngularVelocity:180,maxAngularAcceleration:360,headingMode:'constant',headingStart:0,headingEnd:0,actions:[]
})
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const bezier=(s,t)=>{const u=1-t;return{x:u*u*u*s.p0.x+3*u*u*t*s.p1.x+3*u*t*t*s.p2.x+t*t*t*s.p3.x,y:u*u*u*s.p0.y+3*u*u*t*s.p1.y+3*u*t*t*s.p2.y+t*t*t*s.p3.y}}
const quadratic=(a,c,b,t)=>{const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y}}
const catmull=(pts,t)=>{
  if(pts.length<2)return pts[0]||{x:0,y:0}
  const scaled=t*(pts.length-1),i=Math.min(pts.length-2,Math.floor(scaled)),u=scaled-i
  const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)]
  const f=(a,b,c,d)=>.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)
  return {x:f(p0.x,p1.x,p2.x,p3.x),y:f(p0.y,p1.y,p2.y,p3.y)}
}
const pathPoint=(s,t)=>{
  if(s.type==='turn')return {...s.p0}
  if(s.type==='pose'||s.type==='linear')return{x:s.p0.x+(s.p3.x-s.p0.x)*t,y:s.p0.y+(s.p3.y-s.p0.y)*t}
  if(s.type==='arc')return quadratic(s.p0,s.center||{x:(s.p0.x+s.p3.x)/2,y:(s.p0.y+s.p3.y)/2},s.p3,t)
  if(s.type==='polyline'){
    const pts=s.waypoints?.length>=2?s.waypoints:[s.p0,s.p3],scaled=t*(pts.length-1),i=Math.min(pts.length-2,Math.floor(scaled)),u=scaled-i
    return{x:pts[i].x+(pts[i+1].x-pts[i].x)*u,y:pts[i].y+(pts[i+1].y-pts[i].y)*u}
  }
  if(s.type==='spline')return catmull(s.waypoints?.length>=2?s.waypoints:[s.p0,s.p3],t)
  return bezier(s,t)
}
const samples=(s,n=100)=>Array.from({length:n+1},(_,i)=>pathPoint(s,i/n))
const angularDelta=(from,to)=>((to-from+540)%360)-180
const motionTime=(distance,maxVelocity,maxAcceleration)=>{
  if(distance<=1e-6)return 0
  const v=Math.max(1,maxVelocity),a=Math.max(1,maxAcceleration),ramp=v*v/a
  return distance<=ramp?2*Math.sqrt(distance/a):2*v/a+(distance-ramp)/v
}
const metrics=(s)=>{
  if(s.type==='turn'){
    const angle=Math.abs(angularDelta(Number(s.headingStart||0),Number(s.headingEnd||0)))
    return {length:0,time:motionTime(angle,s.maxAngularVelocity||180,s.maxAngularAcceleration||360),pts:[{...s.p0},{...s.p0}],cumulative:[0,0]}
  }
  const pts=samples(s,160);let length=0;const cumulative=[0]
  for(let i=1;i<pts.length;i++){length+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);cumulative.push(length)}
  return {length,time:motionTime(length,s.maxVelocity,s.maxAcceleration),pts,cumulative}
}
const fmt=(n)=>`${n.toFixed(2)} s`
function headingAt(s,t,dx,dy,fallback=0){
  if(s.headingMode==='tangent')return Math.atan2(dy,dx)*180/Math.PI
  const start=Number(s.headingStart??fallback),end=Number(s.headingEnd??start)
  if(s.headingMode==='linear'||s.headingMode==='interpolated'){
    let delta=((end-start+540)%360)-180
    return start+delta*t
  }
  return start
}
function poseAtTime(segments, time, startPose) {
  let elapsed=Math.max(0,time), pose={...startPose}
  for(const s of segments){
    const m=metrics(s),d=m.length,v=s.maxVelocity,a=s.maxAcceleration,t=m.time
    if(s.type==='turn') {
      const delta=angularDelta(Number(s.headingStart||0),Number(s.headingEnd||0))
      if(elapsed>=t){pose={...s.p0,heading:Number(s.headingStart||0)+delta};elapsed-=t;continue}
      const f=t>1e-6?clamp(elapsed/t,0,1):1
      return {...s.p0,heading:Number(s.headingStart||0)+delta*f}
    }
    if(elapsed>=t){elapsed-=t;const tail=m.pts[m.pts.length-1],before=m.pts[m.pts.length-2];pose={...s.p3,heading:headingAt(s,1,tail.x-before.x,tail.y-before.y,startPose.heading||0)};continue}
    let distance=0, ta=v/a, da=.5*a*ta*ta, cruise=Math.max(0,t-2*ta), peakV=v
    if(d<=v*v/a){ta=Math.sqrt(d/a);da=.5*a*ta*ta;cruise=0;peakV=a*ta}
    if(elapsed<ta) distance=.5*a*elapsed*elapsed
    else if(elapsed<ta+cruise) distance=da+peakV*(elapsed-ta)
    else {const td=elapsed-ta-cruise;distance=da+peakV*cruise+peakV*td-.5*a*td*td}
    distance=clamp(distance,0,d)
    let idx=1;while(idx<m.cumulative.length-1&&m.cumulative[idx]<distance)idx++
    const lo=m.cumulative[idx-1],hi=m.cumulative[idx],f=hi===lo?0:(distance-lo)/(hi-lo)
    const p=m.pts[idx-1],q=m.pts[idx],x=p.x+(q.x-p.x)*f,y=p.y+(q.y-p.y)*f
    const dx=q.x-p.x,dy=q.y-p.y
    const pathT=(idx-1+f)/(m.pts.length-1)
    return {x,y,heading:headingAt(s,pathT,dx,dy,startPose.heading||0)}
  }
  return pose
}
function toRobotFrame(p, robot){
  const dx=p.x-robot.x,dy=p.y-robot.y,h=(robot.heading||0)*Math.PI/180,c=Math.cos(h),s=Math.sin(h)
  return {x:dx*c+dy*s,y:-dx*s+dy*c}
}
const javaNumber=(n)=>Number(n).toFixed(1)
function exportJava(segments, robot, className) {
  const safe=(className.replace(/[^a-zA-Z0-9_]/g,'')||'BillyAuto')
  const rel=(p)=>toRobotFrame(p,robot)
  const heading=(degrees)=>((Number(degrees||0)-(robot.heading||0)+540)%360)-180
  const identifier=(value,fallback='customAction')=>{
    let name=String(value||fallback).replace(/[^a-zA-Z0-9_$]/g,'_')
    if(!/^[a-zA-Z_$]/.test(name))name=`_${name}`
    return name||fallback
  }
  const cubicChunks=(s)=>{
    if(s.type==='bezier') return [[s.p0,s.p1,s.p2,s.p3]]
    const count=s.type==='arc'?8:s.type==='polyline'?Math.max(1,(s.waypoints?.length||2)-1):12
    const chunks=[]
    for(let i=0;i<count;i++){
      const t0=i/count,t1=(i+1)/count,p0=pathPoint(s,t0),p3=pathPoint(s,t1)
      const dt=Math.min(.001,1/(count*20))
      const before=pathPoint(s,Math.max(0,t0-dt)),after=pathPoint(s,Math.min(1,t1+dt))
      const next0=pathPoint(s,Math.min(1,t0+dt)),prev1=pathPoint(s,Math.max(0,t1-dt))
      const scale=(t1-t0)/3/(2*dt)
      const d0={x:(next0.x-before.x)*scale,y:(next0.y-before.y)*scale}
      const d1={x:(after.x-prev1.x)*scale,y:(after.y-prev1.y)*scale}
      chunks.push([p0,{x:p0.x+d0.x,y:p0.y+d0.y},{x:p3.x-d1.x,y:p3.y-d1.y},p3])
    }
    return chunks
  }
  const calls=[]
  const warnings=[]
  const helperNames=[]
  const usedNames=new Set()
  const uniqueMethod=(raw,index)=>{
    const base=identifier(raw,`onPathAction${index+1}`)
    let name=base,n=2
    while(usedNames.has(name))name=`${base}_${n++}`
    usedNames.add(name)
    return name
  }
  const appendBezierHeadingAction=(chunk,startHeading,endHeading,label)=>{
    const [p0,p1,p2,p3]=chunk.map(rel)
    const h0=heading(startHeading),h3=heading(endHeading)
    calls.push(`${label}\n    .then(new BillyDriveLib.Action() {\n        @Override\n        public void start(BillyDriveLib.BillyDrive d) {\n            d.followPath(new BillyDriveLib.BezierCurve(\n                new BillyDriveLib.Pose2D(${javaNumber(p0.x)}, ${javaNumber(p0.y)}, ${h0.toFixed(2)}),\n                new BillyDriveLib.Pose2D(${javaNumber(p1.x)}, ${javaNumber(p1.y)}, 0),\n                new BillyDriveLib.Pose2D(${javaNumber(p2.x)}, ${javaNumber(p2.y)}, 0),\n                new BillyDriveLib.Pose2D(${javaNumber(p3.x)}, ${javaNumber(p3.y)}, ${h3.toFixed(2)})\n            ), BillyDriveLib.BillyDrive.HeadingMode.LINEAR);\n        }\n        @Override\n        public void update(BillyDriveLib.BillyDrive d) {\n            d.update();\n            if (!d.isBusy()) finish();\n        }\n    })`)
  }
  segments.forEach((s,index)=>{
    const label=`// ${String(index+1).padStart(2,'0')} · ${s.name} · ${s.type.toUpperCase()} · ${(metrics(s).length/10).toFixed(1)} cm`
    if(s.type==='turn'){
      calls.push(`${label}\n    .turnTo(${heading(s.headingEnd).toFixed(2)})`)
    } else if(s.type==='pose'){
      const end=rel(s.p3)
      calls.push(`${label}\n    .lineToPose(${javaNumber(end.x)}, ${javaNumber(end.y)}, ${heading(s.headingEnd).toFixed(2)})`)
    } else if(s.type==='linear'){
      const end=rel(s.p3)
      const endH=heading(s.headingEnd)
      if(s.headingMode==='linear'||s.headingMode==='interpolated') calls.push(`${label}\n    .lineToPose(${javaNumber(end.x)}, ${javaNumber(end.y)}, ${endH.toFixed(2)})`)
      else {
        calls.push(`${label}\n    .lineTo(${javaNumber(end.x)}, ${javaNumber(end.y)})`)
        if(s.headingMode==='tangent') warnings.push(`${s.name}: lineTo() không hỗ trợ tangent heading; đã export dưới dạng giữ heading.`)
      }
    } else if(s.type==='polyline'){
      const pts=(s.waypoints?.length>=2?s.waypoints:[s.p0,s.p3]).slice(1)
      pts.forEach((p,j)=>{const q=rel(p);calls.push(`${j===0?label:`// ${s.name} · waypoint ${j+1}`}\n    .lineTo(${javaNumber(q.x)}, ${javaNumber(q.y)})`)})
      if(s.headingMode==='tangent') warnings.push(`${s.name}: Polyline tangent heading chưa được BillyDriveLib PathBuilder hỗ trợ.`)
      else if(s.headingMode==='linear'||s.headingMode==='interpolated') warnings.push(`${s.name}: Polyline export bằng lineTo(); heading interpolation không áp dụng trên từng waypoint.`)
    } else {
      const chunks=cubicChunks(s)
      const hasLinearHeading=s.headingMode==='linear'||s.headingMode==='interpolated'
      chunks.forEach((chunk,j)=>{
        const firstLabel=j===0?label:`// ${s.name} · curve section ${j+1}/${chunks.length}`
        if(hasLinearHeading){
          const h0=Number(s.headingStart||0)+(Number(s.headingEnd||0)-Number(s.headingStart||0))*j/chunks.length
          const h1=Number(s.headingStart||0)+(Number(s.headingEnd||0)-Number(s.headingStart||0))*(j+1)/chunks.length
          appendBezierHeadingAction(chunk,h0,h1,firstLabel)
        } else {
          const [,p1,p2,p3]=chunk.map(rel)
          calls.push(`${firstLabel}\n    .splineTo(${javaNumber(p1.x)}, ${javaNumber(p1.y)},\n             ${javaNumber(p2.x)}, ${javaNumber(p2.y)},\n             ${javaNumber(p3.x)}, ${javaNumber(p3.y)})`)
        }
      })
      if(s.headingMode==='tangent') warnings.push(`${s.name}: BillyDriveLib hiện chỉ hỗ trợ CONSTANT và LINEAR cho followPath(); tangent heading chưa có API tương ứng.`)
    }
    ;(s.actions||[]).forEach((action,actionIndex)=>{
      const method=uniqueMethod(action.name,helperNames.length)
      helperNames.push(method)
      calls.push(`// ACTION MARKER · after ${s.name}\n    .then(BillyDriveLib.Actions.instant(() -> ${method}()))`)
    })
  })
  const chain=calls.length?`        boolean pathCompleted = drive.path()\n${calls.join('\n')}\n    .waitToFinish(this, 15.0);`:`        boolean pathCompleted = true; // No motion segments were added.`
  const warningBlock=warnings.length?`// EXPORT NOTES:\n${[...new Set(warnings)].map(w=>`// - ${w}`).join('\n')}\n// Review these notes before running the OpMode.\n`:'// Heading and movement commands are exported using BillyDriveLib APIs.\n'
  const helpers=helperNames.length?`\n\n    // Custom action hooks. Add your mechanism code inside each method.\n${helperNames.map(name=>`    private void ${name}() {\n        // TODO: Add your custom code here.\n        // Example: claw.setPosition(0.7);\n    }`).join('\n\n')}\n`:''
  return `// Generated by BillyPath Studio\n// BillyDriveLib PathBuilder style\n// Coordinates are relative to the robot start pose, in millimeters.\n// +X = forward, +Y = right, positive heading = counter-clockwise.\n${warningBlock}import com.qualcomm.robotcore.eventloop.opmode.Autonomous;\nimport com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;\nimport org.firstinspires.ftc.teamcode.JavaOnRobot.JavaOnRobot.BillyDriveLib;\n\n@Autonomous(name = "${safe}", group = "BillyPath")\npublic class ${safe} extends LinearOpMode {\n    @Override\n    public void runOpMode() {\n        BillyDriveLib.BillyDrive drive =\n                new BillyDriveLib.BillyDrive(hardwareMap);\n\n        drive.setMaxPowers(0.30, 0.22);\n        drive.resetPose();\n\n        telemetry.addLine("BillyPath ready");\n        telemetry.addLine("Check motor mapping, IMU and odometry offsets");\n        telemetry.update();\n\n        waitForStart();\n        if (isStopRequested()) return;\n\n${chain}\n\n        telemetry.addData("Path", pathCompleted ? "COMPLETE" : "STOPPED / TIMEOUT");\n        telemetry.update();\n        drive.stop();\n    }${helpers}\n}\n`
}
function App(){
  const [field,setField]=useState({length:FIELD_MM,width:FIELD_MM,preset:'custom'})
  const [robot,setRobot]=useState(null)
  const [segments,setSegments]=useState([])
  const [selected,setSelected]=useState(-1)
  const [newPathType,setNewPathType]=useState('bezier')
  const [selectedPoint,setSelectedPoint]=useState('p3')
  const [obstacles,setObstacles]=useState([])
  const [selectedObstacle,setSelectedObstacle]=useState(-1)
  const [image,setImage]=useState(null)
  const [view,setView]=useState('2d')
  const [playing,setPlaying]=useState(false)
  const [currentTime,setCurrentTime]=useState(0)
  const [showGrid,setShowGrid]=useState(true)
  const [showLabels,setShowLabels]=useState(true)
  const [tool,setTool]=useState('select')
  const [addZone,setAddZone]=useState(false)
  const [className,setClassName]=useState('BillyAuto')
  const [exportOpen,setExportOpen]=useState(false)
  const [toast,setToast]=useState('')
  const [drag,setDrag]=useState(null)
  const [rightOpen,setRightOpen]=useState(true)
  const [leftOpen,setLeftOpen]=useState(true)
  const svgRef=useRef(null)
  const imageRef=useRef(null)
  const timerRef=useRef(0)
  const simTimeRef=useRef(0)
  const seg=segments[selected]||null
  const totalTime=useMemo(()=>segments.reduce((sum,s)=>sum+metrics(s).time,0),[segments])
  const totalDistance=useMemo(()=>segments.reduce((sum,s)=>sum+metrics(s).length,0),[segments])
  const simPose=robot?poseAtTime(segments,currentTime,robot):{x:0,y:0,heading:0}
  const notify=(s)=>{setToast(s);window.clearTimeout(timerRef.current);timerRef.current=window.setTimeout(()=>setToast(''),2300)}
  const worldToSvg=(p)=>({x:500+(p.y/Math.max(field.width,field.length))*900,y:500-(p.x/Math.max(field.width,field.length))*900})
  const svgToWorld=(x,y)=>({x:(500-y)*Math.max(field.width,field.length)/900,y:(x-500)*Math.max(field.width,field.length)/900})
  const scale=900/Math.max(field.length,field.width)
  const updateSegment=(i,patch)=>setSegments(old=>{
    const next=old.map((s,j)=>j===i?{...s,...patch}:s)
    if(next[i]?.type==='turn')next[i].p3={...next[i].p0}
    if(next[i]?.type==='pose')next[i].headingMode='linear'
    // Enforce a continuous chain: each segment starts exactly at the previous endpoint.
    for(let j=1;j<next.length;j++){next[j].p0={...next[j-1].p3};if(next[j].type==='turn')next[j].p3={...next[j].p0};if(next[j].waypoints?.length)next[j].waypoints[0]={...next[j].p0}}
    if(next[i]?.waypoints?.length){next[i].waypoints[0]={...next[i].p0};next[i].waypoints[next[i].waypoints.length-1]={...next[i].p3}}
    return next
  })
  const updatePoint=(i,key,axis,value)=>{
    const n=Number(value);if(!Number.isFinite(n))return
    if(i===0&&(key==='p0'||key==='wp-0')&&robot)setRobot(r=>({...r,[axis]:n}))
    setSegments(old=>{
      const next=old.map(s=>({...s,p0:{...s.p0},p1:{...s.p1},p2:{...s.p2},p3:{...s.p3},center:{...s.center},waypoints:(s.waypoints||[]).map(p=>({...p}))}))
      if(key.startsWith('wp-')){const wi=Number(key.slice(3)),last=(next[i].waypoints?.length||1)-1;if(wi===0)next[i].p0[axis]=n;else if(wi===last)next[i].p3[axis]=n;else if(next[i].waypoints?.[wi])next[i].waypoints[wi][axis]=n}
      else if(next[i][key])next[i][key][axis]=n
      if(key==='p3'||(key.startsWith('wp-')&&Number(key.slice(3))===(next[i].waypoints?.length||0)-1)){if(next[i+1])next[i+1].p0={...next[i].p3}}
      if(i>0&&key==='p0')next[i-1].p3={...next[i].p0}
      for(let j=1;j<next.length;j++)next[j].p0={...next[j-1].p3}
      if(next[i].waypoints?.length){next[i].waypoints[0]={...next[i].p0};next[i].waypoints[next[i].waypoints.length-1]={...next[i].p3}}
      return next
    })
  }
  const createRobot=()=>{if(robot){notify('Robot đã được tạo');return}setRobot({x:-field.length/2+350,y:-field.width/2+350,heading:0});notify('Robot đã tạo · đặt vị trí bằng kéo thả hoặc nhập số')}
  const addPath=()=>{
    if(!robot){notify('Hãy tạo robot trước khi tạo path');return}
    const start=segments.length?segments[segments.length-1].p3:robot
    const s=newSegment(start,segments.length,newPathType)
    s.headingStart=segments.length?segments[segments.length-1].headingEnd:(robot.heading||0)
    s.headingEnd=(newPathType==='turn'||newPathType==='pose')?s.headingStart+90:s.headingStart
    if(newPathType==='turn')s.p3={...start}
    if(newPathType==='pose')s.headingMode='linear'
    if(s.waypoints?.length){s.waypoints[0]={...start};s.waypoints[s.waypoints.length-1]={...s.p3}}
    setSegments(old=>[...old,s]);setSelected(segments.length);setSelectedPoint('p3');setCurrentTime(totalTime);setPlaying(false)
  }
  const deletePath=()=>{if(selected<0)return;setSegments(old=>{const next=old.filter((_,i)=>i!==selected).map(s=>({...s,p0:{...s.p0},p1:{...s.p1},p2:{...s.p2},p3:{...s.p3}}));if(next.length&&robot)next[0].p0={x:robot.x,y:robot.y};for(let i=1;i<next.length;i++)next[i].p0={...next[i-1].p3};return next});setSelected(Math.max(-1,selected-1));setCurrentTime(0)}
  const addActionMarker=()=>{if(selected<0)return;setSegments(old=>old.map((s,i)=>i===selected?{...s,actions:[...(s.actions||[]),{id:uid(),name:`onAction${(s.actions||[]).length+1}`}]}:s));notify('Đã thêm action marker sau segment này')}
  const updateActionMarker=(actionId,name)=>setSegments(old=>old.map((s,i)=>i===selected?{...s,actions:(s.actions||[]).map(a=>a.id===actionId?{...a,name}:a)}:s))
  const removeActionMarker=(actionId)=>setSegments(old=>old.map((s,i)=>i===selected?{...s,actions:(s.actions||[]).filter(a=>a.id!==actionId)}:s))
  const onImage=(e)=>{const f=e.target.files?.[0];if(!f)return;const url=URL.createObjectURL(f);setImage(url);const im=new Image();im.onload=()=>imageRef.current=im;im.src=url}
  const setPreset=(preset)=>{
    setField({length:FIELD_MM,width:FIELD_MM,preset})
    setSegments([]);setSelected(-1);setCurrentTime(0);setPlaying(false)
    notify(`${preset==='decode'?'DECODE':preset==='biobuzz'?'BIOBUZZ':'Custom'} field loaded`)
  }
  const svgPoint=(e)=>{
    const svg=svgRef.current,pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY
    const q=pt.matrixTransform(svg.getScreenCTM().inverse())
    return svgToWorld(q.x,q.y)
  }
  const onDown=(e)=>{
    if(!svgRef.current)return
    const p=svgPoint(e),target=e.target
    if(addZone){setObstacles(old=>[...old,{id:uid(),x:p.x,y:p.y,size:420}]);setSelectedObstacle(obstacles.length);setAddZone(false);notify('Vùng cấm hình vuông đã được thêm');return}
    if(target.dataset.robot==='true'){setDrag({kind:'robot'});e.currentTarget.setPointerCapture(e.pointerId);return}
    if(target.dataset.obstacle){setSelectedObstacle(Number(target.dataset.obstacle));setDrag({kind:'obstacle',index:Number(target.dataset.obstacle)});e.currentTarget.setPointerCapture(e.pointerId);return}
    if(target.dataset.resize){setDrag({kind:'resize',index:Number(target.dataset.resize)});e.currentTarget.setPointerCapture(e.pointerId);return}
    if(target.dataset.point&&selected>=0){setSelectedPoint(target.dataset.point);setDrag({kind:'point',key:target.dataset.point,index:selected});e.currentTarget.setPointerCapture(e.pointerId);return}
    if(target.dataset.segment){setSelected(Number(target.dataset.segment));return}
    if(tool==='pan'){setDrag({kind:'pan',x:e.clientX,y:e.clientY});return}
  }
  const onMove=(e)=>{
    if(!drag)return
    const p=svgPoint(e)
    if(drag.kind==='robot')setRobot(r=>({...r,x:p.x,y:p.y}))
    if(drag.kind==='point')updatePoint(drag.index,drag.key,'x',p.x),updatePoint(drag.index,drag.key,'y',p.y)
    if(drag.kind==='obstacle')setObstacles(old=>old.map((o,i)=>i===drag.index?{...o,x:p.x,y:p.y}:o))
    if(drag.kind==='resize')setObstacles(old=>old.map((o,i)=>i===drag.index?{...o,size:Math.max(80,Math.round(Math.max(Math.abs(p.x-o.x),Math.abs(p.y-o.y))*2))}:o))
  }
  const seek=(t)=>{const n=clamp(Number(t),0,totalTime||0);simTimeRef.current=n;setPlaying(false);setCurrentTime(n)}
  const play=()=>{if(!robot||!segments.length){notify('Tạo robot và ít nhất một path để simulate');return}if(playing){setPlaying(false);return}const start=currentTime>=totalTime?0:currentTime;simTimeRef.current=start;setCurrentTime(start);setPlaying(true)}
  useEffect(()=>{
    if(!playing)return
    let raf,last=performance.now()
    const tick=now=>{
      const dt=(now-last)/1000;last=now
      simTimeRef.current=Math.min(totalTime,simTimeRef.current+dt)
      setCurrentTime(simTimeRef.current)
      if(simTimeRef.current>=totalTime){setPlaying(false);return}
      raf=requestAnimationFrame(tick)
    }
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
  },[playing,totalTime])
  useEffect(()=>{simTimeRef.current=currentTime;if(currentTime>totalTime){simTimeRef.current=totalTime;setCurrentTime(totalTime)}},[totalTime,currentTime])
  useEffect(()=>{
    if(!robot||!segments.length)return
    setSegments(old=>{
      if(!old.length)return old
      if(Math.abs(old[0].p0.x-robot.x)<.01&&Math.abs(old[0].p0.y-robot.y)<.01)return old
      const next=old.map(s=>({...s,p0:{...s.p0},p1:{...s.p1},p2:{...s.p2},p3:{...s.p3}}))
      next[0].p0={x:robot.x,y:robot.y}
      if(next[0].waypoints?.length)next[0].waypoints[0]={...next[0].p0}
      for(let i=1;i<next.length;i++){next[i].p0={...next[i-1].p3};if(next[i].waypoints?.length)next[i].waypoints[0]={...next[i].p0}}
      return next
    })
  },[robot?.x,robot?.y])
  const code=robot?exportJava(segments,robot,className):''
  const copyCode=async()=>{await navigator.clipboard.writeText(code);notify('Đã copy Java code')}
  const downloadCode=()=>{const blob=new Blob([code],{type:'text/x-java'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${className||'BillyAuto'}.java`;a.click();URL.revokeObjectURL(url);notify('Đã export Java')}
  const activeSegmentIndex=()=>{let t=currentTime;for(let i=0;i<segments.length;i++){const d=metrics(segments[i]).time;if(t<=d)return i;t-=d}return Math.max(0,segments.length-1)}
  const activeIndex=activeSegmentIndex()
  const addObstacle=()=>{if(!robot){notify('Tạo robot trước');return}setAddZone(true);setTool('select')}
  const optimize=()=>{
    if(selected<0||!obstacles.length){notify('Chọn path và thêm vùng cấm trước');return}
    const s=seg,o=obstacles[0],dx=s.p3.x-s.p0.x,dy=s.p3.y-s.p0.y,len=Math.hypot(dx,dy)||1
    const side=Math.sign(dx*(o.y-s.p0.y)-dy*(o.x-s.p0.x))||1
    const nx=-dy/len*side,ny=dx/len*side,offset=o.size/2+260
    updateSegment(selected,{p1:{x:s.p1.x+nx*offset,y:s.p1.y+ny*offset},p2:{x:s.p2.x+nx*offset,y:s.p2.y+ny*offset}})
    notify('Đã đề xuất đường vòng · kiểm tra va chạm trước khi chạy')
  }
  const fieldDecoration=()=>{
    const items=[]
    if(field.preset==='decode'){
      // Approximate schematic of field elements, not a replacement for official CAD.
      items.push(<g key="decode"><rect x="390" y="410" width="220" height="180" rx="18" fill="#777b86" opacity=".28" stroke="#b7bbc4" strokeWidth="3"/><text x="500" y="505" textAnchor="middle" fill="#e8e8ec" fontSize="20">OBELISK</text><rect x="65" y="80" width="150" height="95" rx="10" fill="#2563eb" opacity=".55"/><text x="140" y="135" fill="white" fontSize="16" textAnchor="middle">BLUE GOAL</text><rect x="785" y="825" width="150" height="95" rx="10" fill="#dc3545" opacity=".55"/><text x="860" y="880" fill="white" fontSize="16" textAnchor="middle">RED GOAL</text><rect x="40" y="770" width="170" height="150" fill="#2563eb" opacity=".13" stroke="#60a5fa" strokeWidth="3"/><rect x="790" y="80" width="170" height="150" fill="#dc3545" opacity=".13" stroke="#fb7185" strokeWidth="3"/><text x="125" y="850" fill="#93c5fd" textAnchor="middle" fontSize="15">BLUE BASE</text><text x="875" y="150" fill="#fda4af" textAnchor="middle" fontSize="15">RED BASE</text></g>)
    } else if(field.preset==='biobuzz'){
      items.push(<g key="bio"><rect x="350" y="390" width="300" height="220" rx="16" fill="#777b86" opacity=".25" stroke="#b7bbc4" strokeWidth="3"/><text x="500" y="500" fill="#e8e8ec" textAnchor="middle" fontSize="20">HIVE FRAME</text>{[[110,110],[890,110],[110,890],[890,890]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="48" fill="#eab308" opacity=".18" stroke="#facc15" strokeWidth="5"/><text x={x} y={y+6} fill="#fde68a" textAnchor="middle" fontSize="15">FLOWER</text></g>)}<rect x="0" y="390" width="75" height="220" fill="#2563eb" opacity=".22"/><rect x="925" y="390" width="75" height="220" fill="#dc3545" opacity=".22"/><text x="38" y="510" fill="#93c5fd" fontSize="13" textAnchor="middle" transform="rotate(-90 38 510)">BLUE LOADING</text><text x="963" y="510" fill="#fda4af" fontSize="13" textAnchor="middle" transform="rotate(90 963 510)">RED LOADING</text></g>)
    }
    return items
  }
  const fieldTiles=Array.from({length:5},(_,i)=><g key={i}><line x1={(i+1)*1000/6} y1="0" x2={(i+1)*1000/6} y2="1000" stroke="rgba(255,255,255,.10)" strokeDasharray="5 5"/><line x1="0" y1={(i+1)*1000/6} x2="1000" y2={(i+1)*1000/6} stroke="rgba(255,255,255,.10)" strokeDasharray="5 5"/></g>)
  const handle=(p)=>worldToSvg(p)
  const currentPose=robot?simPose:null
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Route size={19}/></div><div><div className="brand-name">BILLYPATH <span>STUDIO</span></div><div className="brand-sub">FTC AUTONOMOUS PATH DESIGNER</div></div></div>
      <div className="top-center"><span className="status-dot"/><span>{robot?'Robot ready':'No robot created'}</span><span className="top-divider"/><span>{field.preset.toUpperCase()} · {Math.round(field.length)} × {Math.round(field.width)} mm</span></div>
      <div className="top-actions"><button className="btn ghost" onClick={()=>{setRobot(null);setSegments([]);setSelected(-1);setObstacles([]);setCurrentTime(0);setPlaying(false);notify('Project đã reset')}}><Plus size={14}/> New</button><button className="btn primary" disabled={!robot||!segments.length} onClick={()=>setExportOpen(true)}><Download size={14}/> Export Java</button></div>
    </header>
    <div className="workspace">
      <aside className={`left-panel ${leftOpen?'':'collapsed'}`}>
        <div className="panel-heading"><span>PROJECT & FIELD</span><button className="icon-btn panel-collapse" onClick={()=>setLeftOpen(v=>!v)}><ChevronLeft size={15}/></button></div>
        <div className="project-card"><div className="project-icon"><Bot size={18}/></div><div className="project-info"><b>FTC Autonomous</b><small>BillyDriveLib · Cubic Bezier</small></div><span className="live-dot"/></div>
        <div className="section-label">ROBOT · REQUIRED FIRST</div>
        <button className="wide-action" onClick={createRobot}><Bot size={15}/>{robot?'Robot created':'Create robot'}{robot?<span className="checkmark">✓</span>:<Plus size={14}/>}</button>
        {robot&&<div className="field-grid"><label>X <input type="number" value={robot.x.toFixed(0)} onChange={e=>setRobot({...robot,x:Number(e.target.value)})}/><small>mm</small></label><label>Y <input type="number" value={robot.y.toFixed(0)} onChange={e=>setRobot({...robot,y:Number(e.target.value)})}/><small>mm</small></label><label className="full">Heading <input type="number" value={robot.heading} onChange={e=>setRobot({...robot,heading:Number(e.target.value)})}/><small>°</small></label></div>}
        <div className="section-label">FIELD PRESETS</div>
        <select className="preset-select" value={field.preset} onChange={e=>setPreset(e.target.value)}><option value="custom">Custom field</option><option value="decode">FTC DECODE 2025–26</option><option value="biobuzz">FTC BIOBUZZ 2026–27</option></select>
        {field.preset!=='custom'&&<div className="preset-note">Schematic layout for path planning, not official CAD geometry. Verify exact element positions with FIRST field drawings.</div>}
        <label className="upload-field"><ImagePlus size={16}/><span><b>Upload field image</b><small>PNG / JPG background</small></span><Upload size={14}/><input type="file" accept="image/*" onChange={onImage}/></label>
        <div className="field-grid"><label>Length <input type="number" value={field.length} onChange={e=>setField({...field,length:Math.max(500,Number(e.target.value))})}/><small>mm</small></label><label>Width <input type="number" value={field.width} onChange={e=>setField({...field,width:Math.max(500,Number(e.target.value))})}/><small>mm</small></label></div>
        <div className="section-label">PATH TOOLS</div>
        <select className="preset-select movement-select" value={newPathType} onChange={e=>setNewPathType(e.target.value)} disabled={!robot}>{MOVEMENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label} · {t.description}</option>)}</select>
        <button className="wide-action" disabled={!robot} onClick={addPath}><Plus size={15}/> Add {MOVEMENT_TYPES.find(t=>t.value===newPathType)?.label}</button>
        <div className="tool-list"><button className={tool==='select'?'tool active':'tool'} onClick={()=>setTool('select')}><MousePointer2 size={15}/> Select / drag</button><button className={tool==='pan'?'tool active':'tool'} onClick={()=>setTool('pan')}><Crosshair size={15}/> Pan field</button><button className="tool" disabled={!robot} onClick={addObstacle}><Square size={15}/> Add square obstacle <Plus size={13}/></button><button className="tool" disabled={!obstacles.length||selected<0} onClick={optimize}><Route size={15}/> Suggest detour</button></div>
        <div className="section-label">DISPLAY</div><div className="toggle-row"><span><Grid3X3 size={14}/> Grid</span><button className={`switch ${showGrid?'on':''}`} onClick={()=>setShowGrid(!showGrid)}/></div><div className="toggle-row"><span><Eye size={14}/> Path labels</span><button className={`switch ${showLabels?'on':''}`} onClick={()=>setShowLabels(!showLabels)}/></div>
        <div className="left-footer">BillyPath Studio <span>v0.6</span></div>
      </aside>
      <main className="main-area">
        <div className="canvas-toolbar"><div className="view-tabs"><button className={view==='2d'?'selected':''} onClick={()=>setView('2d')}><Grid3X3 size={14}/> 2D Field</button><button className={view==='3d'?'selected':''} onClick={()=>setView('3d')}><Box size={14}/> 3D Preview</button></div><div className="canvas-tools"><span className="coord-readout">+X FORWARD <i/> +Y RIGHT</span><button className="icon-btn" onClick={()=>{setCurrentTime(0);setPlaying(false)}} title="Reset simulation"><RotateCcw size={14}/></button></div></div>
        <div className="canvas-wrap">
          {view==='2d'?<svg ref={svgRef} className="field-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)}>
            <defs><clipPath id="fieldClip"><rect x="0" y="0" width="1000" height="1000"/></clipPath></defs>
            <rect width="1000" height="1000" fill="#202228"/>
            {image&&<image href={image} x="0" y="0" width="1000" height="1000" opacity=".65" preserveAspectRatio="none"/>}
            {field.preset!=='custom'&&<g opacity=".8">{fieldDecoration()}</g>}
            {showGrid&&<g>{fieldTiles}</g>}
            <rect x="4" y="4" width="992" height="992" fill="none" stroke="#8b8e98" strokeWidth="8"/>
            {obstacles.map((o,i)=>{const p=worldToSvg(o),size=o.size*scale;return <g key={o.id}><rect data-obstacle={i} x={p.x-size/2} y={p.y-size/2} width={size} height={size} fill="#e34450" fillOpacity=".24" stroke="#ff5b66" strokeWidth="3" rx="2"/><rect data-resize={i} x={p.x+size/2-9} y={p.y+size/2-9} width="18" height="18" fill="#ff727b" stroke="#fff" strokeWidth="2"/><text x={p.x} y={p.y-size/2-10} textAnchor="middle" fill="#ffb3b8" fontSize="18">{Math.round(o.size)} mm</text></g>})}
            {segments.map((s,i)=>{
              const pts=samples(s,70).map(worldToSvg),d=pts.map((p,j)=>`${j?'L':'M'}${p.x},${p.y}`).join(' '),active=i===selected
              const keys=s.type==='bezier'?['p0','p1','p2','p3']:s.type==='arc'?['p0','center','p3']:['linear','pose','turn'].includes(s.type)?['p0','p3']:(s.waypoints||[]).map((_,j)=>`wp-${j}`)
              const getPoint=k=>k.startsWith('wp-')?s.waypoints[Number(k.slice(3))]:s[k]
              return <g key={s.id}>
                <path d={d} fill="none" stroke={active?'#ff5964':'#ed7c83'} strokeWidth={active?7:4} strokeLinecap="round" strokeLinejoin="round" data-segment={i}/>
                {showLabels&&<text x={pts[0].x+15} y={pts[0].y-15} fill="#fff" fontSize="19" stroke="#17181d" strokeWidth="4" paintOrder="stroke">{s.name} · {s.type}</text>}
                {active&&<>{s.type==='bezier'&&<path d={`M${handle(s.p0).x},${handle(s.p0).y} L${handle(s.p1).x},${handle(s.p1).y} M${handle(s.p3).x},${handle(s.p3).y} L${handle(s.p2).x},${handle(s.p2).y}`} stroke="#ffc0c4" strokeDasharray="8 7" strokeWidth="2" fill="none"/>}
                  {s.type==='arc'&&<path d={`M${handle(s.p0).x},${handle(s.p0).y} L${handle(s.center).x},${handle(s.center).y} L${handle(s.p3).x},${handle(s.p3).y}`} stroke="#ffc0c4" strokeDasharray="8 7" strokeWidth="2" fill="none"/>}
                  {keys.map(k=>{const p=handle(getPoint(k)),endpoint=k==='p0'||k==='p3'||k==='wp-0'||k===`wp-${(s.waypoints||[]).length-1}`;return <circle key={k} data-point={k} cx={p.x} cy={p.y} r={endpoint?13:10} fill={selectedPoint===k?'#fff':endpoint?'#ff5964':'#ffc0c4'} stroke="#202228" strokeWidth="4"/>})}
                </>}
              </g>
            })}
            {robot&&<g transform={`translate(${handle(currentPose||robot).x} ${handle(currentPose||robot).y}) rotate(${((currentPose||robot).heading||0)})`}><rect data-robot="true" x="-23" y="-30" width="46" height="60" rx="8" fill="#f2f2f3" stroke="#e33b46" strokeWidth="5"/><path d="M0 -40 L-10 -25 L10 -25 Z" fill="#e33b46"/><circle cx="-14" cy="-20" r="4" fill="#28292e"/><circle cx="14" cy="-20" r="4" fill="#28292e"/><circle cx="-14" cy="20" r="4" fill="#28292e"/><circle cx="14" cy="20" r="4" fill="#28292e"/></g>}
            {!robot&&<g><rect x="250" y="410" width="500" height="180" rx="18" fill="#292a31" stroke="#52545e" strokeDasharray="9 8"/><text x="500" y="480" fill="#f0f0f2" fontSize="30" textAnchor="middle">Create a robot first</text><text x="500" y="525" fill="#a1a3ad" fontSize="19" textAnchor="middle">Path tools unlock after placing your robot</text></g>}
            {addZone&&<text x="500" y="48" textAnchor="middle" fill="#ffb4b8" fontSize="20">Tap/click field to place a square no-go zone</text>}
          </svg>:<Scene3D segments={segments} robot={robot?currentPose:null} field={field} obstacles={obstacles}/>}
          <div className="canvas-legend"><span><i className="legend-line"/> Path</span><span><i className="legend-dot"/> Control point</span><span><i className="legend-zone"/> Square obstacle</span></div>
        </div>
        <div className="timeline-panel">
          <div className="timeline-head"><div className="timeline-title"><Clock3 size={15}/><b>SIMULATION TIMELINE</b><span className="muted">{segments.length} commands</span></div><div className="timeline-controls"><button className="icon-btn" onClick={()=>{setPlaying(false);setCurrentTime(0)}}><RotateCcw size={14}/></button><button className="play-btn" disabled={!robot||!segments.length} onClick={play}>{playing?<Pause size={13}/>:<Play size={13} fill="currentColor"/>}{playing?'Pause':'Simulate'}</button><span className="time-total">{fmt(currentTime)} / {fmt(totalTime)}</span></div></div>
          <input className="timeline-slider" type="range" min="0" max={Math.max(.01,totalTime)} step=".01" value={Math.min(currentTime,totalTime)} onChange={e=>seek(e.target.value)} disabled={!segments.length}/>
          <div className="segment-row">{segments.map((s,i)=><button key={s.id} className={`segment-chip ${selected===i?'active':''} ${activeIndex===i?'playing':''}`} onClick={()=>{setSelected(i);let t=0;for(let j=0;j<i;j++)t+=metrics(segments[j]).time;seek(t)}}><span className="segment-index">{String(i+1).padStart(2,'0')}</span><span>{s.name}</span><small>{s.type.toUpperCase()} · {fmt(metrics(s).time)}</small></button>)}<button className="add-segment" disabled={!robot} onClick={addPath}><Plus size={15}/> Add path</button></div>
          <div className="timeline-foot"><span>0.00 s</span><span>{robot?`Robot: X ${currentPose.x.toFixed(0)} · Y ${currentPose.y.toFixed(0)} · θ ${currentPose.heading.toFixed(1)}°`:'Create a robot to begin'}</span><span>{fmt(totalTime)}</span></div>
        </div>
      </main>
      <aside className={`right-panel ${rightOpen?'':'collapsed'}`}>
        <div className="inspector-head"><div><span className="section-kicker">INSPECTOR</span><h3>{selectedObstacle>=0&&obstacles[selectedObstacle]?'Obstacle settings':'Path settings'}</h3></div><button className="icon-btn panel-collapse" onClick={()=>setRightOpen(v=>!v)}><ChevronRight size={15}/></button></div>
        {selectedObstacle>=0&&obstacles[selectedObstacle]?<><div className="path-name"><Square size={15} color="#ff626c"/><b>Square no-go zone</b></div><div className="inspector-section"><div className="inspector-section-title">POSITION · MM</div><div className="field-grid"><label>X<input type="number" value={obstacles[selectedObstacle].x.toFixed(0)} onChange={e=>setObstacles(old=>old.map((o,i)=>i===selectedObstacle?{...o,x:Number(e.target.value)}:o))}/></label><label>Y<input type="number" value={obstacles[selectedObstacle].y.toFixed(0)} onChange={e=>setObstacles(old=>old.map((o,i)=>i===selectedObstacle?{...o,y:Number(e.target.value)}:o))}/></label></div></div><div className="inspector-section"><div className="inspector-section-title">SQUARE SIZE</div><label className="range-label">Side length <b>{obstacles[selectedObstacle].size} mm</b></label><input className="range" type="range" min="100" max="1800" step="10" value={obstacles[selectedObstacle].size} onChange={e=>setObstacles(old=>old.map((o,i)=>i===selectedObstacle?{...o,size:Number(e.target.value)}:o))}/><input className="numeric-size" type="number" min="100" max="3000" value={obstacles[selectedObstacle].size} onChange={e=>setObstacles(old=>old.map((o,i)=>i===selectedObstacle?{...o,size:Math.max(100,Number(e.target.value))}:o))}/><button className="wide-outline danger" onClick={()=>{setObstacles(old=>old.filter((_,i)=>i!==selectedObstacle));setSelectedObstacle(-1)}}><Trash2 size={14}/> Delete obstacle</button></div></>:seg?<><div className="path-name"><div className="path-color"/><input value={seg.name} onChange={e=>updateSegment(selected,{name:e.target.value})}/><span className="tiny-badge">{seg.type.toUpperCase()}</span></div><div className="inspector-section"><div className="inspector-section-title">MOVEMENT TYPE</div><select className="preset-select" value={seg.type} onChange={e=>updateSegment(selected,{type:e.target.value})}>{MOVEMENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div className="inspector-section"><div className="inspector-section-title">{seg.type==='bezier'?'BEZIER CONTROL POINTS':seg.type==='linear'?'LINE ENDPOINTS':seg.type==='arc'?'ARC CONTROL':'WAYPOINTS'} <span>MM</span></div>
        {(seg.type==='turn'?[]:seg.type==='bezier'?['p0','p1','p2','p3']:['linear','pose'].includes(seg.type)?['p0','p3']:seg.type==='arc'?['p0','center','p3']:(seg.waypoints||[]).map((_,j)=>`wp-${j}`)).map(k=>{const p=k.startsWith('wp-')?seg.waypoints[Number(k.slice(3))]:seg[k];return <div className={`point-editor ${selectedPoint===k?'point-selected':''}`} key={k} onClick={()=>setSelectedPoint(k)}><div className="point-tag">{k.startsWith('wp-')?`W${Number(k.slice(3))+1}`:k.toUpperCase()}</div><div className="point-inputs"><label>X<input type="number" value={p.x.toFixed(0)} onChange={e=>updatePoint(selected,k,'x',e.target.value)}/></label><label>Y<input type="number" value={p.y.toFixed(0)} onChange={e=>updatePoint(selected,k,'y',e.target.value)}/></label></div></div>})}
        {(seg.type==='polyline'||seg.type==='spline')&&<button className="wide-outline" onClick={()=>{const w=[...(seg.waypoints||[])],last=w[w.length-1],prev=w[w.length-2]||w[0];w.splice(w.length-1,0,{x:(prev.x+last.x)/2,y:(prev.y+last.y)/2});updateSegment(selected,{waypoints:w})}}><Plus size={13}/> Add waypoint</button>}
        <div className="point-lock-note">{seg.type==='turn'?'Rotation is performed at the current robot position.':'Start point is linked to the robot or previous path endpoint. End point links to the next segment.'}</div></div>
        <div className="inspector-section"><div className="inspector-section-title">{seg.type==='turn'?'ROTATION TARGET':'ROBOT HEADING'}</div>{seg.type!=='turn'&&<select className="preset-select" value={seg.headingMode} onChange={e=>updateSegment(selected,{headingMode:e.target.value})}><option value="constant">Constant heading</option><option value="linear">Linear heading</option><option value="tangent">Tangent to path</option><option value="interpolated">Interpolated start → end</option></select>}{(seg.type==='turn'||seg.headingMode!=='tangent')&&<div className="field-grid"><label>Start °<input type="number" value={seg.headingStart} onChange={e=>updateSegment(selected,{headingStart:Number(e.target.value)})}/></label><label>End °<input type="number" value={seg.headingEnd} onChange={e=>updateSegment(selected,{headingEnd:Number(e.target.value)})}/></label></div>}</div>{seg.type==='turn'&&<div className="inspector-section"><div className="inspector-section-title">ROTATION CONSTRAINTS</div><label className="range-label">Max angular velocity <b>{seg.maxAngularVelocity||180} °/s</b></label><input className="range" type="range" min="30" max="720" step="10" value={seg.maxAngularVelocity||180} onChange={e=>updateSegment(selected,{maxAngularVelocity:Number(e.target.value)})}/><label className="range-label">Max angular acceleration <b>{seg.maxAngularAcceleration||360} °/s²</b></label><input className="range" type="range" min="60" max="1440" step="20" value={seg.maxAngularAcceleration||360} onChange={e=>updateSegment(selected,{maxAngularAcceleration:Number(e.target.value)})}/></div>}{seg.type!=='turn'&&<div className="inspector-section"><div className="inspector-section-title">MOTION CONSTRAINTS</div><label className="range-label">Max velocity <b>{seg.maxVelocity} mm/s</b></label><input className="range" type="range" min="50" max="1000" step="10" value={seg.maxVelocity} onChange={e=>updateSegment(selected,{maxVelocity:Number(e.target.value)})}/><label className="range-label">Max acceleration <b>{seg.maxAcceleration} mm/s²</b></label><input className="range" type="range" min="50" max="2000" step="25" value={seg.maxAcceleration} onChange={e=>updateSegment(selected,{maxAcceleration:Number(e.target.value)})}/></div>}<div className="inspector-section"><div className="inspector-section-title">ACTION MARKERS <span>AFTER THIS SEGMENT</span></div><button className="wide-outline" onClick={addActionMarker}><Plus size={13}/> Add action marker</button>{(seg.actions||[]).map((action,actionIndex)=><div className="action-marker-editor" key={action.id}><div className="action-marker-label">ACTION {actionIndex+1} · RUN AFTER SEGMENT</div><div className="action-marker-row"><input value={action.name} onChange={e=>updateActionMarker(action.id,e.target.value)} placeholder="onAction1"/><button className="icon-btn" title="Remove action" onClick={()=>removeActionMarker(action.id)}><Trash2 size={13}/></button></div><small>Export tạo lời gọi hàm và một method TODO bên ngoài runOpMode().</small></div>)}</div><div className="inspector-section"><div className="inspector-section-title">PATH ANALYSIS</div><div className="metric-grid"><div className="metric"><small>Path length</small><b>{(metrics(seg).length/10).toFixed(1)} <em>cm</em></b></div><div className="metric"><small>Estimated time</small><b>{metrics(seg).time.toFixed(2)} <em>s</em></b></div></div></div><div className="inspector-section"><button className="wide-outline" onClick={addPath}><Plus size={14}/> Continue from route end</button><button className="wide-outline danger" onClick={deletePath}><Trash2 size={14}/> Delete segment</button></div></>:<div className="empty-inspector"><Bot size={26}/><b>No path selected</b><span>Create a robot, then add a path. Select a segment to edit its Bezier points.</span></div>}
        <div className="right-summary"><div className="summary-top"><Route size={14}/> ROUTE SUMMARY</div><div className="summary-stat"><span>Total distance</span><b>{(totalDistance/10).toFixed(1)} cm</b></div><div className="summary-stat"><span>Estimated runtime</span><b className="red-text">{fmt(totalTime)}</b></div><div className="summary-stat"><span>Obstacles</span><b>{obstacles.length}</b></div></div>
      </aside>
    </div>
    {exportOpen&&<div className="modal-backdrop" onClick={()=>setExportOpen(false)}><div className="export-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="section-kicker">CODE GENERATOR</span><h2>Export Java</h2><p>Generated for your BillyDriveLib · {segments.length} motion commands</p></div><button className="icon-btn" onClick={()=>setExportOpen(false)}>×</button></div><label className="export-name">OpMode class name<input value={className} onChange={e=>setClassName(e.target.value)}/></label><div className="code-window"><div className="code-title"><Code2 size={14}/>{className||'BillyAuto'}.java <span>JAVA</span></div><pre>{code}</pre></div><div className="export-warning">Export uses PathBuilder, LINEAR Bezier followPath actions, in-place turnTo(), and optional action markers with editable helper methods. Test at low power first.</div><div className="modal-actions"><button className="btn ghost" onClick={copyCode}><Copy size={14}/> Copy code</button><button className="btn primary" onClick={downloadCode}><Download size={14}/> Download .java</button></div></div></div>}
    {toast&&<div className="toast">{toast}</div>}
  </div>
}
export default App
