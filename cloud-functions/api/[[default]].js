const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const text = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
const hash = async (input) => {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const defaults = {
  site: {
    name: "卡密商店",
    subtitle: "简洁的自动发卡站",
    notice: "请先登录后台配置分类、商品、支付与卡密。",
  },
  payment: {
    mode: "manual",
    name: "手动收款",
    note: "支持自定义支付说明、收款二维码或跳转链接。",
    jumpUrl: "",
    alipayAppId: "",
    alipayPrivateKey: "",
    alipayPublicKey: "",
    alipayGateway: "https://openapi.alipay.com/gateway.do",
    alipaySellerId: "",
    epayApiUrl: "",
    epayPid: "",
    epayKey: "",
    epayType: "alipay",
  },
};

const kv = globalThis.KV;
const dataKey = "cardshop_data";

const formatTime = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

function paymentPublic(config) {
  return {
    mode: config.mode,
    name: config.name,
    note: config.note,
    jumpUrl: config.mode === "jump" ? config.jumpUrl : "",
  };
}

function formPublicPayment(payment) {
  return {
    mode: payment.mode,
    name: payment.name,
    note: payment.note,
    jumpUrl: payment.jumpUrl || "",
    actionUrl: payment.actionUrl || "",
  };
}

function sortedString(params, includeEmpty = false) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type")
    .filter((key) => includeEmpty || (params[key] !== undefined && params[key] !== null && params[key] !== ""))
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function withPem(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("BEGIN")) return trimmed;
  const lines = trimmed.match(/.{1,64}/g)?.join("\n") || trimmed;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function pemToBytes(pem) {
  if (!pem.includes("BEGIN")) {
    const binary = atob(pem);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function rsaSign(content, privateKey) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(withPem(privateKey, "PRIVATE KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(content));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function rsaVerify(content, signature, publicKey) {
  const key = await crypto.subtle.importKey(
    "spki",
    pemToBytes(withPem(publicKey, "PUBLIC KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64ToBytes(signature), new TextEncoder().encode(content));
}

function md5(content) {
  const rotate = (x, c) => (x << c) | (x >>> (32 - c));
  const add = (x, y) => (x + y) | 0;
  const cmn = (q, a, b, x, s, t) => add(rotate(add(add(a, q), add(x, t)), s), b);
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);
  const bytes = new TextEncoder().encode(content);
  const words = [];
  for (let i = 0; i < bytes.length; i += 1) words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | (0x80 << ((bytes.length % 4) * 8));
  words[(((bytes.length + 8) >> 6) + 1) * 16 - 2] = bytes.length * 8;
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const oa = a;
    const ob = b;
    const oc = c;
    const od = d;
    a = ff(a, b, c, d, words[i], 7, -680876936);
    d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063);
    b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, words[i + 5], 4, -378558);
    d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = hh(b, c, d, a, words[i + 2], 23, -995338651);
    a = ii(a, b, c, d, words[i], 6, -198630844);
    d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = ii(b, c, d, a, words[i + 9], 21, -343485551);
    a = add(a, oa);
    b = add(b, ob);
    c = add(c, oc);
    d = add(d, od);
  }
  return [a, b, c, d]
    .map((n) => [0, 8, 16, 24].map((s) => ((n >>> s) & 255).toString(16).padStart(2, "0")).join(""))
    .join("");
}

function queryUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

function originOf(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function issueOrder(data, order) {
  if (order.status === "paid") return order;
  const available = data.cards.filter((item) => item.productId === order.productId && !item.used);
  if (!available.length) throw new Error("库存不足");
  const card = available[0];
  card.used = true;
  card.usedAt = now();
  order.status = "paid";
  order.paidAt = now();
  order.cards = [card.content];
  return order;
}

async function createAlipayPayment(request, config, order) {
  if (!config.alipayAppId || !config.alipayPrivateKey) throw new Error("支付宝参数未配置");
  const origin = originOf(request);
  const bizContent = JSON.stringify({
    out_trade_no: order.no,
    total_amount: Number(order.price).toFixed(2),
    subject: order.productName,
    product_code: "FAST_INSTANT_TRADE_PAY",
    seller_id: config.alipaySellerId || undefined,
  });
  const params = {
    app_id: config.alipayAppId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatTime(),
    version: "1.0",
    notify_url: `${origin}/api/pay/alipay/notify`,
    return_url: `${origin}/?order=${encodeURIComponent(order.no)}`,
    biz_content: bizContent,
  };
  params.sign = await rsaSign(sortedString(params), config.alipayPrivateKey);
  return {
    mode: "alipay",
    name: "支付宝官方支付",
    note: "将跳转至支付宝官方收银台，支付成功后自动发卡。",
    actionUrl: queryUrl(config.alipayGateway || defaults.payment.alipayGateway, params),
  };
}

function createEpayPayment(request, siteMeta, config, order) {
  if (!config.epayApiUrl || !config.epayPid || !config.epayKey) throw new Error("易支付参数未配置");
  const origin = originOf(request);
  const base = config.epayApiUrl.replace(/\/+$/, "");
  const params = {
    pid: config.epayPid,
    type: config.epayType || "alipay",
    out_trade_no: order.no,
    notify_url: `${origin}/api/pay/epay/notify`,
    return_url: `${origin}/?order=${encodeURIComponent(order.no)}`,
    name: order.productName,
    money: Number(order.price).toFixed(2),
    sitename: siteMeta?.name || defaults.site.name,
  };
  params.sign = md5(`${sortedString(params)}${config.epayKey}`);
  params.sign_type = "MD5";
  return {
    mode: "epay",
    name: "易支付",
    note: "将跳转至易支付收银台，支付成功后自动发卡。",
    actionUrl: queryUrl(`${base}/submit.php`, params),
  };
}

async function readData() {
  const raw = kv ? await kv.get(dataKey) : null;
  const saved = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!saved) {
    return {
      meta: defaults.site,
      config: defaults.payment,
      categories: [
        { id: uid("cat"), name: "热门商品", sort: 10, active: true, createdAt: now() },
      ],
      products: [],
      cards: [],
      orders: [],
      admins: [],
      sessions: [],
    };
  }
  return {
    meta: saved.meta || defaults.site,
    config: saved.config || defaults.payment,
    categories: saved.categories || [],
    products: saved.products || [],
    cards: saved.cards || [],
    orders: saved.orders || [],
    admins: saved.admins || [],
    sessions: saved.sessions || [],
  };
}

async function writeData(data) {
  if (!kv) throw new Error("KV not bound");
  await kv.put(dataKey, JSON.stringify(data));
}

function authToken(request) {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/cardshop_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function requireAdmin(request, data) {
  const token = authToken(request);
  const session = data.sessions.find((item) => item.token === token && item.expiresAt > now());
  if (!session) return null;
  const admin = data.admins.find((item) => item.id === session.adminId);
  return admin || null;
}

function setTokenHeader(token) {
  return `cardshop_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

function publicOrder(order) {
  return {
    id: order.id,
    no: order.no,
    productId: order.productId,
    productName: order.productName,
    price: order.price,
    email: order.email,
    status: order.status,
    cards: order.cards || [],
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
  };
}

async function route(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const data = await readData();

  if (method === "GET" && path === "/health") {
    return json({ ok: true, time: now() });
  }

  if (method === "GET" && path === "/public/config") {
    return json({ meta: data.meta, config: paymentPublic(data.config), categories: data.categories.filter((item) => item.active) });
  }

  if (method === "GET" && path === "/public/products") {
    const items = data.products
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        active: item.active,
        stock: data.cards.filter((card) => card.productId === item.id && !card.used).length,
      }));
    return json({ products: items });
  }

  if (method === "POST" && path === "/orders/create") {
    const body = await request.json();
    const product = data.products.find((item) => item.id === body.productId && item.active);
    if (!product) return json({ error: "商品不存在" }, 404);
    const order = {
      id: uid("ord"),
      no: `OD${Date.now().toString(36).toUpperCase()}`,
      productId: product.id,
      productName: product.name,
      price: product.price,
      email: String(body.email || "").trim(),
      status: data.config.mode === "manual" ? "pending" : "await_pay",
      createdAt: now(),
      paidAt: null,
      cards: [],
    };
    data.orders.unshift(order);
    await writeData(data);
    let payment = paymentPublic(data.config);
    if (data.config.mode === "alipay") payment = await createAlipayPayment(request, data.config, order);
    if (data.config.mode === "epay") payment = createEpayPayment(request, data.meta, data.config, order);
    return json({ order: publicOrder(order), payment: formPublicPayment(payment) });
  }

  if (method === "GET" && path.startsWith("/orders/")) {
    const no = decodeURIComponent(path.split("/").pop() || "");
    const order = data.orders.find((item) => item.no === no || item.id === no);
    if (!order) return json({ error: "订单不存在" }, 404);
    return json({ order: publicOrder(order), payment: paymentPublic(data.config) });
  }

  if (method === "POST" && path === "/pay/alipay/notify") {
    const form = await request.formData();
    const params = Object.fromEntries(form.entries());
    const content = sortedString(params);
    const ok = params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED";
    const verified = await rsaVerify(content, params.sign, data.config.alipayPublicKey);
    if (!verified || !ok) return text("fail", 400);
    const order = data.orders.find((item) => item.no === params.out_trade_no);
    if (!order) return text("fail", 404);
    if (Number(params.total_amount) !== Number(order.price)) return text("fail", 400);
    await issueOrder(data, order);
    await writeData(data);
    return text("success");
  }

  if (path === "/pay/epay/notify") {
    const params = method === "POST" ? Object.fromEntries((await request.formData()).entries()) : Object.fromEntries(url.searchParams.entries());
    const expected = md5(`${sortedString(params)}${data.config.epayKey}`);
    const ok = String(params.trade_status || "").toUpperCase() === "TRADE_SUCCESS" || String(params.status || "") === "1";
    if (expected !== String(params.sign || "").toLowerCase() || !ok) return text("fail", 400);
    const order = data.orders.find((item) => item.no === params.out_trade_no);
    if (!order) return text("fail", 404);
    if (Number(params.money) !== Number(order.price)) return text("fail", 400);
    await issueOrder(data, order);
    await writeData(data);
    return text("success");
  }

  if (method === "POST" && path === "/admin/login") {
    const body = await request.json();
    const username = String(body.username || "");
    const password = String(body.password || "");
    const passwordHash = await hash(password);

    let admin = data.admins.find((item) => item.username === username);
    if (!admin) {
      if (data.admins.length) return json({ error: "账号或密码错误" }, 401);
      admin = {
        id: uid("adm"),
        username,
        passwordHash,
        role: "owner",
        createdAt: now(),
      };
      data.admins.push(admin);
    } else if (admin.passwordHash !== passwordHash) {
      return json({ error: "账号或密码错误" }, 401);
    }

    const token = uid("sess");
    data.sessions = data.sessions.filter((item) => item.expiresAt > now());
    data.sessions.push({
      token,
      adminId: admin.id,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    await writeData(data);
    return json({ ok: true, admin: { id: admin.id, username: admin.username, role: admin.role } }, 200, {
      "set-cookie": setTokenHeader(token),
    });
  }

  if (method === "POST" && path === "/admin/logout") {
    const token = authToken(request);
    data.sessions = data.sessions.filter((item) => item.token !== token);
    await writeData(data);
    return json({ ok: true }, 200, { "set-cookie": "cardshop_token=; Path=/; Max-Age=0; SameSite=Lax" });
  }

  const admin = await requireAdmin(request, data);
  if (!admin) return json({ error: "未登录" }, 401);

  if (method === "GET" && path === "/admin/bootstrap") {
    return json({ admin: { id: admin.id, username: admin.username, role: admin.role }, data });
  }

  if (method === "POST" && path === "/admin/settings") {
    const body = await request.json();
    data.meta = {
      ...data.meta,
      name: String(body.name || data.meta.name),
      subtitle: String(body.subtitle || data.meta.subtitle),
      notice: String(body.notice || data.meta.notice),
    };
    data.config = {
      ...data.config,
      mode: String(body.mode || data.config.mode),
      name: String(body.paymentName || data.config.name),
      note: String(body.paymentNote || data.config.note),
      jumpUrl: String(body.jumpUrl || data.config.jumpUrl),
      alipayAppId: String(body.alipayAppId || data.config.alipayAppId || ""),
      alipayPrivateKey: String(body.alipayPrivateKey || data.config.alipayPrivateKey || ""),
      alipayPublicKey: String(body.alipayPublicKey || data.config.alipayPublicKey || ""),
      alipayGateway: String(body.alipayGateway || data.config.alipayGateway || defaults.payment.alipayGateway),
      alipaySellerId: String(body.alipaySellerId || data.config.alipaySellerId || ""),
      epayApiUrl: String(body.epayApiUrl || data.config.epayApiUrl || ""),
      epayPid: String(body.epayPid || data.config.epayPid || ""),
      epayKey: String(body.epayKey || data.config.epayKey || ""),
      epayType: String(body.epayType || data.config.epayType || "alipay"),
    };
    await writeData(data);
    return json({ ok: true, meta: data.meta, config: data.config });
  }

  if (method === "GET" && path === "/admin/categories") return json({ categories: data.categories });
  if (method === "POST" && path === "/admin/categories") {
    const body = await request.json();
    const item = {
      id: uid("cat"),
      name: String(body.name || ""),
      sort: Number(body.sort || 0),
      active: body.active !== false,
      createdAt: now(),
    };
    data.categories.unshift(item);
    await writeData(data);
    return json({ ok: true, category: item });
  }
  if (method === "PUT" && path.startsWith("/admin/categories/")) {
    const id = decodeURIComponent(path.split("/").pop() || "");
    const body = await request.json();
    const item = data.categories.find((category) => category.id === id);
    if (!item) return json({ error: "分类不存在" }, 404);
    item.name = String(body.name || item.name);
    item.sort = Number(body.sort ?? item.sort);
    item.active = body.active !== false;
    await writeData(data);
    return json({ ok: true, category: item });
  }

  if (method === "GET" && path === "/admin/products") return json({ products: data.products });
  if (method === "POST" && path === "/admin/products") {
    const body = await request.json();
    const item = {
      id: uid("prd"),
      categoryId: String(body.categoryId || ""),
      name: String(body.name || ""),
      description: String(body.description || ""),
      price: Number(body.price || 0),
      cost: Number(body.cost || 0),
      active: body.active !== false,
      createdAt: now(),
    };
    data.products.unshift(item);
    await writeData(data);
    return json({ ok: true, product: item });
  }
  if (method === "PUT" && path.startsWith("/admin/products/")) {
    const id = decodeURIComponent(path.split("/").pop() || "");
    const body = await request.json();
    const item = data.products.find((product) => product.id === id);
    if (!item) return json({ error: "商品不存在" }, 404);
    item.categoryId = String(body.categoryId || item.categoryId);
    item.name = String(body.name || item.name);
    item.description = String(body.description ?? item.description);
    item.price = Number(body.price ?? item.price);
    item.cost = Number(body.cost ?? item.cost);
    item.active = body.active !== false;
    await writeData(data);
    return json({ ok: true, product: item });
  }

  if (method === "GET" && path === "/admin/cards") return json({ cards: data.cards });
  if (method === "POST" && path === "/admin/cards") {
    const body = await request.json();
    const lines = String(body.cards || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const cards = lines.map((content) => ({
      id: uid("crd"),
      productId: String(body.productId || ""),
      content,
      used: false,
      createdAt: now(),
      usedAt: null,
    }));
    data.cards.unshift(...cards);
    await writeData(data);
    return json({ ok: true, count: cards.length });
  }

  if (method === "GET" && path === "/admin/orders") return json({ orders: data.orders.map(publicOrder) });
  if (method === "POST" && path === "/admin/orders/mark-paid") {
    const body = await request.json();
    const order = data.orders.find((item) => item.id === body.orderId || item.no === body.orderNo);
    if (!order) return json({ error: "订单不存在" }, 404);
    if (order.status === "paid") return json({ ok: true, order: publicOrder(order) });
    const available = data.cards.filter((item) => item.productId === order.productId && !item.used);
    if (!available.length) return json({ error: "库存不足" }, 400);
    const card = available[0];
    card.used = true;
    card.usedAt = now();
    order.status = "paid";
    order.paidAt = now();
    order.cards = [card.content];
    await writeData(data);
    return json({ ok: true, order: publicOrder(order) });
  }
  if (method === "POST" && path === "/admin/orders/cancel") {
    const body = await request.json();
    const order = data.orders.find((item) => item.id === body.orderId || item.no === body.orderNo);
    if (!order) return json({ error: "订单不存在" }, 404);
    if (order.status === "paid") return json({ error: "已发卡订单不能取消" }, 400);
    order.status = "cancelled";
    await writeData(data);
    return json({ ok: true, order: publicOrder(order) });
  }

  return text("not found", 404);
}

export async function onRequest(context) {
  try {
    return await route(context.request);
  } catch (error) {
    return json({ error: error.message || "internal error" }, 500);
  }
}
