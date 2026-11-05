const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const sha=async s=>hex(await crypto.subtle.digest("SHA-256",enc.encode(s)));
const eqs=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
async function hmac(secret,s){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",k,enc.encode(s)))}
async function pbk(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},k,256))}
async function hash(pw){const s=hex(crypto.getRandomValues(new Uint8Array(16)));return s+":"+await pbk(pw,s)}
async function check(pw,h){const [s,k]=String(h).split(":");return !!k&&eqs(await pbk(pw,s),k)}

const PROMPT="You are a school library cataloguing assistant. Look at the attached photo of a book (cover, back cover or title page) and extract catalog data. Reply with ONLY a JSON object, no markdown, with string keys: title, author (comma-separated), genre (a standard library subject such as \"Filipiniana\", \"Science\" or \"Fiction\"), isbn (digits only if visible, else \"\"), dewey (best-guess Dewey Decimal number, else \"\"), publisher, year, summary (one or two neutral sentences), confidence (\"high\", \"medium\" or \"low\"). Use \"\" for anything you cannot read or reliably know. Never invent an ISBN.";
const J=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","cache-control":"no-store",...h}});
const bad=m=>J({error:m},400);
const OK=()=>J({ok:true});
const many=()=>J({error:"Too many attempts. Try again in 15 minutes."},429);
const lc=s=>String(s||"").trim().toLowerCase();
const adminEmail=e=>lc(e.ADMIN_EMAIL);
const cookie=async(env,id)=>{const exp=String(Date.now()+12*36e5);return `sid=${id}.${exp}.${await hmac(env.SESSION_SECRET,id+"."+exp)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`};
const parse=r=>({id:r.id,data:JSON.parse(r.data)});

async function lim(c,k,max){
  const key=k+":"+c.ip,now=Date.now(),r=await c.env.DB.prepare("SELECT n,at FROM hits WHERE k=?").bind(key).first();
  let n=1,at=now;if(r&&now-r.at<9e5){n=r.n+1;at=r.at}
  await c.env.DB.prepare("INSERT INTO hits(k,n,at) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n,at=excluded.at").bind(key,n,at).run();
  return n>max}
async function mail(env,to,subject,html){
  if(!env.BREVO_API_KEY||!env.MAIL_FROM){console.log("[email not configured] To:",to,"|",subject,"|",html.replace(/<[^>]+>/g," "));return}
  const x=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":env.BREVO_API_KEY,"content-type":"application/json"},body:JSON.stringify({sender:{name:"Santolan Library",email:env.MAIL_FROM},to:[{email:to}],subject,htmlContent:html})});
  if(!x.ok)console.error("Mail failed",x.status,await x.text())}
async function loadUser(c){
  const m=/(?:^|; )sid=([^;]+)/.exec(c.q.headers.get("cookie")||"");if(!m||!c.env.SESSION_SECRET)return null;
  const [id,exp,sig]=m[1].split(".");
  if(!sig||!/^\d+$/.test(id)||Number(exp)<=Date.now()||!eqs(sig,await hmac(c.env.SESSION_SECRET,id+"."+exp)))return null;
  const u=await c.env.DB.prepare("SELECT id,email,name,section,bio,avatar,role,status,public FROM users WHERE id=?").bind(Number(id)).first();
  if(!u||u.status!=="active")return null;u.public=!!u.public;return u}

const R=[];const add=(m,p,f,o)=>R.push({m,re:new RegExp("^"+p.replace(/:(\w+)/g,"(?<$1>[^/]+)")+"$"),f,o:o||""});
const DB=c=>c.env.DB;

/* accounts */
add("GET","/api/me",async c=>J({user:c.u?{...c.u,status:undefined}:null}));
add("POST","/api/register",async c=>{
  if(await lim(c,"reg",20))return many();
  const b=c.b,em=lc(b.email),nm=String(b.name||"").trim().slice(0,60),pw=String(b.password||"");
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)||em.length>120||em===adminEmail(c.env))return bad("Enter a valid email address.");
  if(pw.length<8)return bad("Password must be at least 8 characters.");
  if(!nm)return bad("Enter your name.");
  try{const r=await DB(c).prepare("INSERT INTO users(email,name,section,pass) VALUES(?,?,?,?)").bind(em,nm,String(b.section||"").trim().slice(0,40),await hash(pw)).run();
    return J({ok:true},200,{"Set-Cookie":await cookie(c.env,r.meta.last_row_id)})}
  catch(e){if(/UNIQUE/i.test(String(e.message)))return bad("That email already has an account. Sign in or use “Forgot password”.");throw e}});
