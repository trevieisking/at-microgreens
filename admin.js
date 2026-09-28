const AT_SUPABASE_URL='https://xzxqfrvqdgkzwujbkdbk.supabase.co';
const AT_SUPABASE_KEY='sb_publishable_1wHhSq2xo0XBwsKXO_64HQ_xyVY9xRN';
const SESSION_KEY='at_microgreens_admin_session_v1';

let adminSession=null;
let adminProducts=[];
let adminOrders=[];
let adminItems=[];
let adminDeliveries=[];
let adminInventory=[];
let adminOrderHistory=[];
let adminStockHistory=[];
let adminSettings=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function adminMoney(n){return '£'+Number(n||0).toFixed(2)}
function fmtDateTime(v){if(!v)return '—';try{return new Date(v).toLocaleString('en-GB')}catch{return v}}
function saveSession(s){adminSession=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s))}
function clearSession(){adminSession=null;localStorage.removeItem(SESSION_KEY)}
function storedSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function authHeaders(token=adminSession?.access_token){return {apikey:AT_SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
function setStatus(message,type=''){const el=document.querySelector('#admin-status');if(!el)return;el.textContent=message;el.className='admin-status '+type}
function setLoginError(message=''){const el=document.querySelector('#admin-login-error');if(!el)return;el.textContent=message;el.hidden=!message}

async function api(path,options={}){
  const headers={...authHeaders(),...(options.headers||{})};
  const r=await fetch(AT_SUPABASE_URL+path,{...options,headers});
  const text=await r.text();
  let data=null;
  if(text){try{data=JSON.parse(text)}catch{data=text}}
  if(!r.ok){
    const msg=(data&&typeof data==='object'&&(data.message||data.msg||data.error_description||data.hint))||String(data||('Request failed '+r.status));
    throw new Error(msg);
  }
  return data;
}
async function rpc(name,body){return api('/rest/v1/rpc/'+name,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)})}

async function signIn(email,password){
  const r=await fetch(AT_SUPABASE_URL+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{apikey:AT_SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data.error_description||data.msg||'Invalid email or password');
  saveSession(data);return data;
}
async function currentUser(token){
  const r=await fetch(AT_SUPABASE_URL+'/auth/v1/user',{headers:authHeaders(token)});
  if(!r.ok)throw new Error('Session expired');
  return r.json();
}
async function adminAccess(userId,token){
  const r=await fetch(AT_SUPABASE_URL+'/rest/v1/at_microgreens_admins?user_id=eq.'+encodeURIComponent(userId)+'&select=user_id,display_name,role',{headers:authHeaders(token)});
  if(!r.ok)throw new Error('Admin access check failed');
  return (await r.json())[0]||null;
}
async function signOut(){
  try{if(adminSession?.access_token)await fetch(AT_SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:authHeaders()})}catch{}
  clearSession();showLogin();setLoginError('');
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
function showTab(name){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('active',b.dataset.adminTab===name));
  document.querySelectorAll('.admin-section').forEach(s=>s.classList.toggle('active',s.dataset.adminSection===name));
}

async function loadProducts(){
  const rows=await api('/rest/v1/at_microgreens_products?select=id,name,category,pack,price,stock,image,sort_order&order=sort_order.asc');
  adminProducts=(rows||[]).map(p=>({...p,price:Number(p.price)}));
}
async function loadOperationalData(){
  const [orders,items,deliveries,inventory,history,stockHistory,settings]=await Promise.all([
    api('/rest/v1/at_microgreens_orders?select=*&order=created_at.desc&limit=100'),
    api('/rest/v1/at_microgreens_order_items?select=*&order=id.asc&limit=1000'),
    api('/rest/v1/at_microgreens_deliveries?select=*&order=created_at.desc&limit=100'),
    api('/rest/v1/at_microgreens_inventory_batches?select=*&order=created_at.desc&limit=200'),
    api('/rest/v1/at_microgreens_order_history?select=*&order=changed_at.desc&limit=250'),
    api('/rest/v1/at_microgreens_stock_history?select=*&order=changed_at.desc&limit=250'),
    api('/rest/v1/at_microgreens_settings?id=eq.store&select=*')
  ]);
  adminOrders=orders||[];
  adminItems=items||[];
  adminDeliveries=deliveries||[];
  adminInventory=inventory||[];
  adminOrderHistory=history||[];
  adminStockHistory=stockHistory||[];
  adminSettings=(settings||[])[0]||null;
}
async function loadAll(){
  setStatus('Loading admin data…');
  await loadProducts();
  await loadOperationalData();
  renderAll();
  setStatus('Admin data loaded.','ok');
}
function renderAll(){
  drawAdminProducts();
  drawOrderPicker();
  drawOrders();
  drawDeliveries();
  drawInventory();
  drawHistory();
  drawSettings();
}

