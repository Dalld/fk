const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
};

const money = (value) => `¥${Number(value || 0).toFixed(2)}`;
const qs = (sel, root = document) => root.querySelector(sel);

const state = {
  categories: [],
  products: [],
  selectedCategory: "all",
  selectedProduct: null,
};

async function loadStore() {
  const [config, products] = await Promise.all([
    api("/api/public/config"),
    api("/api/public/products"),
  ]);
  state.categories = config.categories;
  state.products = products.products;
  qs("#siteName").textContent = config.meta.name;
  qs("#heroTitle").textContent = config.meta.name;
  qs("#heroSubtitle").textContent = config.meta.subtitle;
  qs("#notice").textContent = config.meta.notice;
  qs("#productCount").textContent = state.products.length;
  qs("#stockCount").textContent = state.products.reduce((sum, item) => sum + item.stock, 0);
  renderTabs();
  renderProducts();
}

function renderTabs() {
  const tabs = qs("#categoryTabs");
  tabs.innerHTML = "";
  const items = [{ id: "all", name: "全部" }, ...state.categories.sort((a, b) => b.sort - a.sort)];
  items.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = `tab ${state.selectedCategory === cat.id ? "active" : ""}`;
    btn.textContent = cat.name;
    btn.onclick = () => {
      state.selectedCategory = cat.id;
      renderTabs();
      renderProducts();
    };
    tabs.appendChild(btn);
  });
}

function renderProducts() {
  const grid = qs("#productGrid");
  const products = state.products.filter((item) => state.selectedCategory === "all" || item.categoryId === state.selectedCategory);
  grid.innerHTML = products.length ? "" : '<div class="empty">暂无可售商品</div>';
  products.forEach((product) => {
    const cat = state.categories.find((item) => item.id === product.categoryId);
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `
      <div class="card-body">
        <span class="chip"><i class="bi bi-tag"></i>${cat ? cat.name : "未分类"}</span>
        <h3>${product.name}</h3>
        <p class="muted">${product.description || "自动发卡商品"}</p>
        <div class="price">${money(product.price)}</div>
      </div>
      <div class="card-footer">
        <span class="muted">库存 ${product.stock}</span>
        <button class="btn primary" ${product.stock <= 0 ? "disabled" : ""}>
          <i class="bi bi-cart-check"></i>购买
        </button>
      </div>
    `;
    qs("button", el).onclick = () => openBuy(product);
    grid.appendChild(el);
  });
}

function openBuy(product) {
  state.selectedProduct = product;
  qs("#buyTitle").textContent = product.name;
  qs("#buyPrice").textContent = money(product.price);
  qs("#buyEmail").value = "";
  qs("#orderResult").hidden = true;
  qs("#buyDialog").showModal();
}

async function submitOrder(event) {
  event.preventDefault();
  if (!state.selectedProduct) return;
  const email = qs("#buyEmail").value.trim();
  const result = qs("#orderResult");
  const data = await api("/api/orders/create", {
    method: "POST",
    body: JSON.stringify({ productId: state.selectedProduct.id, email }),
  });
  result.hidden = false;
  result.innerHTML = `
    <strong>订单已创建：${data.order.no}</strong>
    <span>状态：${data.order.status === "pending" ? "待人工确认" : "待支付"}</span>
    <span>支付方式：${data.payment.name}</span>
    <span>${data.payment.note || ""}</span>
    ${data.payment.actionUrl ? `<a class="btn primary" href="${data.payment.actionUrl}" target="_blank" rel="noreferrer"><i class="bi bi-box-arrow-up-right"></i>前往支付</a>` : ""}
    ${data.payment.jumpUrl ? `<a class="btn primary" href="${data.payment.jumpUrl}" target="_blank" rel="noreferrer"><i class="bi bi-box-arrow-up-right"></i>前往支付</a>` : ""}
    <span class="muted">付款后可联系站长或等待后台确认发卡。</span>
  `;
}

async function lookupOrder(event) {
  event.preventDefault();
  const no = qs("#lookupNo").value.trim();
  const box = qs("#lookupResult");
  const data = await api(`/api/orders/${encodeURIComponent(no)}`);
  const cards = data.order.cards?.length
    ? data.order.cards.map((card) => `<code>${card}</code>`).join("<br>")
    : "尚未发卡";
  box.hidden = false;
  box.innerHTML = `
    <strong>${data.order.productName}</strong>
    <span>订单号：${data.order.no}</span>
    <span>状态：${data.order.status}</span>
    <span>卡密：${cards}</span>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  qs("#buyForm").addEventListener("submit", submitOrder);
  qs("#lookupForm").addEventListener("submit", lookupOrder);
  qs("#closeBuy").onclick = () => qs("#buyDialog").close();
  loadStore().then(() => {
    const orderNo = new URL(location.href).searchParams.get("order");
    if (orderNo) {
      qs("#lookupNo").value = orderNo;
      qs("#lookupForm").requestSubmit();
    }
  }).catch((error) => {
    qs("#productGrid").innerHTML = `<div class="empty">${error.message}</div>`;
  });
});
