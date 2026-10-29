const s=io(),$=q=>document.querySelector(q);
let cur='login',room=null,game=null,res=null,tab=null,me='',inf={min:3},typT;
const V=['login','home','room','game','wait','results'];
function show(v){cur=v;V.forEach(x=>$('#v-'+x).hidden=x!==v);const sl=$('#v-'+v+' .chatslot');
  if(sl){sl.appendChild($('#chat'));$('#chat').hidden=false}else $('#chat').hidden=true}
function toast(t){const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(e.t);e.t=setTimeout(()=>e.style.display='none',2500)}
const isOwner=()=>room&&room.owner===s.id;
function chip(p){return`<span class="chip">${p.id===room.owner?'👑 ':''}${esc(p.name)}${room.state==='playing'?(p.done?' ✅':` (${p.answered}/${room.total})`):''}</span>`}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// giriş
$('#nameIn').value=localStorage.ad||'';
const login=()=>{const n=$('#nameIn').value.trim();if(!n)return toast('İsim yazmak zorunlu!');
  s.emit('setName',n,r=>{if(!r.ok)return toast(r.error);me=n;localStorage.ad=n;inf=r.info;$('#me').textContent='👤 '+n;
    $('#info').textContent=r.info.folders?`📁 ${r.info.folders} kişi klasörü bulundu (her birinde en az ${r.info.min} foto)`:'⚠️ fotograflar klasöründe kişi klasörü yok!';
    $('#rPer').max=r.info.min;$('#rPer').value=Math.min(3,r.info.min||1);show('home')})};
$('#nameBtn').onclick=login;$('#nameIn').onkeydown=e=>e.key==='Enter'&&login();
s.on('disconnect',()=>{toast('Bağlantı koptu...');});
s.on('connect',()=>{if(me)login()});

// odalar
$('#createBtn').onclick=()=>s.emit('create',{name:$('#rName').value,password:$('#rPass').value,max:$('#rMax').value,per:$('#rPer').value},r=>{if(!r.ok)return toast(r.error);$('#msgs').innerHTML='';show('room')});
s.on('rooms',l=>{const d=$('#rooms');d.innerHTML=l.length?'':'<p class="muted">Henüz oda yok. İlk odayı sen oluştur!</p>';
  l.forEach(r=>{const e=document.createElement('div');e.className='room';
    e.innerHTML=`<div><b>${r.locked?'🔒 ':''}${esc(r.name)}</b><br><span class="muted">${r.count}/${r.max} kişi · ${r.state==='lobby'?'Bekliyor':'Oyunda'} · 👑 ${esc(r.owner||'')}</span></div>`;
    const b=document.createElement('button');b.textContent='Katıl';b.disabled=r.state!=='lobby'||r.count>=r.max;
    b.onclick=()=>{const password=r.locked?prompt('Oda şifresi:'):'';if(r.locked&&password===null)return;
      s.emit('join',{id:r.id,password},x=>{if(!x.ok)return toast(x.error);$('#msgs').innerHTML='';show('room')})};
    e.appendChild(b);d.appendChild(e)})});
const leave=()=>{s.emit('leave');room=null;show('home')};$('#leaveBtn').onclick=leave;$('#leave2').onclick=leave;

// oda
s.on('room',r=>{room=r;
  if(cur==='room'||cur==='wait'||cur==='results'){if(r.state==='lobby'&&cur!=='room')show('room')}
  if(cur==='room'){$('#rTitle').textContent=r.name;$('#rSub').textContent=`${r.players.length}/${r.max} kişi · her klasörden ${r.per} foto alınır`;
    $('#rPlayers').innerHTML=r.players.map(chip).join('');$('#startBtn').hidden=!isOwner();$('#rWait').textContent=isOwner()?'':'Oda sahibinin oyunu başlatması bekleniyor...'}
  if(cur==='wait')renderWait()});
$('#startBtn').onclick=()=>s.emit('start',r=>r&&!r.ok&&toast(r.error));

// oyun
s.on('game',g=>{game={order:g.order,i:0};show('game');q()});
function q(){const id=game.order[game.i],last=game.i===game.order.length-1;
  $('#gImg').src=`/img/${room.id}/${id}`;$('#gProg').textContent=`${game.i+1} / ${game.order.length}`;
  $('#gBar').style.width=(game.i/game.order.length*100)+'%';$('#gIn').value='';$('#gIn').focus();
  $('#gBtn').textContent=last?'Sonuçları göster':'Devam →';
  if(!last)new Image().src=`/img/${room.id}/${game.order[game.i+1]}`}
