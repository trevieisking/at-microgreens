const AT_SUPABASE_URL='https://xzxqfrvqdgkzwujbkdbk.supabase.co';
const AT_SUPABASE_KEY='sb_publishable_1wHhSq2xo0XBwsKXO_64HQ_xyVY9xRN';
const SESSION_KEY='at_microgreens_admin_session_v1';
let adminSession=null;
let adminProducts=[];

function adminMoney(n){return '£'+Number(n||0).toFixed(2)}
function saveSession(s){adminSession=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s))}
function clearSession(){adminSession=null;localStorage.removeItem(SESSION_KEY)}
function storedSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function authHeaders(token){return {apikey:AT_SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'}}

async function signIn(email,password){
  const r=await fetch(AT_SUPABASE_URL+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{apikey:AT_SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data.error_description||data.msg||'Sign-in failed');
  saveSession(data);
  return data;
}

async function currentUser(token){
  const r=await fetch(AT_SUPABASE_URL+'/auth/v1/user',{headers:authHeaders(token)});
  if(!r.ok)throw new Error('Session expired');
  return r.json();
}

async function adminAccess(userId,token){
  const r=await fetch(AT_SUPABASE_URL+'/rest/v1/at_microgreens_admins?user_id=eq.'+encodeURIComponent(userId)+'&select=user_id,display_name,role',{
    headers:authHeaders(token)
  });
  if(!r.ok)throw new Error('Admin access check failed');
  const rows=await r.json();
  return rows[0]||null;
}

async function loadAdminProducts(){
  const token=adminSession.access_token;
  const r=await fetch(AT_SUPABASE_URL+'/rest/v1/at_microgreens_products?select=id,name,category,pack,price,stock,image,sort_order&order=sort_order.asc',{
    headers:authHeaders(token)
  });
  if(!r.ok)throw new Error('Could not load products');
  adminProducts=(await r.json()).map(p=>({...p,price:Number(p.price)}));
  drawAdminProducts();
}

function drawAdminProducts(){
  const q=(document.querySelector('#admin-search')?.value||'').toLowerCase();
  const filter=document.querySelector('#admin-filter')?.value||'All';
  const el=document.querySelector('#admin-products');
  if(!el)return;
  const rows=adminProducts.filter(p=>(filter==='All'||p.category===filter)&&p.name.toLowerCase().includes(q));
  el.innerHTML=rows.map(p=>`<article class="admin-product" data-id="${p.id}">
    <img src="${p.image}" alt="">
    <div class="admin-product-main">
      <strong>${p.name}</strong>
      <span>${p.pack} · ${p.category}</span>
    </div>
    <label class="admin-price">Price
      <span>£</span><input type="number" min="0" step="0.05" value="${Number(p.price).toFixed(2)}" aria-label="${p.name} price">
    </label>
    <button class="stock-toggle ${p.stock?'on':''}" type="button" onclick="setAdminStock('${p.id}',${!p.stock})">${p.stock?'IN STOCK':'OUT OF STOCK'}</button>
    <button class="btn admin-save" type="button" onclick="saveAdminPrice('${p.id}',this)">Save price</button>
  </article>`).join('')||'<div class="notice">No products match that search.</div>';
}

async function patchProduct(id,changes){
  const token=adminSession.access_token;
  const r=await fetch(AT_SUPABASE_URL+'/rest/v1/at_microgreens_products?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',
    headers:{...authHeaders(token),Prefer:'return=representation'},
    body:JSON.stringify(changes)
  });
  if(!r.ok){
    const body=await r.text();
    throw new Error(body||'Update failed');
  }
  const rows=await r.json();
  const updated=rows[0];
  if(updated){
    const i=adminProducts.findIndex(p=>p.id===id);
    if(i>=0)adminProducts[i]={...adminProducts[i],...updated,price:Number(updated.price)};
  }
  return updated;
}

async function setAdminStock(id,value){
  setStatus('Saving stock…');
  try{
    await patchProduct(id,{stock:value});
    drawAdminProducts();
    setStatus('Stock updated. Public shop now uses this value.','ok');
  }catch(e){setStatus(e.message,'error')}
}

async function saveAdminPrice(id,btn){
  const card=btn.closest('.admin-product');
  const input=card.querySelector('input[type=number]');
  const price=Number(input.value);
  if(!Number.isFinite(price)||price<0){setStatus('Enter a valid price.','error');return}
  setStatus('Saving price…');
  try{
    await patchProduct(id,{price});
    drawAdminProducts();
    setStatus('Price updated. Public shop now uses this value.','ok');
  }catch(e){setStatus(e.message,'error')}
}

function setStatus(message,type=''){
  const el=document.querySelector('#admin-status');
  if(!el)return;
  el.textContent=message;
  el.className='admin-status '+type;
}
function setLoginError(message=''){
  const el=document.querySelector('#admin-login-error');
  if(!el)return;
  el.textContent=message;
  el.hidden=!message;
}
function showLogin(message=''){
  document.querySelector('#admin-login').hidden=false;
  document.querySelector('#admin-panel').hidden=true;
  setLoginError(message);
}

function showPanel(user,access){
  document.querySelector('#admin-login').hidden=true;
  document.querySelector('#admin-panel').hidden=false;
  document.querySelector('#admin-who').textContent=(access.display_name||user.email||'Admin')+' · '+access.role;
}

async function bootAdmin(){
  document.querySelector('#admin-login-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    setLoginError('');
    setStatus('Signing in…');
    const email=document.querySelector('#admin-email').value.trim();
    const password=document.querySelector('#admin-password').value;
    try{
      const session=await signIn(email,password);
      const user=await currentUser(session.access_token);
      const access=await adminAccess(user.id,session.access_token);
      if(!access){clearSession();throw new Error('This account is not authorised for A.T Microgreens admin.')}
      showPanel(user,access);
      setStatus('Signed in.','ok');
      await loadAdminProducts();
    }catch(err){clearSession();showLogin(err.message)}
  });

  document.querySelector('#admin-search')?.addEventListener('input',drawAdminProducts);
  document.querySelector('#admin-filter')?.addEventListener('change',drawAdminProducts);
  document.querySelector('#admin-signout')?.addEventListener('click',()=>{
    clearSession();
    showLogin();
    setStatus('Signed out.','ok');
  });

  const saved=storedSession();
  if(!saved?.access_token){showLogin();return}
  try{
    adminSession=saved;
    const user=await currentUser(saved.access_token);
    const access=await adminAccess(user.id,saved.access_token);
    if(!access)throw new Error('This account is not authorised for A.T Microgreens admin.');
    showPanel(user,access);
    setStatus('Signed in.','ok');
    await loadAdminProducts();
  }catch(e){
    clearSession();
    showLogin('Please sign in again.');
  }
}
document.addEventListener('DOMContentLoaded',bootAdmin);