add("POST","/api/login",async c=>{
  if(await lim(c,"login",15))return many();
  const em=lc(c.b.email),pw=String(c.b.password||""),deny=()=>J({error:"Incorrect email or password."},401);let id;
  if(em&&em===adminEmail(c.env)){
    if(!c.env.ADMIN_PASSWORD||!eqs(await sha(pw),await sha(String(c.env.ADMIN_PASSWORD))))return deny();
    await DB(c).prepare("UPDATE users SET role='student' WHERE role='admin' AND email<>?").bind(em).run();
    await DB(c).prepare("INSERT INTO users(email,name,role,pass) VALUES(?,'Library Admin','admin','-') ON CONFLICT(email) DO UPDATE SET role='admin',status='active'").bind(em).run();
    id=(await DB(c).prepare("SELECT id FROM users WHERE email=?").bind(em).first()).id;
  }else{
    const u=await DB(c).prepare("SELECT id,pass,status,role FROM users WHERE email=?").bind(em).first();
    if(!u||u.status!=="active"||u.role==="admin"||!(await check(pw,u.pass)))return deny();id=u.id}
  return J({ok:true},200,{"Set-Cookie":await cookie(c.env,id)})});
add("POST","/api/logout",async()=>J({ok:true},200,{"Set-Cookie":"sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"}));
add("POST","/api/forgot",async c=>{
  if(await lim(c,"fg",8))return many();
  try{const em=lc(c.b.email),u=await DB(c).prepare("SELECT id,name FROM users WHERE email=? AND status='active' AND role='student'").bind(em).first();
    if(u){const tok=hex(crypto.getRandomValues(new Uint8Array(32)));
      await DB(c).prepare("INSERT INTO resets(token,user_id,exp) VALUES(?,?,?)").bind(await sha(tok),u.id,Date.now()+36e5).run();
      await mail(c.env,em,"Reset your Santolan Library password",`<p>Hi ${u.name.replace(/[<>&"]/g,"")},</p><p>Click the link below to choose a new password. It works for one hour.</p><p><a href="${c.env.BASE_URL||c.url.origin}/?reset=${tok}">Reset my password</a></p><p>If you didn’t ask for this, you can ignore this email.</p>`)}
  }catch(e){console.error(e)}
  return OK()});
add("POST","/api/reset",async c=>{
  if(await lim(c,"rs",15))return many();
  const pw=String(c.b.password||"");if(pw.length<8)return bad("Password must be at least 8 characters.");
  const t=await DB(c).prepare("SELECT user_id FROM resets WHERE token=? AND exp>?").bind(await sha(String(c.b.token||"")),Date.now()).first();
  if(!t)return bad("This reset link is invalid or has expired. Please request a new one.");
  await DB(c).prepare("UPDATE users SET pass=? WHERE id=? AND role='student'").bind(await hash(pw),t.user_id).run();
  await DB(c).prepare("DELETE FROM resets WHERE user_id=?").bind(t.user_id).run();return OK()});
add("PATCH","/api/profile",async c=>{
  const b=c.b,nm=String(b.name||"").trim().slice(0,60);if(!nm)return bad("Enter your name.");
  let av=c.u.avatar;if("avatar" in b){if(typeof b.avatar==="string"&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(b.avatar)&&b.avatar.length<150000)av=b.avatar;else return bad("Bad picture.")}
  await DB(c).prepare("UPDATE users SET name=?,section=?,bio=?,avatar=?,public=? WHERE id=?").bind(nm,String(b.section||"").trim().slice(0,40),String(b.bio||"").slice(0,300),av,b.public!==false?1:0,c.u.id).run();return OK()},"u");