function next(){const t=$('#gIn').value.trim();if(!t)return toast('Bir isim yazmalısın!');
  s.emit('answer',{img:game.order[game.i],text:t});
  if(game.i===game.order.length-1){s.emit('finish');show('wait');renderWait()}else{game.i++;q()}}
$('#gBtn').onclick=next;$('#gIn').onkeydown=e=>e.key==='Enter'&&next();
function renderWait(){if(!room)return;const d=room.players.filter(p=>p.done).length,all=d===room.players.length;
  $('#wTitle').textContent=all?'🎉 Herkes bitirdi!':`⏳ Diğer oyuncular bekleniyor (${d}/${room.players.length} bitirdi)`;
  $('#wPlayers').innerHTML=room.players.map(chip).join('');
  $('#revealBtn').hidden=!isOwner();$('#revealBtn').disabled=!all;
  if(all&&!isOwner())$('#wTitle').textContent='🎉 Herkes bitirdi! Oda sahibi sonuçları açacak...'}
$('#revealBtn').onclick=()=>s.emit('reveal');

// sonuçlar
s.on('results',r=>{res=r;tab=s.id;show('results');
  $('#scores').innerHTML=[...r.players].sort((a,b)=>b.score-a.score).map(p=>`<span class="chip">${esc(p.name)}: <b>${p.score}/${p.total}</b></span>`).join('');
  $('#againBtn').hidden=!isOwner();renderRes()});
function renderRes(){const ps=[...res.players].sort((a,b)=>(a.id===s.id?-1:b.id===s.id?1:0));
  $('#tabs').innerHTML='';ps.forEach(p=>{const b=document.createElement('button');b.textContent=(p.id===s.id?'Benim ':'')+p.name;b.className=p.id===tab?'on':'';b.onclick=()=>{tab=p.id;renderRes()};$('#tabs').appendChild(b)});
  const p=res.players.find(x=>x.id===tab)||ps[0];
  $('#items').innerHTML=p.items.map(it=>`<div class="item ${it.ok?'ok':'bad'}"><img src="/img/${room.id}/${it.img}"><div>${it.ok?'✅':'❌'} <b>${esc(it.guess||'(boş)')}</b>${it.ok?'':`<br>Doğrusu: <b>${esc(it.owner)}</b>`}</div></div>`).join('')}
$('#againBtn').onclick=()=>s.emit('again');

// sohbet
function add(m){const d=document.createElement('div'),t=new Date(m.t).toTimeString().slice(0,5);
  if(m.sys){d.className='msg sys';d.textContent=m.text}
  else{d.className='msg'+(m.sid===s.id?' me':'');const b=document.createElement('b');b.textContent=m.name;
    if(m.sid!==s.id){let h=0;for(const c of m.name)h=(h*31+c.charCodeAt(0))%360;b.style.color=`hsl(${h} 70% 60%)`}
    const x=document.createElement('span');x.textContent=m.text;const tm=document.createElement('small');tm.textContent=t;
    if(m.sid!==s.id)d.appendChild(b);d.append(x,tm)}
  $('#msgs').appendChild(d);$('#msgs').scrollTop=1e9}
s.on('chat',add);
s.on('typing',n=>{$('#typ').textContent=n+' yazıyor...';clearTimeout(typT);typT=setTimeout(()=>$('#typ').textContent='',2000)});
const send=()=>{const t=$('#cIn').value.trim();if(t){s.emit('chat',t);$('#cIn').value=''}};
$('#cBtn').onclick=send;$('#cIn').onkeydown=e=>e.key==='Enter'&&send();
let lt=0;$('#cIn').oninput=()=>{if(Date.now()-lt>1200){lt=Date.now();s.emit('typing')}};
['😂','😭','🔥','👀','💀','❤️','👍','🤔'].forEach(e=>{const b=document.createElement('button');b.textContent=e;b.onclick=()=>{$('#cIn').value+=e;$('#cIn').focus()};$('#emo').appendChild(b)});
show('login');
