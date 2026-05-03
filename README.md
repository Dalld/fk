# EdgeOne Pages Card Shop

用于腾讯云 EdgeOne Pages 的发卡网站 MVP，适合销售合规的虚拟商品、授权码、兑换码等。

## 结构

- `public/` 前台与后台静态页面
- `cloud-functions/api/[[default]].js` API 入口

## 数据绑定

请在 EdgeOne Pages 项目里绑定一个 KV，并暴露为环境变量 `KV`.

KV 用于保存站点设置、分类、商品、卡密、订单和管理员会话。小规模使用可以直接运行；如果订单并发较高，建议把卡密库存和订单迁移到具备事务能力的数据库。

## 运行

本地预览：

```bash
npx serve public -l 4173
```

本地静态预览只能看页面，API 需要部署到 EdgeOne Pages 后由 Cloud Functions 处理。

## 初始化

首次部署后可用后台页面创建管理员账号，再配置商品、分类、卡密与支付接口。

1. 访问 `/admin/`
2. 输入任意用户名和密码，首次登录会创建管理员
3. 添加分类
4. 添加商品
5. 批量导入卡密，每行一条
6. 配置支付模式

## 支付接入

当前内置三种模式：

- `manual` 手动收款：订单创建后后台确认付款并发卡。
- `jump` 跳转支付：配置外部支付链接，用户创建订单后跳转。
- `alipay` 支付宝官方电脑网站支付：生成 `alipay.trade.page.pay` 收银台链接，异步通知验签后自动发卡。
- `epay` 易支付：按常见 `submit.php` + `notify_url` + MD5 签名协议跳转支付，异步通知验签后自动发卡。

支付宝官方支付需要在支付宝开放平台开通电脑网站支付，并在后台填写：

- App ID
- 应用私钥，必须是 PKCS8 格式
- 支付宝公钥
- 支付宝网关，正式环境通常是 `https://openapi.alipay.com/gateway.do`

支付宝异步通知地址：

```text
https://你的域名/api/pay/alipay/notify
```

易支付后台需要填写：

- 网关地址，例如 `https://pay.example.com`
- 商户 ID
- 商户密钥
- 支付类型：`alipay` / `wxpay` / `qqpay`

易支付异步通知地址：

```text
https://你的域名/api/pay/epay/notify
```

不要让前端直接标记订单已支付。必须以支付平台异步通知验签结果为准。

## 部署

在 EdgeOne Pages 中导入该目录：

- 构建命令：留空
- 输出目录：`public`
- 函数目录：`cloud-functions`
- KV 绑定变量名：`KV`

项目根目录已经包含 `edgeone.json`，会覆盖输出目录为 `public`。修改后需要提交代码并重新部署。

## 404 排查

如果打开 Pages 域名显示 `404: NOT_FOUND`，通常是没有在发布产物根目录找到 `index.html`。

请检查：

- 仓库根目录是否就是本项目目录。如果你的仓库外面还有一层目录，Root Directory 要填 `edgeone-card-shop`。
- Output Directory 必须是 `public`，因为首页文件在 `public/index.html`。
- 重新提交 `edgeone.json` 后要触发一次新的部署，旧部署不会自动变化。
- 部署日志里应能看到发布产物包含 `index.html`、`admin/index.html`、`assets/app.js`。

正确访问地址：

```text
https://你的域名/
https://你的域名/admin/
```

## 合规提醒

只用于销售你有权销售的数字商品。不要销售盗版软件、绕过授权的激活码、涉赌、涉黄、诈骗或其他违反平台规则的内容。
