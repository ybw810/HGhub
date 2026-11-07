#!/usr/bin/env node
/**
 * 把仓库里跟踪的 iOS 图标同步进生成的 iOS 工程。
 *
 * 为什么需要：`src-tauri/gen/` 不入库，CI 和换机器都会重新 `tauri ios init`，
 * 而 init 只会写 Tauri 模板自带的默认图标，不会读 `src-tauri/icons/ios/`。
 * （安卓那边已经有同款脚本 sync-android-icons.mjs，这是 iOS 版。）
 *
 * 用法：
 *   node scripts/sync-ios-icons.mjs
 *   （先跑 tauri ios init 生成 gen/apple 再跑；没生成就跳过，不报错）
 */
import { cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src-tauri", "icons", "ios");
const genApple = join(root, "src-tauri", "gen", "apple");

if (!existsSync(src)) {
  console.log(`[icons] 跳过：缺少 ${src}`);
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
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`[icons] iOS 图标已同步 → ${dest}`);
}