function drawAdminProducts(){
  const q=(document.querySelector('#admin-search')?.value||'').toLowerCase();
  const filter=document.querySelector('#admin-filter')?.value||'All';
  const el=document.querySelector('#admin-products');if(!el)return;
  const rows=adminProducts.filter(p=>(filter==='All'||p.category===filter)&&p.name.toLowerCase().includes(q));
  el.innerHTML=rows.map(p=>`<article class="admin-product" data-id="${esc(p.id)}">
    <img src="${esc(p.image)}" alt="">
    <div class="admin-product-main"><strong>${esc(p.name)}</strong><span>${esc(p.pack)} · ${esc(p.category)}</span></div>
    <label class="admin-price">Price <span>£</span><input type="number" min="0" step="0.05" value="${Number(p.price).toFixed(2)}" aria-label="${esc(p.name)} price"></label>
    <button class="stock-toggle ${p.stock?'on':''}" type="button" onclick="setAdminStock('${esc(p.id)}',${!p.stock})">${p.stock?'IN STOCK':'OUT OF STOCK'}</button>
    <button class="btn admin-save" type="button" onclick="saveAdminPrice('${esc(p.id)}',this)">Save price</button>
  </article>`).join('')||'<div class="notice">No products match that search.</div>';
}
async function patchProduct(id,changes){
  const rows=await api('/rest/v1/at_microgreens_products?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(changes)
  });
  const updated=(rows||[])[0];
  if(updated){
    const i=adminProducts.findIndex(p=>p.id===id);
    if(i>=0)adminProducts[i]={...adminProducts[i],...updated,price:Number(updated.price)};
  }
  return updated;
}
async function setAdminStock(id,value){
  setStatus('Saving stock…');
  try{await patchProduct(id,{stock:value});drawAdminProducts();drawOrderPicker();setStatus('Stock updated. Public shop now uses this value.','ok')}
  catch(e){setStatus(e.message,'error')}
}
async function saveAdminPrice(id,btn){
  const input=btn.closest('.admin-product').querySelector('input[type=number]');
  const price=Number(input.value);
  if(!Number.isFinite(price)||price<0){setStatus('Enter a valid price.','error');return}
  setStatus('Saving price…');
  try{await patchProduct(id,{price});drawAdminProducts();drawOrderPicker();setStatus('Price updated. Public shop now uses this value.','ok')}
  catch(e){setStatus(e.message,'error')}
}

