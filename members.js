(function(){
var $=function(i){return document.getElementById(i)},ME=null,books=[],cur="",R={};
var STL={reading:"Reading now",want:"Want to read",done:"Finished"};
function esc(s){var d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML}
function api(m,u,b){return fetch(u,{method:m,headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined,credentials:"same-origin"}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||"Request failed");return j})})}
function when(x){return new Date(x).toLocaleDateString()}
function av(u,n,s){s=s||40;return u?'<img class="av" style="width:'+s+'px;height:'+s+'px" src="'+esc(u)+'" alt="">':'<span class="av" style="width:'+s+'px;height:'+s+'px;font-size:'+Math.round(s*.42)+'px">'+esc((n||"?").charAt(0).toUpperCase())+'</span>'}
function mv(h){$("memView").innerHTML=h}
function ST(sel){return Object.keys(STL).map(function(k){return'<option value="'+k+'"'+(sel===k?" selected":"")+'>'+STL[k]+'</option>'}).join("")}
function modal(h){var m=$("xM");if(!m){m=document.createElement("div");m.id="xM";m.className="bd";m.onclick=function(e){if(e.target===m||e.target.hasAttribute("data-x"))m.classList.remove("show")};document.body.appendChild(m)}m.innerHTML='<div class="md">'+h+'</div>';m.classList.add("show");return m}
function sq(file,s){return new Promise(function(res,rej){var im=new Image(),u=URL.createObjectURL(file);im.onload=function(){var c=document.createElement("canvas");c.width=c.height=s;var m=Math.min(im.width,im.height);c.getContext("2d").drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,s,s);URL.revokeObjectURL(u);res(c.toDataURL("image/jpeg",.8))};im.onerror=function(){rej(new Error("Could not read that image."))};im.src=u})}

function auth(mode,tok){
  var T={login:"Sign in",reg:"Create student account",fg:"Forgot password",rs:"Choose a new password"},B={login:"Sign in",reg:"Create account",fg:"Send reset link",rs:"Save password"};
  var h='<h2>'+T[mode]+'</h2>';
  if(mode==="reg")h+='<label>Full name</label><input id="a_n" autocomplete="name"><label>Grade &amp; section</label><input id="a_s" placeholder="e.g. Grade 9 – Rizal">';
  if(mode!=="rs")h+='<label>Email</label><input id="a_e" type="email" autocomplete="email" placeholder="you@gmail.com">';
  if(mode!=="fg")h+='<label>'+(mode==="rs"?"New password":"Password")+(mode==="login"?"":" (8+ characters)")+'</label><input id="a_p" type="password" autocomplete="'+(mode==="login"?"current-password":"new-password")+'">';
  h+='<p class="err" id="a_m"></p><div class="ma"><button class="btn o" data-x>Cancel</button><button class="btn" id="a_go">'+B[mode]+'</button></div><p class="mute" style="margin:12px 0 0">'+(mode==="login"?'<a href="#" data-m="fg">Forgot password?</a> · <a href="#" data-m="reg">Create student account</a>':'<a href="#" data-m="login">Back to sign in</a>')+'</p>';
  var m=modal(h);
  m.querySelectorAll("[data-m]").forEach(function(a){a.onclick=function(e){e.preventDefault();auth(a.getAttribute("data-m"))}});
  m.querySelectorAll("input").forEach(function(i){i.onkeydown=function(e){if(e.key==="Enter")$("a_go").click()}});
  $("a_go").onclick=async function(){
    var e=$("a_e")&&$("a_e").value,p=$("a_p")&&$("a_p").value,msg=$("a_m");msg.className="err";msg.textContent="";
    try{
      if(mode==="login"){await api("POST","/api/login",{email:e,password:p});location.reload()}
      else if(mode==="reg"){await api("POST","/api/register",{email:e,password:p,name:$("a_n").value,section:$("a_s").value});location.reload()}
      else if(mode==="fg"){await api("POST","/api/forgot",{email:e});msg.className="mute";msg.textContent="If that email has an account, a reset link is on its way. Check your inbox and spam folder."}
      else{await api("POST","/api/reset",{token:tok,password:p});history.replaceState(null,"","/");auth("login");$("a_m").className="mute";$("a_m").textContent="Password updated. Please sign in."}
    }catch(x){msg.textContent=x.message}
  };
}

