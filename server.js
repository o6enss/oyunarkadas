const express=require('express'),http=require('http'),path=require('path'),fs=require('fs'),os=require('os');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server);
const DIR=path.join(__dirname,'fotograflar'),EXT=/\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const rooms=new Map();
const rid=()=>Math.random().toString(36).slice(2,8);
const norm=s=>String(s||'').replace(/[İIı]/g,'i').toLowerCase().replace(/\s+/g,' ').trim();
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function scan(){
  if(!fs.existsSync(DIR))return[];
  return fs.readdirSync(DIR,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>({name:d.name,
    files:fs.readdirSync(path.join(DIR,d.name)).filter(f=>EXT.test(f)).map(f=>path.join(DIR,d.name,f))})).filter(f=>f.files.length);
}
function info(){const f=scan();return{folders:f.length,min:f.length?Math.min(...f.map(x=>x.files.length)):0}}
app.use(express.static(path.join(__dirname,'public')));
app.get('/img/:r/:i',(req,res)=>{const r=rooms.get(req.params.r),f=r&&r.images[req.params.i];if(!f)return res.sendStatus(404);res.sendFile(f.file)});

const list=()=>io.emit('rooms',[...rooms.values()].map(r=>({id:r.id,name:r.name,locked:!!r.password,count:r.players.size,max:r.max,state:r.state,owner:r.players.get(r.owner)?.name})));
const elig=(r,p)=>r.state!=='playing'||p.done;
function toChat(r,evt,data,exceptId){r.players.forEach((p,id)=>{if(elig(r,p)&&id!==exceptId)io.to(id).emit(evt,data)})}
const sys=(r,text)=>toChat(r,'chat',{sys:true,text,t:Date.now()});
function sendRoom(r){io.to(r.id).emit('room',{id:r.id,name:r.name,state:r.state,owner:r.owner,max:r.max,per:r.per,total:r.total||0,
  players:[...r.players].map(([id,p])=>({id,name:p.name,done:p.done,answered:Object.keys(p.answers).length}))})}
function leave(sock){
  const r=rooms.get(sock.data.room);if(!r)return;
  sock.leave(r.id);sock.data.room=null;
  const p=r.players.get(sock.id);r.players.delete(sock.id);
  if(!r.players.size){rooms.delete(r.id);return list()}
  if(r.owner===sock.id)r.owner=r.players.keys().next().value;
  sys(r,`${p.name} odadan ayrıldı`);sendRoom(r);list();
}
function enter(sock,r){
  leave(sock);
  r.players.set(sock.id,{name:sock.data.name,order:[],answers:{},done:false});
  sock.join(r.id);sock.data.room=r.id;
  sys(r,`${sock.data.name} odaya katıldı`);sendRoom(r);list();
}
io.on('connection',sock=>{
  const my=()=>rooms.get(sock.data.room);
  sock.on('setName',(n,cb)=>{n=String(n||'').trim().slice(0,20);if(!n)return cb({ok:false,error:'İsim zorunlu!'});sock.data.name=n;cb({ok:true,info:info()});sock.emit('rooms',[]);list()});
  sock.on('create',(o,cb)=>{
    if(!sock.data.name)return cb({ok:false,error:'Önce isim gir.'});
    const inf=info();if(!inf.folders)return cb({ok:false,error:'fotograflar klasöründe içinde fotoğraf olan klasör yok!'});
    const r={id:rid(),name:String(o.name||'').trim().slice(0,30)||`${sock.data.name} odası`,password:String(o.password||'').slice(0,30),
      max:Math.min(30,Math.max(1,+o.max||8)),per:Math.min(inf.min,Math.max(1,+o.per||3)),owner:sock.id,players:new Map(),state:'lobby',images:{}};
    rooms.set(r.id,r);enter(sock,r);cb({ok:true});
  });
  sock.on('join',({id,password},cb)=>{
    const r=rooms.get(id);if(!sock.data.name)return cb({ok:false,error:'Önce isim gir.'});
    if(!r)return cb({ok:false,error:'Oda bulunamadı.'});
    if(r.state!=='lobby')return cb({ok:false,error:'Oyun başlamış.'});
    if(r.players.size>=r.max)return cb({ok:false,error:'Oda dolu.'});
    if(r.password&&r.password!==password)return cb({ok:false,error:'Şifre yanlış!'});
    enter(sock,r);cb({ok:true});
  });
  sock.on('leave',()=>leave(sock));
  sock.on('start',cb=>{
    const r=my();if(!r||r.owner!==sock.id||r.state!=='lobby')return;
    const f=scan(),per=f.length?Math.min(r.per,...f.map(x=>x.files.length)):0;
    if(!per)return cb&&cb({ok:false,error:'Fotoğraf klasörleri boş!'});
    r.images={};
    f.forEach(d=>shuffle([...d.files]).slice(0,per).forEach(file=>{r.images[rid()+rid()]={file,owner:d.name}}));
    r.total=Object.keys(r.images).length;r.state='playing';
    r.players.forEach((p,id)=>{p.answers={};p.done=false;p.order=shuffle(Object.keys(r.images));io.to(id).emit('game',{order:p.order})});
    sendRoom(r);list();
  });
  sock.on('answer',({img,text})=>{const r=my(),p=r&&r.players.get(sock.id);if(r&&r.state==='playing'&&p&&!p.done&&r.images[img])p.answers[img]=String(text||'').slice(0,40)});
  sock.on('finish',()=>{const r=my(),p=r&&r.players.get(sock.id);if(!p||r.state!=='playing'||p.done)return;
    p.done=true;sendRoom(r);toChat(r,'chat',{sys:true,text:`✅ ${p.name} bitirdi`,t:Date.now()})});
  sock.on('reveal',()=>{const r=my();if(!r||r.owner!==sock.id||r.state!=='playing')return;
    if(![...r.players.values()].every(p=>p.done))return;
    r.state='results';
    const players=[...r.players].map(([id,p])=>{const items=p.order.map(i=>{const g=p.answers[i]||'',o=r.images[i].owner;return{img:i,guess:g,ok:norm(g)===norm(o),owner:o}});
      return{id,name:p.name,score:items.filter(x=>x.ok).length,total:items.length,items}});
    io.to(r.id).emit('results',{players});sendRoom(r);list();});
  sock.on('again',()=>{const r=my();if(!r||r.owner!==sock.id||r.state!=='results')return;
    r.state='lobby';r.images={};r.total=0;r.players.forEach(p=>{p.answers={};p.done=false;p.order=[]});sys(r,'🔁 Oda yeniden başlatıldı');sendRoom(r);list()});
  sock.on('chat',text=>{const r=my(),p=r&&r.players.get(sock.id);text=String(text||'').trim().slice(0,500);
    if(!p||!text||!elig(r,p))return;toChat(r,'chat',{sid:sock.id,name:p.name,text,t:Date.now()})});
  sock.on('typing',()=>{const r=my(),p=r&&r.players.get(sock.id);if(p&&elig(r,p))toChat(r,'typing',p.name,sock.id)});
  sock.on('disconnect',()=>leave(sock));
});
const port=process.env.PORT||3000;
server.listen(port,()=>{
  console.log(`\nSite açık: http://localhost:${port}`);
  Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal).forEach(i=>console.log(`Aynı Wi-Fi'daki arkadaşlar için: http://${i.address}:${port}`));
});
