#!/usr/bin/env node
'use strict';
// Node バージョンガード(>= 22.12)。本体(dist/)は ESM + 新しい Node 前提の構文のため、
// 古い Node ではパース時点で意味不明な SyntaxError になる。
// このランチャーだけは Node 12 でも解釈できる CommonJS + 旧構文で書くこと。
var parts = process.versions.node.split('.');
var major = parseInt(parts[0], 10);
var minor = parseInt(parts[1], 10);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('');
  console.error('  servicenow-mcp requires Node.js >= 22.12 (current: v' + process.versions.node + ')');
  console.error('  servicenow-mcp の実行には Node.js 22.12 以上が必要です(現在: v' + process.versions.node + ')');
  console.error('  https://nodejs.org/ から LTS 版をインストールしてください。');
  console.error('');
  process.exit(1);
}

import('../dist/cli/index.js').catch(function (error) {
  console.error(error);
  process.exit(1);
});