var NAV=[["cat","Catalog"],["reading","My reading"],["community","Community"],["profile","My profile"],["feedback","Feedback"]],ADM=[["members","Members"],["inbox","Feedback inbox"]];
function nav(){var n=$("mnav");n.innerHTML=NAV.concat(ME.role==="admin"?ADM:[]).map(function(x){return'<button class="btn '+(cur===x[0]?"on":"s")+'" data-v="'+x[0]+'">'+x[1]+'</button>'}).join("");n.classList.remove("hid")}
async function show(v){cur=v;nav();if(v==="cat"){window.setTab("cat");return}
  $("catView").classList.add("hid");$("loanView").classList.add("hid");$("memView").classList.remove("hid");mv('<p class="mute">Loading…</p>');
  try{await R[v]()}catch(e){mv('<p class="err">'+esc(e.message)+'</p>')}}

function card(r){var d=r.data,pct=d.pages?Math.min(100,Math.round((d.page||0)/d.pages*100)):0,b=books.find(function(x){return String(x.id)===String(d.bookId)});
  return'<div class="panel" data-id="'+r.id+'"><b>'+esc(d.title)+'</b> '+(b?'<span class="tag sh">Shelf '+esc(b.shelf)+'</span>':"")+'<div style="background:var(--soft);border-radius:99px;height:8px;margin:8px 0"><div style="width:'+pct+'%;height:8px;border-radius:99px;background:var(--gold)"></div></div><small class="mute">'+(d.pages?"Page "+(d.page||0)+" of "+d.pages+" · "+pct+"%":"Page "+(d.page||0))+(d.place?" · "+esc(d.place):"")+'</small><div class="fg"><div><label>Status</label><select data-f="status">'+ST(d.status)+'</select></div><div><label>Page</label><input data-f="page" type="number" min="0" value="'+(d.page||0)+'"></div><div class="f"><label>Where I stopped</label><input data-f="place" value="'+esc(d.place||"")+'"></div></div><div class="ma"><button class="btn o sm" data-a="rdel">Remove</button><button class="btn sm" data-a="rsave">Save</button></div></div>'}
R.reading=async function(){var rs=await api("GET","/api/reading");
  var opts='<option value="">— Other book (type below) —</option>'+books.map(function(b){return'<option value="'+esc(b.id)+'">'+esc(b.title)+' (Shelf '+esc(b.shelf)+')</option>'}).join("");
  mv('<div class="panel"><b>Add a book</b><div class="fg"><div class="f"><label>From the library catalog</label><select id="r_b">'+opts+'</select></div><div class="f"><label>Or type the title</label><input id="r_t"></div><div><label>Status</label><select id="r_s">'+ST("reading")+'</select></div><div><label>Total pages</label><input id="r_pg" type="number" min="0"></div><div><label>Page I’m on</label><input id="r_p" type="number" min="0"></div><div><label>Where I stopped</label><input id="r_pl" placeholder="e.g. Chapter 4"></div></div><div class="ma"><button class="btn" data-a="radd">Add</button></div></div>'+(rs.length?rs.map(card).join(""):'<p class="mute">Nothing here yet. Add the book you’re reading now.</p>'))};
R.community=async function(){var d=await Promise.all([api("GET","/api/posts"),api("GET","/api/members")]),ps=d[0],ms=d[1];
  mv('<div class="panel"><b>Share with the community</b><textarea id="p_b" maxlength="500" placeholder="Recommend a book or share what you’re reading…"></textarea><div class="ma"><button class="btn" data-a="post">Post</button></div></div>'+
  (ps.length?ps.map(function(p){return'<div class="panel" data-id="'+p.id+'"><div style="display:flex;gap:10px;align-items:center;cursor:pointer" data-u="'+p.user_id+'">'+av(p.avatar,p.name)+'<div><b>'+esc(p.name)+'</b><br><small class="mute">'+esc(p.section||"")+' · '+when(p.created)+'</small></div></div><p style="white-space:pre-wrap;margin:8px 0 0">'+esc(p.body)+'</p>'+((p.user_id===ME.id||ME.role==="admin")?'<div class="ma"><button class="btn o sm" data-a="pdel">Delete</button></div>':"")+'</div>'}).join(""):'<p class="mute">No posts yet. Be the first!</p>')+
  '<h3>Students</h3><div class="grid">'+ms.map(function(m){return'<div class="bk" data-u="'+m.id+'" style="cursor:pointer;align-items:center;text-align:center">'+av(m.avatar,m.name,64)+'<h3>'+esc(m.name)+'</h3><span class="a">'+esc(m.section||"")+'</span></div>'}).join("")+'</div>')};
