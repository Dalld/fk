const $ = (sel, root = document) => root.querySelector(sel);
const money = (value) => `¥${Number(value || 0).toFixed(2)}`;

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

const state = {
  authed: false,
  view: "dashboard",
  data: null,
};

function setMessage(text, type = "") {
  const box = $("#message");
  if (!box) return;
  box.textContent = text;
  box.className = type ? `badge ${type}` : "badge";
}

async function login(event) {
  event.preventDefault();
  const username = $("#username").value.trim();
  const password = $("#password").value;
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    await bootstrap();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
}

async function bootstrap() {
  try {
    const data = await api("/api/admin/bootstrap");
    state.authed = true;
    state.data = data.data;
    $("#loginPage").hidden = true;
    $("#adminApp").hidden = false;
    $("#adminName").textContent = data.admin.username;
    render();
  } catch {
    state.authed = false;
    $("#loginPage").hidden = false;
    $("#adminApp").hidden = true;
  }
}

async function refresh() {
  const data = await api("/api/admin/bootstrap");
  state.data = data.data;
  render();
}

function navigate(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  render();
}

function render() {
  if (!state.authed || !state.data) return;
  const titles = {
    dashboard: "概览",
    settings: "站点与支付",
    categories: "商品分类",
    products: "商品管理",
    cards: "卡密库存",
    orders: "订单管理",
  };
  $("#pageTitle").textContent = titles[state.view];
  const root = $("#content");
  if (state.view === "dashboard") root.innerHTML = dashboardTpl();
  if (state.view === "settings") root.innerHTML = settingsTpl();
  if (state.view === "categories") root.innerHTML = categoriesTpl();
  if (state.view === "products") root.innerHTML = productsTpl();
  if (state.view === "cards") root.innerHTML = cardsTpl();
  if (state.view === "orders") root.innerHTML = ordersTpl();
  bindView();
}

function stockOf(productId) {
  return state.data.cards.filter((card) => card.productId === productId && !card.used).length;
}

function dashboardTpl() {
  const revenue = state.data.orders.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.price || 0), 0);
  return `
    <div class="grid">
      <div class="stat"><strong>${state.data.products.length}</strong><span>商品</span></div>
      <div class="stat"><strong>${state.data.categories.length}</strong><span>分类</span></div>
      <div class="stat"><strong>${state.data.cards.filter((item) => !item.used).length}</strong><span>可用卡密</span></div>
      <div class="stat"><strong>${money(revenue)}</strong><span>已确认收入</span></div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><strong>最近订单</strong></div>
      <div class="table-wrap">${ordersTable(state.data.orders.slice(0, 8))}</div>
    </div>
  `;
}

function settingsTpl() {
  const { meta, config } = state.data;
  return `
    <form class="panel" id="settingsForm">
      <div class="panel-head"><strong>基础信息</strong><button class="btn primary" type="submit"><i class="bi bi-save"></i>保存</button></div>
      <div class="panel-body">
        <div class="field"><label>站点名称</label><input name="name" value="${meta.name || ""}"></div>
        <div class="field"><label>副标题</label><input name="subtitle" value="${meta.subtitle || ""}"></div>
        <div class="field"><label>公告</label><textarea name="notice">${meta.notice || ""}</textarea></div>
        <div class="field">
          <label>支付模式</label>
          <select name="mode">
            <option value="manual" ${config.mode === "manual" ? "selected" : ""}>手动收款</option>
            <option value="jump" ${config.mode === "jump" ? "selected" : ""}>跳转支付链接</option>
            <option value="alipay" ${config.mode === "alipay" ? "selected" : ""}>支付宝官方电脑网站支付</option>
            <option value="epay" ${config.mode === "epay" ? "selected" : ""}>易支付</option>
          </select>
        </div>
        <div class="field"><label>支付名称</label><input name="paymentName" value="${config.name || ""}"></div>
        <div class="field"><label>支付说明</label><textarea name="paymentNote">${config.note || ""}</textarea></div>
        <div class="field"><label>支付跳转链接</label><input name="jumpUrl" value="${config.jumpUrl || ""}" placeholder="https://..."></div>
        <div class="panel" style="margin:16px 0">
          <div class="panel-head"><strong>支付宝官方支付</strong></div>
          <div class="panel-body">
            <div class="field"><label>App ID</label><input name="alipayAppId" value="${config.alipayAppId || ""}"></div>
            <div class="field"><label>应用私钥 PKCS8</label><textarea name="alipayPrivateKey" placeholder="-----BEGIN PRIVATE KEY-----">${config.alipayPrivateKey || ""}</textarea></div>
            <div class="field"><label>支付宝公钥</label><textarea name="alipayPublicKey" placeholder="-----BEGIN PUBLIC KEY-----">${config.alipayPublicKey || ""}</textarea></div>
            <div class="field"><label>支付宝网关</label><input name="alipayGateway" value="${config.alipayGateway || "https://openapi.alipay.com/gateway.do"}"></div>
            <div class="field"><label>收款账号 PID，可选</label><input name="alipaySellerId" value="${config.alipaySellerId || ""}"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><strong>易支付</strong></div>
          <div class="panel-body">
            <div class="field"><label>网关地址</label><input name="epayApiUrl" value="${config.epayApiUrl || ""}" placeholder="https://pay.example.com"></div>
            <div class="field"><label>商户 ID</label><input name="epayPid" value="${config.epayPid || ""}"></div>
            <div class="field"><label>商户密钥</label><input name="epayKey" value="${config.epayKey || ""}"></div>
            <div class="field">
              <label>支付类型</label>
              <select name="epayType">
                <option value="alipay" ${config.epayType === "alipay" ? "selected" : ""}>支付宝</option>
                <option value="wxpay" ${config.epayType === "wxpay" ? "selected" : ""}>微信</option>
                <option value="qqpay" ${config.epayType === "qqpay" ? "selected" : ""}>QQ 钱包</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </form>
  `;
}