add("POST","/api/password",async c=>{
  if(await lim(c,"pw",10))return many();
  if(c.u.role==="admin")return bad("The admin password is changed in the Cloudflare settings.");
  const u=await DB(c).prepare("SELECT pass FROM users WHERE id=?").bind(c.u.id).first();
  if(!(await check(String(c.b.current||""),u.pass)))return bad("Your current password is incorrect.");
  if(String(c.b.next||"").length<8)return bad("New password must be at least 8 characters.");
  await DB(c).prepare("UPDATE users SET pass=? WHERE id=?").bind(await hash(String(c.b.next)),c.u.id).run();return OK()},"u");

/* community */
add("GET","/api/members",async c=>J((await DB(c).prepare("SELECT id,name,section,avatar FROM users WHERE status='active' AND public=1 AND role='student' ORDER BY name LIMIT 500").all()).results),"u");
add("GET","/api/members/:id",async c=>{
  const u=await DB(c).prepare("SELECT id,name,section,bio,avatar,public FROM users WHERE id=? AND status='active' AND role='student'").bind(Number(c.p.id)).first();
  if(!u||(!u.public&&c.u.role!=="admin"&&c.u.id!==u.id))return J({error:"Not found"},404);
  const rd=(await DB(c).prepare("SELECT data FROM readings WHERE user_id=? ORDER BY id DESC").bind(u.id).all()).results.map(x=>JSON.parse(x.data));
  delete u.public;return J({user:u,reading:rd})},"u");
add("GET","/api/posts",async c=>J((await DB(c).prepare("SELECT p.id,p.body,p.created,p.user_id,u.name,u.section,u.avatar FROM posts p JOIN users u ON u.id=p.user_id WHERE u.status='active' ORDER BY p.id DESC LIMIT 100").all()).results),"u");
add("POST","/api/posts",async c=>{
  if(await lim(c,"post",40))return many();
  const t=String(c.b.body||"").trim().slice(0,500);if(!t)return bad("Write something first.");
  await DB(c).prepare("INSERT INTO posts(user_id,body) VALUES(?,?)").bind(c.u.id,t).run();return OK()},"u");
add("DELETE","/api/posts/:id",async c=>{
  await (c.u.role==="admin"?DB(c).prepare("DELETE FROM posts WHERE id=?").bind(Number(c.p.id)):DB(c).prepare("DELETE FROM posts WHERE id=? AND user_id=?").bind(Number(c.p.id),c.u.id)).run();return OK()},"u");

/* my reading list */
const ST_=["reading","want","done"];
const rd=b=>{const o={};if("title" in b)o.title=String(b.title).trim().slice(0,150);if("bookId" in b)o.bookId=String(b.bookId||"").slice(0,12);if("status" in b)o.status=ST_.includes(b.status)?b.status:"reading";
  for(const k of["page","pages"])if(k in b)o[k]=Math.max(0,Math.min(99999,parseInt(b[k])||0));if("place" in b)o.place=String(b.place||"").slice(0,100);return o};
add("GET","/api/reading",async c=>J((await DB(c).prepare("SELECT id,data FROM readings WHERE user_id=? ORDER BY id DESC").bind(c.u.id).all()).results.map(parse)),"u");
add("POST","/api/reading",async c=>{const o=rd(c.b);if(!o.title)return bad("Enter a title.");o.status=o.status||"reading";
  await DB(c).prepare("INSERT INTO readings(user_id,data) VALUES(?,?)").bind(c.u.id,JSON.stringify(o)).run();return OK()},"u");
add("PATCH","/api/reading/:id",async c=>{await DB(c).prepare("UPDATE readings SET data=json_patch(data,?) WHERE id=? AND user_id=?").bind(JSON.stringify(rd(c.b)),Number(c.p.id),c.u.id).run();return OK()},"u");
add("DELETE","/api/reading/:id",async c=>{await DB(c).prepare("DELETE FROM readings WHERE id=? AND user_id=?").bind(Number(c.p.id),c.u.id).run();return OK()},"u");

/* feedback to administrators */
add("GET","/api/feedback",async c=>J((await (c.u.role==="admin"?DB(c).prepare("SELECT f.*,u.name,u.email FROM feedback f JOIN users u ON u.id=f.user_id ORDER BY (f.status='open') DESC,f.id DESC LIMIT 200"):DB(c).prepare("SELECT * FROM feedback WHERE user_id=? ORDER BY id DESC LIMIT 50").bind(c.u.id)).all()).results),"u");
add("POST","/api/feedback",async c=>{
  if(await lim(c,"fb",20))return many();
  const t=String(c.b.message||"").trim().slice(0,1000);if(!t)return bad("Write your feedback first.");
  await DB(c).prepare("INSERT INTO feedback(user_id,message) VALUES(?,?)").bind(c.u.id,t).run();return OK()},"u");