function drawOrderPicker(){
  const el=document.querySelector('#order-product-picker');if(!el)return;
  const rows=adminProducts.filter(p=>p.stock);
  if(!rows.length){el.innerHTML='<div class="notice">No products are currently in stock. Turn on at least one product in the Stock tab before creating a test order.</div>';return}
  el.innerHTML=rows.map(p=>`<label class="order-pick-row" data-product-id="${esc(p.id)}">
    <input type="checkbox" class="order-pick-check">
    <img src="${esc(p.image)}" alt="">
    <span><strong>${esc(p.name)}</strong><small>${esc(p.pack)} · ${adminMoney(p.price)}</small></span>
    <input class="order-pick-qty" type="number" min="1" step="1" value="1" aria-label="${esc(p.name)} quantity">
  </label>`).join('');
}
function itemsFor(orderId){return adminItems.filter(i=>i.order_id===orderId)}
function deliveryFor(orderId){return adminDeliveries.find(d=>d.order_id===orderId)}
function drawOrders(){
  const el=document.querySelector('#orders-list');if(!el)return;
  const q=(document.querySelector('#order-search')?.value||'').toLowerCase();
  const status=document.querySelector('#order-status-filter')?.value||'All';
  const rows=adminOrders.filter(o=>(status==='All'||o.order_status===status)&&([o.order_number,o.customer_name,o.customer_email,o.customer_phone].join(' ').toLowerCase().includes(q)));
  el.innerHTML=rows.map(o=>{
    const items=itemsFor(o.id);
    return `<article class="ops-card order-card">
      <div class="ops-card-head"><div><strong>${esc(o.order_number)}</strong><span class="test-badge">TEST</span><small>${fmtDateTime(o.created_at)}</small></div><strong>${adminMoney(o.total)}</strong></div>
      <div class="ops-meta"><span>${esc(o.customer_name)}</span><span>${esc(o.fulfilment_type)}</span><span>Payment: locked / ${esc(o.payment_status)}</span></div>
      <div class="order-lines">${items.map(i=>`<div><span>${esc(i.product_name)} × ${i.quantity}</span><strong>${adminMoney(i.line_total)}</strong></div>`).join('')}</div>
      <div class="ops-actions">
        <select class="order-status-select">${['draft','confirmed','preparing','ready','out_for_delivery','delivered','cancelled'].map(s=>`<option ${o.order_status===s?'selected':''}>${s}</option>`).join('')}</select>
        <input class="order-status-note" placeholder="Optional status note">
        <button class="btn" type="button" onclick="saveOrderStatus('${o.id}',this)">Save status</button>
      </div>
    </article>`;
  }).join('')||'<div class="notice">No test orders yet.</div>';
}
async function createTestOrder(e){
  e.preventDefault();
  const items=[...document.querySelectorAll('.order-pick-row')].filter(r=>r.querySelector('.order-pick-check').checked).map(r=>({
    product_id:r.dataset.productId,quantity:Number(r.querySelector('.order-pick-qty').value||1)
  })).filter(i=>i.quantity>0);
  if(!items.length){setStatus('Choose at least one in-stock product.','error');return}
  if(!adminSettings?.admin_test_orders_enabled){setStatus('Admin test orders are disabled in Settings.','error');return}
  const fulfilment=document.querySelector('#order-fulfilment').value;
  const body={
    p_customer_name:document.querySelector('#order-customer-name').value.trim(),
    p_customer_email:document.querySelector('#order-customer-email').value.trim(),
    p_customer_phone:document.querySelector('#order-customer-phone').value.trim(),
    p_fulfilment_type:fulfilment,
    p_delivery_fee:fulfilment==='collection'?0:Number(document.querySelector('#order-delivery-fee').value||0),
    p_notes:document.querySelector('#order-notes').value.trim(),
    p_items:items
  };
  setStatus('Creating TEST order…');
  try{
    const result=await rpc('at_microgreens_admin_create_test_order',body);
    document.querySelector('#test-order-form').reset();
    document.querySelector('#order-delivery-fee').value=Number(adminSettings?.default_delivery_fee||0).toFixed(2);
    await loadOperationalData();renderAll();showTab('orders');
    setStatus('TEST order '+esc(result?.order_number||'created')+' created. No payment was taken.','ok');
  }catch(err){setStatus(err.message,'error')}
}
async function saveOrderStatus(id,btn){
  const card=btn.closest('.order-card');
  const status=card.querySelector('.order-status-select').value;
  const note=card.querySelector('.order-status-note').value.trim();
  setStatus('Saving order status…');
  try{await rpc('at_microgreens_admin_set_order_status',{p_order_id:id,p_status:status,p_note:note});await loadOperationalData();drawOrders();drawDeliveries();drawHistory();setStatus('Order status updated.','ok')}
  catch(e){setStatus(e.message,'error')}
}

