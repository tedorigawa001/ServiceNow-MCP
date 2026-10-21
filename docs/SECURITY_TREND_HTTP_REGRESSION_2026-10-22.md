# trend_query / HTTP Host 回帰検証（2026-10-22）

## 対象と境界

- `trend_query`：呼び出し引数の `periods` が未検証のままループ回数になる。巨大な数では減算しても値が変わらず、上流エラーも各月の空データとして吸収するため終了しない。
- HTTP：認証より前、既存の try/catch より外で Host を URL の基底に使用していた。不正値で発生した reject を HTTP listener が捕捉せず、プロセス停止につながる。
- 既存の完了済みスキャン・証拠・履歴は変更しない。今回の対象は上記2点のみ。

## 修正

1. スキーマと実行時の両方で `periods` を整数1〜120に制限。省略時のみ6を採用し、無効値は上流照会前に `INVALID_REQUEST` で拒否する。丸め・暗黙変換・上限への切詰めは行わない。
2. Host と request target の URL 解析失敗を固定の400に変換し、入力を応答・ログへ反映しない。Hostを解析基底に使わず固定基底でroutingする。SDKのHost/Origin許可設定とBearer認証は変更しない。
3. listenerでもhandlerのrejectを捕捉し、未送信なら固定500、応答開始済みなら接続を破棄する。

互換性：既定6・有効な期間数・各月の集計失敗を空データにする動作は維持する。
従来暗黙に受理していた0/null/文字列等と120超は、意図した入力制限として拒否する。
OPTIONS、health、未知path、認証、既存session、IPv6 Host、query stringの既存動作をテストする。

## 再現・検証

- RED：修正前、`periods=0` の拒否テストは6ヶ月の結果を返して失敗。
- RED：修正前、未認証 `Host: [` のテストは `ERR_INVALID_URL` でrejectして失敗。
- GREEN：巨大有限値 `1e100`、JSON指数overflowによるInfinity、NaN、負数、分数、121、null、文字列、boolean、object、arrayは上流呼出し0回で拒否。
- GREEN：省略/1/120の件数を確認。スキーマのinteger/minimum/maximum/defaultも確認。
- HTTP単体：不正Hostの別形式（`%`、不正port、不完全IPv6）と不正absolute targetを400で拒否し、セッションを生成しない。
- HTTP子プロセス：実listenerをループバック一時portで起動。`--unhandled-rejections=strict` のもと、不正Host3種類の400の直後にhealth=200、未認証MCP=401を同一プロセスで確認。10秒の子プロセス上限付き。

実行コマンド：

```text
bdo npm run build
bdo npx vitest run tests/server-http.test.ts tests/http-host-survival.test.ts tests/tools/reporting.test.ts
bdo npx eslint src/server-http.ts src/tools/reporting.ts tests/server-http.test.ts tests/tools/reporting.test.ts tests/http-host-survival.test.ts
```

結果：build成功。ESLintはerror 0、既存のany警告12件。
最終差分でbuildを再実行し成功、対象3ファイル105テスト成功、`bdo git diff --check` 成功。
listener入口では、URL解析以外のpre-routing rejectも固定500として捕捉する回帰を追加した。
最初のHTTP子プロセス試行はsandboxのloopback listen制約（EPERM）で失敗し、許可付きの同一合成テスト再実行で成功した。

### 全体テストと対象外の失敗

`bdo npm test`：122ファイル中121成功、3,147テスト成功・3失敗（対象に追加したlistener境界テストより前の実行）。
`tests/review/worker-supervisor.test.ts` の3失敗は、単独再実行でも再現した。
同fixtureの `operator_config.expires_at` は `2026-10-20T00:00:00Z` に固定されているが、3テストはreview時刻を現在時刻へ更新する。
同じinputを `finalizeAggregate` に直接渡し、`Operator assertion must be current at review time` / `Operator assertion must remain valid beyond the full run deadline` を確認した。
対象のreviewソースとfixtureはHEADから未変更（`bdo git diff --exit-code HEAD -- src/review tests/review/worker-supervisor.test.ts tests/review/fixtures/bp5-results.ts` 成功）。
このため全体greenとはしない。今回の2件とは分離し、fixtureの修正や期限検証の緩和は行わない。

別のread-onlyレビューでも、今回の範囲の具体的な残存バイパス・互換性退行は見つからなかった。
ただしレビュアーのsandboxではloopback待受がEPERMとなり、親側の許可付き子プロセステストで補完した。

## 範囲外・未実施

PDI/ServiceNow実機操作・設定変更・外部通信は今回の検証対象外。
実ServiceNow応答の性能や集計API単体のタイムアウトは今回の検証対象外。
反復回数を制限したものであり、複数呼出しを通じた総量制限を追加する変更ではない。