async function prof(id){try{var d=await api("GET","/api/members/"+id),u=d.user;
  modal('<div style="text-align:center">'+av(u.avatar,u.name,96)+'<h2>'+esc(u.name)+'</h2><p class="mute">'+esc(u.section||"")+'</p></div><p>'+esc(u.bio||"")+'</p><b>Reading</b>'+(d.reading.length?d.reading.map(function(r){return'<div class="row"><span>'+esc(r.title)+'</span><small>'+esc(STL[r.status]||"")+(r.pages?" · "+Math.min(100,Math.round((r.page||0)/r.pages*100))+"%":"")+'</small></div>'}).join(""):'<p class="mute">No books shared yet.</p>')+'<div class="ma"><button class="btn o" data-x>Close</button></div>')}catch(e){alert("This profile isn’t available.")}}
R.profile=async function(){mv('<div class="panel"><div style="display:flex;gap:12px;align-items:center">'+av(ME.avatar,ME.name,72)+'<div><b>'+esc(ME.email)+'</b><br><small class="mute">Only you can see your email.</small></div></div><label>Profile picture</label><input id="u_f" type="file" accept="image/*"><div class="fg"><div><label>Name</label><input id="u_n" value="'+esc(ME.name)+'"></div><div><label>Grade &amp; section</label><input id="u_s" value="'+esc(ME.section||"")+'"></div><div class="f"><label>About me</label><textarea id="u_b" maxlength="300">'+esc(ME.bio||"")+'</textarea></div></div><label><input type="checkbox" id="u_v" style="width:auto" '+(ME.public?"checked":"")+'> Show my profile to other students</label><p class="err" id="u_m"></p><div class="ma"><button class="btn" data-a="psave">Save profile</button></div></div><div class="panel"><b>Change password</b><label>Current password</label><input id="c_o" type="password" autocomplete="current-password"><label>New password (8+ characters)</label><input id="c_n" type="password" autocomplete="new-password"><p class="err" id="c_m"></p><div class="ma"><button class="btn o" data-a="out">Sign out</button><button class="btn s" data-a="pw">Update password</button></div></div>')};
R.feedback=async function(){var fs=await api("GET","/api/feedback");
  mv('<div class="panel"><b>Send feedback to the library administrators</b><textarea id="fb" maxlength="1000" placeholder="Suggest a book, report a problem, or tell us how we’re doing…"></textarea><div class="ma"><button class="btn" data-a="fb">Send</button></div></div>'+fs.map(function(f){return'<div class="panel"><small class="mute">'+when(f.created)+' · '+(f.status==="resolved"?"Resolved":"Sent")+'</small><p style="margin:6px 0">'+esc(f.message)+'</p>'+(f.reply?'<p style="border-left:3px solid var(--gold);padding-left:10px;margin:6px 0"><b>Admin reply:</b> '+esc(f.reply)+'</p>':"")+'</div>'}).join(""))};
R.inbox=async function(){var fs=await api("GET","/api/feedback");
  mv(fs.length?fs.map(function(f){return'<div class="panel" data-id="'+f.id+'"><b>'+esc(f.name)+'</b> <small class="mute">'+esc(f.email)+' · '+when(f.created)+' · '+esc(f.status)+'</small><p>'+esc(f.message)+'</p><textarea data-f="reply" maxlength="1000" placeholder="Write a reply…">'+esc(f.reply||"")+'</textarea><div class="ma"><button class="btn sm" data-a="fre">Send reply &amp; resolve</button></div></div>'}).join(""):'<p class="mute">No feedback yet.</p>')};