function timeValue(v){return v?String(v).slice(0,5):''}
function drawDeliveries(){
  const el=document.querySelector('#deliveries-list');if(!el)return;
  const rows=adminDeliveries.map(d=>({d,o:adminOrders.find(o=>o.id===d.order_id)})).filter(x=>x.o);
  el.innerHTML=rows.map(({d,o})=>`<article class="ops-card delivery-card">
    <div class="ops-card-head"><div><strong>${esc(o.order_number)}</strong><small>${esc(o.customer_name)}</small></div><span class="test-badge">TEST DELIVERY</span></div>
    <div class="delivery-grid">
      <label>Status<select class="delivery-status">${['awaiting_schedule','scheduled','preparing','ready','out_for_delivery','delivered','failed','cancelled'].map(s=>`<option ${d.delivery_status===s?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Date<input class="delivery-date" type="date" value="${esc(d.delivery_date||'')}"></label>
      <label>Window start<input class="delivery-start" type="time" value="${esc(timeValue(d.window_start))}"></label>
      <label>Window end<input class="delivery-end" type="time" value="${esc(timeValue(d.window_end))}"></label>
      <label>Address line 1<input class="delivery-address1" value="${esc(d.address_line1)}"></label>
      <label>Address line 2<input class="delivery-address2" value="${esc(d.address_line2)}"></label>
      <label>Town / city<input class="delivery-town" value="${esc(d.town_city)}"></label>
      <label>Postcode<input class="delivery-postcode" value="${esc(d.postcode)}"></label>
      <label class="span-2">Delivery instructions<textarea class="delivery-instructions" rows="2">${esc(d.delivery_instructions)}</textarea></label>
      <label class="span-2">Driver/admin notes<textarea class="delivery-driver-notes" rows="2">${esc(d.driver_notes)}</textarea></label>
    </div>
    <button class="btn" type="button" onclick="saveDelivery('${o.id}',this)">Save delivery</button>
  </article>`).join('')||'<div class="notice">No delivery test orders yet. Create a delivery order from Orders.</div>';
}
async function saveDelivery(orderId,btn){
  const card=btn.closest('.delivery-card');
  const val=sel=>card.querySelector(sel).value||null;
  setStatus('Saving delivery…');
  try{
    await rpc('at_microgreens_admin_save_delivery',{
      p_order_id:orderId,p_status:val('.delivery-status'),
      p_delivery_date:val('.delivery-date'),p_window_start:val('.delivery-start'),p_window_end:val('.delivery-end'),
      p_address_line1:val('.delivery-address1')||'',p_address_line2:val('.delivery-address2')||'',
      p_town_city:val('.delivery-town')||'',p_postcode:val('.delivery-postcode')||'',
      p_delivery_instructions:val('.delivery-instructions')||'',p_driver_notes:val('.delivery-driver-notes')||''
    });
    await loadOperationalData();drawDeliveries();drawHistory();setStatus('Delivery updated.','ok');
  }catch(e){setStatus(e.message,'error')}
}

function drawInventoryProductOptions(){
  const el=document.querySelector('#inventory-product');if(!el)return;
  const current=el.value;
  el.innerHTML=adminProducts.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.pack)}</option>`).join('');
  if(current)el.value=current;
}
function drawInventory(){
  drawInventoryProductOptions();
  const el=document.querySelector('#inventory-list');if(!el)return;
  el.innerHTML=adminInventory.map(b=>{
    const p=adminProducts.find(x=>x.id===b.product_id);
    return `<article class="ops-card inventory-card">
      <div class="ops-card-head"><div><strong>${esc(b.batch_code)}</strong><small>${esc(p?.name||b.product_id)}</small></div><span class="test-badge">${esc(b.batch_status)}</span></div>
      <div class="inventory-grid">
        <label>Status<select class="batch-status">${['planned','growing','harvested','available','depleted','discarded'].map(s=>`<option ${b.batch_status===s?'selected':''}>${s}</option>`).join('')}</select></label>
        <label>Units<input class="batch-qty" type="number" min="0" step="1" value="${b.quantity_units}"></label>
        <label>Reserved<input class="batch-reserved" type="number" min="0" step="1" value="${b.reserved_units}"></label>
        <label>Sow<input class="batch-sow" type="date" value="${esc(b.sow_date||'')}"></label>
        <label>Harvest<input class="batch-harvest" type="date" value="${esc(b.harvest_date||'')}"></label>
        <label>Best before<input class="batch-best" type="date" value="${esc(b.best_before_date||'')}"></label>
        <label class="span-2">Notes<textarea class="batch-notes" rows="2">${esc(b.notes)}</textarea></label>
      </div>
      <button class="btn" type="button" onclick="saveInventoryBatch('${b.id}',this)">Save batch</button>
    </article>`;
  }).join('')||'<div class="notice">No inventory batches yet.</div>';
}
async function createInventoryBatch(e){
  e.preventDefault();setStatus('Creating inventory batch…');
  try{
    await rpc('at_microgreens_admin_create_inventory_batch',{
      p_product_id:document.querySelector('#inventory-product').value,
      p_status:document.querySelector('#inventory-status').value,
      p_sow_date:document.querySelector('#inventory-sow-date').value||null,
      p_harvest_date:document.querySelector('#inventory-harvest-date').value||null,
      p_best_before_date:document.querySelector('#inventory-best-before').value||null,
      p_quantity_units:Number(document.querySelector('#inventory-quantity').value||0),
      p_notes:document.querySelector('#inventory-notes').value.trim()
    });
    e.target.reset();await loadOperationalData();drawInventory();setStatus('Inventory batch created.','ok');
  }catch(err){setStatus(err.message,'error')}
}
async function saveInventoryBatch(id,btn){
  const card=btn.closest('.inventory-card');const v=s=>card.querySelector(s).value||null;
  setStatus('Saving inventory batch…');
  try{
    await rpc('at_microgreens_admin_update_inventory_batch',{
      p_batch_id:id,p_status:v('.batch-status'),p_quantity_units:Number(v('.batch-qty')||0),
      p_reserved_units:Number(v('.batch-reserved')||0),p_sow_date:v('.batch-sow'),
      p_harvest_date:v('.batch-harvest'),p_best_before_date:v('.batch-best'),p_notes:v('.batch-notes')||''
    });
    await loadOperationalData();drawInventory();setStatus('Inventory batch updated.','ok');
  }catch(e){setStatus(e.message,'error')}
}

function drawHistory(){
  const el=document.querySelector('#history-list');if(!el)return;
  const showHidden=!!document.querySelector('#history-show-hidden')?.checked;
  const orderEvents=adminOrderHistory.map(h=>({
    id:h.id,source:'order',hidden:!!h.hidden,hiddenAt:h.hidden_at,
    when:h.changed_at,type:'Order',title:(adminOrders.find(o=>o.id===h.order_id)?.order_number||h.order_id),
    detail:[h.event_type,h.old_value&&('from '+h.old_value),h.new_value&&('to '+h.new_value),h.note].filter(Boolean).join(' · ')
  }));
  const stockEvents=adminStockHistory.map(h=>{
    const p=adminProducts.find(x=>x.id===h.product_id);
    let d=[];
    if(h.old_stock!==h.new_stock)d.push((h.old_stock?'In stock':'Out of stock')+' → '+(h.new_stock?'In stock':'Out of stock'));
    if(Number(h.old_price)!==Number(h.new_price))d.push(adminMoney(h.old_price)+' → '+adminMoney(h.new_price));
    return {id:h.id,source:'stock',hidden:!!h.hidden,hiddenAt:h.hidden_at,when:h.changed_at,type:'Stock',title:p?.name||h.product_id,detail:d.join(' · ')||'Product changed'};
  });
  const rows=[...orderEvents,...stockEvents]
    .filter(h=>showHidden||!h.hidden)
    .sort((a,b)=>new Date(b.when)-new Date(a.when))
    .slice(0,250);
  el.innerHTML=rows.map(h=>`<div class="history-row ${h.hidden?'history-hidden':''}">
    <span class="history-type">${esc(h.type)}</span>
    <div><strong>${esc(h.title)}</strong><small>${esc(h.detail)}${h.hidden?' · REMOVED':''}</small></div>
    <time>${fmtDateTime(h.when)}</time>
    <button class="history-action ${h.hidden?'restore':''}" type="button" onclick="setHistoryHidden('${h.source}',${h.id},${!h.hidden})">${h.hidden?'Restore':'Remove'}</button>
  </div>`).join('')||'<div class="notice">No history entries to show.</div>';
}

async function setHistoryHidden(source,id,hidden){
  const table=source==='order'?'at_microgreens_order_history':'at_microgreens_stock_history';
  if(hidden&&!confirm('Remove this entry from the normal History view? It can be restored later.'))return;
  setStatus(hidden?'Removing history entry…':'Restoring history entry…');
  try{
    await api('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id),{
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({hidden})
    });
    await loadOperationalData();
    drawHistory();
    setStatus(hidden?'History entry removed from normal view.':'History entry restored.','ok');
  }catch(e){setStatus(e.message,'error')}
}