add("PATCH","/api/feedback/:id",async c=>{await DB(c).prepare("UPDATE feedback SET reply=?,status=? WHERE id=?").bind(String(c.b.reply||"").slice(0,1000),c.b.status==="open"?"open":"resolved",Number(c.p.id)).run();return OK()},"a");

/* admin: member management */
add("GET","/api/admin/members",async c=>J((await DB(c).prepare("SELECT id,email,name,section,avatar,role,status FROM users ORDER BY role,name LIMIT 1000").all()).results),"a");
add("PATCH","/api/admin/members/:id",async c=>{await DB(c).prepare("UPDATE users SET status=? WHERE id=? AND role='student'").bind(c.b.status==="suspended"?"suspended":"active",Number(c.p.id)).run();return OK()},"a");

/* book scanner (admin) */
add("POST","/api/scan",async c=>{
  if(!c.env.ANTHROPIC_API_KEY)return J({error:"Scanning isn’t set up yet. Add the ANTHROPIC_API_KEY secret."},501);
  const img=String(c.b.image||"");if(!img||img.length>7e6)return bad("Bad image.");
  const a=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":c.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:c.env.CLAUDE_MODEL||"claude-sonnet-5-5",max_tokens:700,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:img}},{type:"text",text:PROMPT}]}]})});
  const j=await a.json();if(!a.ok){console.error(JSON.stringify(j));return J({error:"The scanner service returned an error."},502)}
  return J({text:(j.content||[]).map(x=>x.text||"").join("")})},"a");

/* catalog + loans: books public to read, loans (borrower names) admin-only; all writes admin-only */
const COLS={books:1,loans:0};
async function gen(c){
  const t=c.p.c,m=c.q.method;if(!(t in COLS))return J({error:"Not found"},404);
  const a=c.u&&c.u.role==="admin";
  if(!a&&(m!=="GET"||!COLS[t]))return J({error:"Admin only."},c.u?403:401);
  if((m==="POST"||m==="PATCH")&&JSON.stringify(c.b).length>=20000)return bad("Bad data.");
  if(m==="GET")return J((await DB(c).prepare(`SELECT id,data FROM ${t} ORDER BY id`).all()).results.map(parse));
  if(m==="POST"){const r=await DB(c).prepare(`INSERT INTO ${t}(data) VALUES(?)`).bind(JSON.stringify(c.b)).run();return J({id:r.meta.last_row_id})}
  if(m==="PATCH"){await DB(c).prepare(`UPDATE ${t} SET data=json_patch(data,?) WHERE id=?`).bind(JSON.stringify(c.b),Number(c.p.id)).run();return OK()}
  await DB(c).prepare(`DELETE FROM ${t} WHERE id=?`).bind(Number(c.p.id)).run();return OK()}
add("GET","/api/:c",gen);add("POST","/api/:c",gen);add("PATCH","/api/:c/:id",gen);add("DELETE","/api/:c/:id",gen);

export default{async fetch(q,env){
  const url=new URL(q.url);
  if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(q);
  try{
    const c={q,env,url,ip:q.headers.get("CF-Connecting-IP")||"",b:{},u:null,p:{}},m=q.method;
    c.u=await loadUser(c);
    if(m!=="GET"&&m!=="DELETE"){try{c.b=await q.json()}catch(e){c.b={}}}
    if(!c.b||typeof c.b!=="object"||Array.isArray(c.b))c.b={};
    for(const r of R){if(r.m!==m)continue;const x=r.re.exec(url.pathname);if(!x)continue;c.p=x.groups||{};
      if(c.p.id&&!/^\d+$/.test(c.p.id))return J({error:"Bad id"},400);
      if(r.o.includes("u")&&!c.u)return J({error:"Please sign in."},401);
      if(r.o.includes("a")&&!(c.u&&c.u.role==="admin"))return J({error:"Admin only."},403);
      return await r.f(c)}
    return J({error:"Not found"},404);
  }catch(e){console.error(e);return J({error:"Server error."},500)}
}};
