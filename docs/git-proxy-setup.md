# Git 代理配置（解决 GitHub 推送卡住）

当 `git push` 卡在 `Pushing to https://github.com/...` 时，多为网络/GFW 导致。可任选其一。

---

## 方案一：为 Git 设置 HTTP/HTTPS 代理（推荐，本机已有代理时）

若你已在本机运行代理（Clash / V2Ray / Surge 等），记下 **代理端口**（如 Clash 常用 `7890`，V2Ray 常用 `1080` 或 `10809`），在终端执行：

```bash
# HTTP/HTTPS 代理（把 7890 改成你的代理端口）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 仅对 GitHub 走代理（推荐，避免其他 git 仓库也走代理）
git config --global http.https://github.com.proxy http://127.0.0.1:7890
git config --global https.https://github.com.proxy http://127.0.0.1:7890
```

若代理是 **SOCKS5**（如端口 7891）：

```bash
git config --global http.https://github.com.proxy socks5://127.0.0.1:7891
git config --global https.https://github.com.proxy socks5://127.0.0.1:7891
```

然后重试：

```bash
cd "/Users/solidcore/Desktop/HH Group/hh-unified-web" && git push
```

**取消代理：**

```bash
git config --global --unset http.https://github.com.proxy
git config --global --unset https.https://github.com.proxy
```

---

## 方案二：改用 SSH 推送（22 端口被封时可走 443）

HTTPS 被墙时，可改用 SSH。需先添加 SSH 公钥到 GitHub，再改 remote 并推送。

### 1. 生成 SSH 密钥（若还没有）

```bash
ssh -T git@github.com
# 若提示 "Permission denied (publickey)"，说明需要添加公钥
ls -la ~/.ssh/id_ed25519.pub || ls -la ~/.ssh/id_rsa.pub
# 若没有，生成：
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# 复制输出，到 GitHub → Settings → SSH and GPG keys → New SSH key 粘贴保存
```

### 2. 若 SSH 22 端口也被封：改用 443 端口

在 `~/.ssh/config` 中加入（没有该文件就新建）：

```
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
```

然后测试：

```bash
ssh -T git@github.com
```

### 3. 将本仓库改为 SSH 地址并推送

```bash
cd "/Users/solidcore/Desktop/HH Group/hh-unified-web"
git remote set-url origin git@github.com:hewenlian123/HHGroup.git
git push
```

---

## 常见代理端口参考

| 软件  | HTTP 代理端口 | SOCKS5 端口 |
| ----- | ------------- | ----------- |
| Clash | 7890          | 7891        |
| V2Ray | 10809 或 1080 | 1080        |
| Surge | 6152          | 6153        |

在代理软件里确认「允许来自局域网的连接」或「系统代理」已开启，并记下终端/命令行用的端口（有时与系统代理不同）。