function drawSettings(){
  const s=adminSettings;if(!s)return;
  document.querySelector('#settings-test-orders').checked=!!s.admin_test_orders_enabled;
  document.querySelector('#settings-delivery-fee').value=Number(s.default_delivery_fee||0).toFixed(2);
  document.querySelector('#settings-delivery-area').value=s.delivery_area_note||'';
  document.querySelector('#settings-cutoff').value=s.order_cutoff_note||'';
  const fee=document.querySelector('#order-delivery-fee');
  if(fee&&!fee.dataset.touched)fee.value=Number(s.default_delivery_fee||0).toFixed(2);
}
async function saveSettings(e){
  e.preventDefault();setStatus('Saving operational settings…');
  try{
    await api('/rest/v1/at_microgreens_settings?id=eq.store',{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({
        admin_test_orders_enabled:document.querySelector('#settings-test-orders').checked,
        default_delivery_fee:Number(document.querySelector('#settings-delivery-fee').value||0),
        delivery_area_note:document.querySelector('#settings-delivery-area').value.trim(),
        order_cutoff_note:document.querySelector('#settings-cutoff').value.trim()
      })
    });
    await loadOperationalData();drawSettings();setStatus('Operational settings saved. Checkout, Stripe and public ordering remain locked off.','ok');
  }catch(err){setStatus(err.message,'error')}
}