function categoriesTpl() {
  return `
    <div class="panel">
      <div class="panel-head"><strong>新增分类</strong></div>
      <div class="panel-body">
        <form id="categoryForm" class="nav-actions">
          <input name="name" placeholder="分类名称" required>
          <input name="sort" type="number" placeholder="排序" value="10">
          <button class="btn primary" type="submit"><i class="bi bi-plus-lg"></i>添加</button>
        </form>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><strong>分类列表</strong></div>
      <div class="table-wrap">
        <table><thead><tr><th>名称</th><th>排序</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
        ${state.data.categories.map((item) => `<tr><td>${item.name}</td><td>${item.sort}</td><td>${item.active ? "启用" : "停用"}</td><td>${item.createdAt}</td><td><button class="btn" data-edit-category="${item.id}"><i class="bi bi-pencil"></i>编辑</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">暂无分类</td></tr>`}
        </tbody></table>
      </div>
    </div>
  `;
}

function productOptions(selected = "") {
  return state.data.products.map((item) => `<option value="${item.id}" ${selected === item.id ? "selected" : ""}>${item.name}</option>`).join("");
}

function categoryOptions(selected = "") {
  return state.data.categories.map((item) => `<option value="${item.id}" ${selected === item.id ? "selected" : ""}>${item.name}</option>`).join("");
}

function productsTpl() {
  return `
    <div class="panel">
      <div class="panel-head"><strong>新增商品</strong></div>
      <div class="panel-body">
        <form id="productForm">
          <div class="field"><label>分类</label><select name="categoryId">${categoryOptions()}</select></div>
          <div class="field"><label>商品名称</label><input name="name" required></div>
          <div class="field"><label>价格</label><input name="price" type="number" step="0.01" min="0" required></div>
          <div class="field"><label>成本</label><input name="cost" type="number" step="0.01" min="0" value="0"></div>
          <div class="field"><label>说明</label><textarea name="description"></textarea></div>
          <button class="btn primary" type="submit"><i class="bi bi-plus-lg"></i>添加商品</button>
        </form>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><strong>商品列表</strong></div>
      <div class="table-wrap">
        <table><thead><tr><th>商品</th><th>分类</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr></thead><tbody>
        ${state.data.products.map((item) => {
          const cat = state.data.categories.find((c) => c.id === item.categoryId);
          return `<tr><td>${item.name}</td><td>${cat ? cat.name : "-"}</td><td>${money(item.price)}</td><td>${stockOf(item.id)}</td><td>${item.active ? "上架" : "下架"}</td><td><button class="btn" data-edit-product="${item.id}"><i class="bi bi-pencil"></i>编辑</button></td></tr>`;
        }).join("") || `<tr><td colspan="6" class="empty">暂无商品</td></tr>`}
        </tbody></table>
      </div>
    </div>
  `;
}

function cardsTpl() {
  return `
    <div class="panel">
      <div class="panel-head"><strong>批量导入卡密</strong></div>
      <div class="panel-body">
        <form id="cardsForm">
          <div class="field"><label>选择商品</label><select name="productId" required>${productOptions()}</select></div>
          <div class="field"><label>卡密内容</label><textarea name="cards" placeholder="每行一条卡密" required></textarea></div>
          <button class="btn primary" type="submit"><i class="bi bi-upload"></i>导入</button>
        </form>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-head"><strong>库存列表</strong></div>
      <div class="table-wrap">
        <table><thead><tr><th>商品</th><th>卡密</th><th>状态</th><th>时间</th></tr></thead><tbody>
        ${state.data.cards.slice(0, 200).map((item) => {
          const product = state.data.products.find((p) => p.id === item.productId);
          return `<tr><td>${product ? product.name : "-"}</td><td><code>${item.content}</code></td><td>${item.used ? '<span class="badge warn">已售</span>' : '<span class="badge ok">可用</span>'}</td><td>${item.createdAt}</td></tr>`;
        }).join("") || `<tr><td colspan="4" class="empty">暂无卡密</td></tr>`}
        </tbody></table>
      </div>
    </div>
  `;
}

function ordersTable(orders) {
  return `
    <table><thead><tr><th>订单号</th><th>商品</th><th>价格</th><th>状态</th><th>联系方式</th><th>操作</th></tr></thead><tbody>
    ${orders.map((item) => `
      <tr>
        <td>${item.no}</td>
        <td>${item.productName}</td>
        <td>${money(item.price)}</td>
        <td>${statusBadge(item.status)}</td>
        <td>${item.email || "-"}</td>
        <td>${orderAction(item)}</td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="empty">暂无订单</td></tr>`}
    </tbody></table>
  `;
}

function statusBadge(status) {
  if (status === "paid") return '<span class="badge ok">已发卡</span>';
  if (status === "cancelled") return '<span class="badge">已取消</span>';
  return '<span class="badge warn">待确认</span>';
}

function orderAction(item) {
  if (item.status === "paid") return (item.cards || []).map((card) => `<code>${card}</code>`).join("<br>");
  if (item.status === "cancelled") return "-";
  return `
    <button class="btn primary" data-pay="${item.id}"><i class="bi bi-check2"></i>确认发卡</button>
    <button class="btn danger" data-cancel="${item.id}"><i class="bi bi-x-lg"></i>取消</button>
  `;
}

function ordersTpl() {
  return `<div class="panel"><div class="panel-head"><strong>订单列表</strong></div><div class="table-wrap">${ordersTable(state.data.orders)}</div></div>`;
}

function bindView() {
  const settings = $("#settingsForm");
  if (settings) settings.onsubmit = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(settings));
    await api("/api/admin/settings", { method: "POST", body: JSON.stringify(form) });
    setMessage("已保存", "ok");
    await refresh();
  };

  const category = $("#categoryForm");
  if (category) category.onsubmit = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(category));
    await api("/api/admin/categories", { method: "POST", body: JSON.stringify(form) });
    await refresh();
  };

  const product = $("#productForm");
  if (product) product.onsubmit = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(product));
    await api("/api/admin/products", { method: "POST", body: JSON.stringify(form) });
    await refresh();
  };

  const cards = $("#cardsForm");
  if (cards) cards.onsubmit = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(cards));
    await api("/api/admin/cards", { method: "POST", body: JSON.stringify(form) });
    await refresh();
  };

  document.querySelectorAll("[data-pay]").forEach((btn) => {
    btn.onclick = async () => {
      await api("/api/admin/orders/mark-paid", {
        method: "POST",
        body: JSON.stringify({ orderId: btn.dataset.pay }),
      });
      await refresh();
    };
  });

  document.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.onclick = async () => {
      await api("/api/admin/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ orderId: btn.dataset.cancel }),
      });
      await refresh();
    };
  });

  document.querySelectorAll("[data-edit-category]").forEach((btn) => {
    btn.onclick = async () => {
      const item = state.data.categories.find((cat) => cat.id === btn.dataset.editCategory);
      const name = prompt("分类名称", item.name);
      if (!name) return;
      const sort = prompt("排序", item.sort);
      await api(`/api/admin/categories/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...item, name, sort: Number(sort || item.sort), active: item.active }),
      });
      await refresh();
    };
  });

  document.querySelectorAll("[data-edit-product]").forEach((btn) => {
    btn.onclick = async () => {
      const item = state.data.products.find((product) => product.id === btn.dataset.editProduct);
      const name = prompt("商品名称", item.name);
      if (!name) return;
      const price = prompt("价格", item.price);
      const active = confirm("点击确定保持上架，点击取消改为下架");
      await api(`/api/admin/products/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...item, name, price: Number(price || item.price), active }),
      });
      await refresh();
    };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#loginForm").addEventListener("submit", login);
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.onclick = () => navigate(btn.dataset.view);
  });
  $("#logout").onclick = async () => {
    await api("/api/admin/logout", { method: "POST" });
    location.reload();
  };
  bootstrap();
});