R.members=async function(){var ms=await api("GET","/api/admin/members");
  mv('<div class="panel"><b>All accounts ('+ms.length+')</b>'+ms.map(function(m){return'<div class="row" data-id="'+m.id+'"><div style="display:flex;gap:10px;align-items:center">'+av(m.avatar,m.name)+'<div><b>'+esc(m.name)+'</b> <small class="mute">'+esc(m.role)+'</small><br><small class="mute">'+esc(m.email)+' · '+esc(m.section||"")+(m.status!=="active"?" · SUSPENDED":"")+'</small></div></div>'+(m.role==="admin"?"":'<button class="btn o sm" data-a="sus" data-s="'+(m.status==="active"?"suspended":"active")+'">'+(m.status==="active"?"Suspend":"Reactivate")+'</button>')+'</div>'}).join("")+'</div>')};

document.addEventListener("click",async function(e){
  var mvw=$("memView");if(!mvw||!mvw.contains(e.target))return;
  var t=e.target,u=t.closest("[data-u]"),a=t.getAttribute("data-a");
  if(u&&!a){prof(u.getAttribute("data-u"));return}
  if(!a)return;var box=t.closest("[data-id]"),id=box&&box.getAttribute("data-id");
  try{
    if(a==="radd"){var bid=$("r_b").value,bk=books.find(function(x){return String(x.id)===bid}),title=bk?bk.title:$("r_t").value.trim();if(!title)throw new Error("Choose a book or type a title.");
      await api("POST","/api/reading",{title:title,bookId:bid,status:$("r_s").value,pages:$("r_pg").value,page:$("r_p").value,place:$("r_pl").value});show("reading")}
    else if(a==="rsave"){var f={};box.querySelectorAll("[data-f]").forEach(function(i){f[i.getAttribute("data-f")]=i.value});await api("PATCH","/api/reading/"+id,f);show("reading")}
    else if(a==="rdel"){if(confirm("Remove this book from your list?")){await api("DELETE","/api/reading/"+id);show("reading")}}
    else if(a==="post"){await api("POST","/api/posts",{body:$("p_b").value});show("community")}
    else if(a==="pdel"){if(confirm("Delete this post?")){await api("DELETE","/api/posts/"+id);show("community")}}
    else if(a==="fb"){await api("POST","/api/feedback",{message:$("fb").value});show("feedback")}
    else if(a==="fre"){await api("PATCH","/api/feedback/"+id,{reply:box.querySelector("[data-f=reply]").value,status:"resolved"});show("inbox")}
    else if(a==="sus"){await api("PATCH","/api/admin/members/"+id,{status:t.getAttribute("data-s")});show("members")}
    else if(a==="out"){await api("POST","/api/logout");location.reload()}
    else if(a==="psave"){var b={name:$("u_n").value,section:$("u_s").value,bio:$("u_b").value,public:$("u_v").checked},fl=$("u_f").files[0];if(fl)b.avatar=await sq(fl,160);
      await api("PATCH","/api/profile",b);ME=(await api("GET","/api/me")).user;window.ME=ME;$("who").textContent=ME.role==="admin"?"Admin":ME.name.split(" ")[0];show("profile")}
    else if(a==="pw"){var m=$("c_m");m.className="err";m.textContent="";await api("POST","/api/password",{current:$("c_o").value,next:$("c_n").value});m.className="mute";m.textContent="Password updated.";$("c_o").value=$("c_n").value=""}
  }catch(x){var el=$("u_m")||$("c_m");if(a==="pw"&&$("c_m"))$("c_m").textContent=x.message;else alert(x.message)}
});

window.Members={
  init:async function(me){ME=me;
    try{books=(await api("GET","/api/books")).map(function(r){var x=r.data;x.id=r.id;return x})}catch(e){books=[]}
    $("who").onclick=function(){if(ME)show("profile");else auth("login")};
    var tk=new URLSearchParams(location.search).get("reset");if(tk)auth("rs",tk);
    if(ME){nav();$("mnav").onclick=function(e){var v=e.target.getAttribute("data-v");if(v)show(v)}}},
  mark:function(t){if(ME){cur=t;nav()}}
};
})();
