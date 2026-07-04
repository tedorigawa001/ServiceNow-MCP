#!/usr/bin/env node
'use strict';
// Node バージョンガード。本体(dist/)は ESM + Node 20 前提の構文のため、
// 古い Node ではパース時点で意味不明な SyntaxError になる。
// このランチャーだけは Node 12 でも解釈できる CommonJS + 旧構文で書くこと。
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 20) {
  console.error('');
  console.error('  servicenow-mcp requires Node.js >= 20 (current: v' + process.versions.node + ')');
  console.error('  servicenow-mcp の実行には Node.js 20 以上が必要です(現在: v' + process.versions.node + ')');
  console.error('  https://nodejs.org/ から LTS 版をインストールしてください。');
  console.error('');
  process.exit(1);
}

import('../dist/cli/index.js').catch(function (error) {
  console.error(error);
  process.exit(1);
});