function wireStatic(){
  document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.adminTab)));
  document.querySelector('#admin-search')?.addEventListener('input',drawAdminProducts);
  document.querySelector('#admin-filter')?.addEventListener('change',drawAdminProducts);
  document.querySelector('#order-search')?.addEventListener('input',drawOrders);
  document.querySelector('#order-status-filter')?.addEventListener('change',drawOrders);
  document.querySelector('#test-order-form')?.addEventListener('submit',createTestOrder);
  document.querySelector('#inventory-form')?.addEventListener('submit',createInventoryBatch);
  document.querySelector('#settings-form')?.addEventListener('submit',saveSettings);
  document.querySelector('#history-show-hidden')?.addEventListener('change',drawHistory);
  document.querySelector('#order-delivery-fee')?.addEventListener('input',e=>e.target.dataset.touched='1');
  document.querySelector('#order-fulfilment')?.addEventListener('change',e=>{
    const fee=document.querySelector('#order-delivery-fee');
    if(e.target.value==='collection'){fee.value='0.00';fee.disabled=true}
    else{fee.disabled=false;fee.value=Number(adminSettings?.default_delivery_fee||0).toFixed(2)}
  });
  document.querySelector('#admin-signout')?.addEventListener('click',signOut);
  document.querySelector('#admin-login-form')?.addEventListener('submit',async e=>{
    e.preventDefault();setLoginError('');
    const email=document.querySelector('#admin-email').value.trim();
    const password=document.querySelector('#admin-password').value;
    try{
      const session=await signIn(email,password);
      const user=await currentUser(session.access_token);
      const access=await adminAccess(user.id,session.access_token);
      if(!access){clearSession();throw new Error('This account is not authorised for A.T Microgreens admin.')}
      showPanel(user,access);await loadAll();
    }catch(err){clearSession();showLogin(err.message)}
  });
}

async function bootAdmin(){
  wireStatic();
  const saved=storedSession();
  if(!saved?.access_token){showLogin();return}
  try{
    adminSession=saved;
    const user=await currentUser(saved.access_token);
    const access=await adminAccess(user.id,saved.access_token);
    if(!access)throw new Error('This account is not authorised for A.T Microgreens admin.');
    showPanel(user,access);await loadAll();
  }catch(e){clearSession();showLogin('Please sign in again.')}
}
document.addEventListener('DOMContentLoaded',bootAdmin);