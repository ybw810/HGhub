# HGhub iOS 打包（未签名 IPA + 免费 Apple ID 侧载）

> 状态：已准备好，还没在真机上验证过播放。
> 本机（Linux）跑不了 iOS 构建，Tauri 的 `ios` 子命令只在 macOS 上有，
> 所以打包走 GitHub Actions 的 macOS runner。

## 改了什么（相对上游 v1.1.0）

1. **iOS 不再被误判成 macOS 桌面**：`src/api.ts`
   - iPhone 的 UA 里有 "like Mac OS X"，原来 `isMacos` 为真，`platform` 变成
     `macos`，进桌面壳（侧边栏 + 标题栏），手机上没法用。
   - 现在先判 iPhone/iPad/iPod，`platform` 映射成 `android`，复用安卓那套
     移动端 UI（MobileShell / 底部 TabBar），`isIOS` 只用来区分显示文案。
   - 自定义协议仍按 iOS 走 `hg://localhost`（Rust 侧本来就是这么写的）。
   - `src/pages/Profile.tsx` / `Settings.tsx` 底部文案在 iOS 上显示 "iOS"。
   - 前端已在本机验证：`tsc --noEmit && vite build` 通过。
2. **Rust 外链打开**：`src-tauri/src/api.rs`
   - iOS 原来会落到 Linux 的 `xdg-open` 分支，肯定失败；现在和安卓一样
     返回 "移动端请手动在浏览器打开"。
   - `lib.rs` 本来就有 `#[cfg_attr(mobile, tauri::mobile_entry_point)]`，
     不用改。
3. **iOS 配置**：`src-tauri/tauri.ios.conf.json`（新增）
   - `bundle.iOS.minimumSystemVersion: "17.1"`。iOS 17.1+ 才有 Managed
     Media Source，hls.js（本项目 1.6.15）才能在 iPhone 上工作，见下面播放。
   - bundle id 沿用 `com.hghub.huangguo`，第一次装就定死，别中途改。
4. **图标同步**：`scripts/sync-ios-icons.mjs`（新增，仿照安卓版）
   - `tauri ios init` 只写默认图标，`src-tauri/icons/ios/` 里已有的图标
     需要同步进 `gen/apple/.../AppIcon.appiconset/`。
   - `tauri.conf.json` 的 `beforeBuildCommand` 已加上这一步。
5. **CI**：`.github/workflows/ios.yml`（新增）
   - `macos-15` runner，Node 22 + pnpm 10 + Rust（`aarch64-apple-ios`），
     `pnpm tauri ios init --ci`，再 `pnpm tauri ios build --no-sign --ci`，
     产物上传为 `ios-unsigned`。
   - 注意：`--no-sign` 在 @tauri-apps/cli 2.12.4 源码里确认存在；本仓库
     pin 的是 2.10.1。工作流里先检查 `ios build --help` 有没有这个参数，
     没有就报错，届时把 `package.json` 里的 `@tauri-apps/cli` 升到 `^2.12`
     再跑一次。

## 怎么跑（需要一个自己的 fork）

1. 在 GitHub 上 fork `Minireel/HGhub` 到自己的账号。
2. 把本分支的改动推到 fork 的 `main`（或任意分支）。
3. 打开 fork 的 Actions 页，手动跑 `iOS (unsigned IPA)` 这个工作流。
4. 跑完在 Artifacts 里下载 `ios-unsigned`，得到未签名的 `.ipa`。
5. 手机上开开发者模式：设置 → 隐私与安全 → 开发者模式。
6. 用 AltStore 或 SideStore + 自己的免费 Apple ID 签名安装：
   - AltStore：电脑装 AltServer，USB 配对一次，之后同 Wi-Fi 自动续签。
   - SideStore：配对一次，之后手机上用自带 VPN 自己续签。
   - 免费证书 7 天过期、最多 3 个 App，过期重签一次就行。
   - 建议用小号 Apple ID 签，别用主力号。
   - ESign 单独不够：它不发证书，得自己带 `.p12` + 描述文件。
7. 代理：iPhone 上用 Clash / Quantumult X 的 VPN（TUN）模式，别只填
   Wi-Fi 代理——和安卓版一样，Rust 的网络层不认 Wi-Fi 手填代理。

## 播放：最大的未知数，先测这三点

iOS 上 `Hls.isSupported()` 在 17.1+ 应该为真（Managed Media Source），
`VideoSurface` / `Player` 里 `hls.loadSource(hg://localhost/…m3u8)`，
hls.js 经 XHR 去拿播放列表 / 分片 / key，走 WKWebView 的自定义协议
处理器到 Rust 后端，这是能走通的路。

但如果它悄悄回落到原生播放（`video.src = hg://…`），AVFoundation
不认 `hg:` 自定义协议，视频会直接失败。所以真机第一件事是验证：

1. 首页 / 封面能出来吗？（封面也是走 `hg://localhost/img?u=`）
2. 点一个剧能播吗？能播就是 hls.js + MMS 走通了。
3. 不能播的话，在 Safari Web Inspector 里看 `Hls.isSupported()`、
   `'ManagedMediaSource' in window`，以及 `video.src` 到底被设成了什么。

如果第 3 步确认是回落到原生播放，下一版要改的是播放器：iOS 上永远
不要把 `hg://` 赋给 `video.src`，只让 hls.js 拿，必要时把分片/key
先解密/代理成 `https` 直链再给原生播放器。

## 如果 CI 报错

- `ios build --help` 里没有 `--no-sign`：升 `@tauri-apps/cli` 到 `^2.12`。
- 找不到 `.ipa`：先看 "列出产物" 那步的输出，`--no-sign` 在某些版本
  只出 `.xcarchive` / `.app`，那时再按 `Payload/<App>.app` 打包成 `.ipa`。
- 图标还是默认的 Tauri 图标：`sync-ios-icons.mjs` 没跑到，检查
  `gen/apple` 里的 `AppIcon.appiconset` 路径。
