# PD-B(B)：同pending／header consumer・開始claim・暫定候補の合成検証

Date: 2026-11-03 / 基準HEAD: `af6fdaa`。
Scope: [接続設計§9](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PENDING_PREFIX_BINDING_DESIGN.md)の(B)のみ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。post受理済み関係値・一度限り関係値消費・seal成功は追加しない。

## 1 接続内容

- 同rootに`prefixStarted`を置き、既存transfer開始とともに一度だけ消費。pre停止・値不適合・失効後に再armしない。
- transfer work内で既存token／pins／plan／window／budget検査・owned検査を行い、同takeのheaderを既存private consumerから一度取得。その後、同modelのPpと版・pins header・taken plan.verify・同headerだけを(A)の固定境界へ供給する。
- 成功時だけprivate `PendingPrefixCheck`に同token／pending object／model／header／budget identity・serial／失効serialと値結果を束ねる。workで失敗してもpost guardを通し、post停止が優先される。
- post通過後に同taken／候補identity／budget／serialを再確認し、なお暫定候補のまま固定state abortする。候補を関係値へ昇格せず、`relations:0／successful_seals:0`を維持。
- clear／isClearedに候補を追加し、header・入力等とともに参照をclearしてから既存custodyへ進む。上位には本文や値結果を移さず、固定診断と未解決cleanup責務を保持する。実会計・期限の変更はない。

## 2 合成試験

[新試験](../tests/review/synthetic-pending-prefix-transfer.test.ts)はVitest内の値helper spyで呼出しを観測する。失敗試験ではhelperへのDATAを試験側でseed headerへ差し替え、実際の(A)比較器が拒否することを利用する。root／runtimeにcallback・friend・登録口を追加していない。spyが保持する引数は試験器材であり、本番のpayload非escapeを動的に網羅した保証とは区別する。

| ケース | 確認結果 |
| --- | --- |
| 正常work→固定abort | preではclaim済み・calls0・候補なし。postではcalls1・候補1・未受理。post後再確認1で固定abortし候補なし、再実行でもcalls1のまま |
| 入力化 | 原順序のPpとsort済みpins baseを区別、同accepted headerに固定delta errorを保持。同planのverified値を供給 |
| pre停止 | 取消／期限／throw／未知guard戻りで計算0・候補0、claimはspent、上位custody移譲時にpayload cleared |
| post停止 | 同4条件で計算1・候補1からclearし、post再確認0。元停止分類を保持 |
| work不一致とpostの競合 | seed headerを比較対象にする変異でaccepted/binding不一致。post時点のfirst_failureは未設定。post取消／期限があれば優先し、なければbinding拒否 |
| postのswallowed再入 | 再計算せずreentrant、候補をclearして同custodyへ移譲可能 |
| source／cleanup失効 | 計算0・候補0で拒否 |
| 別root summary混入 | 計算前にbinding拒否、他rootは不変 |
| 親省略を含む混合経路 | findings99 keep→2 parent omit→worker omit→retained。Ppにresponse_truncated／finding_budget_exceededとoutput response_limitが入り、Hにはanalysis deltaが追加される |

期待値はspyで観測した値に対する手書きの順序・件数・状態で検査し、guard内ではassertionしない。値演算全体の独立oracleは(A)の既存36件を同時回帰し、今回の11件をその代替としない。

### P0／Ppの負の対照

kernelの固定入力を一時的に`model.prefix`から`model.initial_prefix`へ変更した。親省略の試験が**1件失敗・10件skip**となり、追加warning2件の欠落を呼出し外で検出した。正しいPpへ戻した後、最終回帰は成功した。負の対照以外に通常実装での試験失敗は観測していない。

## 3 最終確認

- `bdo npm run build`：成功（製品src）。
- `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck tests/review/synthetic-pending-prefix-transfer.test.ts`：成功（試験・kernel等の依存を含む）。
- `bdo npx vitest run tests/review/synthetic-*.test.ts`：**43ファイル・3,450件成功**。新試験11件、既存transfer42件、(A)36件を含む。
- `bdo node tests/review/package-http-classification.mjs`：**成功、441ファイル**。kernelの固定importへ(A)だけを追加し、新private markerの漏出負の対照と合成依存・I/O／clock／worker境界、配布除外、既存compiled fixtureを確認。
- `bdo git diff --check`：成功。

新経路のcompiled実行fixture・全機能の全体回帰は未追加／未実行。実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 4 残課題と限界

(C)のpost受理済み関係値・一度限りの利用claim／固定消費・compiled保証は未実装。`post_checks`は既存pendingの再確認だけであり関係値authorityではない。private内部へ偽pending／receiptを直接登録する試験口も作っておらず、各identity組合せを外部から偽造して網羅したとは主張しない。

full header／本文比較・実worker／runtime provenance・全work／heap上界・3round配賦は引き続きUnknown。新しい演算の費用をゼロとみなさず、今回の既存budget不変試験を全体費用の証明へ昇格させない。参照clearも物理消去やOS cleanup確認ではない。
