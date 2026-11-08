#!/usr/bin/env node
/**
 * 把仓库的 HGhub 图标（src-tauri/icons/icon.png，蓝底 Hg）写进生成的 iOS 工程。
 *
 * 为什么不能直接拷文件：
 * `tauri ios init` 只会写 Tauri 模板自带的默认图标（那个青黄「8」），
 * 而仓库 icons/ios/ 里的文件叫 `AppIcon-60x60@2x.png`（带横杠），
 * Xcode 生成的 AppIcon.appiconset 里引用的却是 `AppIcon60x60@2x.png`
 * （不带横杠）。直接拷过去只是多了几个没被引用的文件，构建用的
 * 还是模板默认图标 —— 2026-11-08 打出来的第一个 IPA 就是这么中招的。
 *
 * 做法：读 appiconset 的 Contents.json，按里面列出的每个 filename、
 * size 和 scale，用 sips（macOS 自带）把 icon.png 缩放到对应像素，
 * 原地覆盖掉模板默认图标。文件名一个不动，Contents.json 也不用改。
 *
 * 用法：
 *   node scripts/sync-ios-icons.mjs
 *   （先跑 tauri ios init 生成 gen/apple 再跑；没生成就跳过，不报错；
 *    非 macOS 上没有 sips 会报错退出，让 CI 直接失败而不是静默出默认图标）
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconPng = join(root, "src-tauri", "icons", "icon.png");
const genApple = join(root, "src-tauri", "gen", "apple");

if (!existsSync(iconPng)) {
  console.log(`[icons] 跳过：缺少 ${iconPng}`);
  process.exit(0);
}
if (!existsSync(genApple)) {
  console.log("[icons] 跳过：gen/apple 还没生成（先跑 tauri ios init）");
  process.exit(0);
}

// gen/apple/<App>_iOS/Assets.xcassets/AppIcon.appiconset/
const dests = [];
for (const entry of readdirSync(genApple, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const candidate = join(genApple, entry.name, "Assets.xcassets", "AppIcon.appiconset");
  if (existsSync(candidate)) dests.push(candidate);
}
if (dests.length === 0) {
  console.log("[icons] 跳过：gen/apple 里没找到 AppIcon.appiconset");
  process.exit(0);
}

for (const dest of dests) {
  const contentsPath = join(dest, "Contents.json");
  const contents = JSON.parse(readFileSync(contentsPath, "utf8"));
  let replaced = 0;
  for (const image of contents.images ?? []) {
    if (!image.filename || !image.size || !image.scale) continue;
    // size 如 "60x60"，scale 如 "2x" → 120x120 像素
    const [w] = image.size.split("x").map(Number);
    const scale = Number.parseInt(image.scale, 10);
    const px = w * scale;
    const out = join(dest, image.filename);
    // sips 是 macOS 自带；不在 macOS 上就直接报错，别静默出默认图标
    execFileSync("sips", ["-z", String(px), String(px), iconPng, "--out", out], { stdio: "pipe" });
    replaced++;
  }
  console.log(`[icons] iOS 图标已同步 → ${dest}（覆盖 ${replaced} 个尺寸）`);
}
