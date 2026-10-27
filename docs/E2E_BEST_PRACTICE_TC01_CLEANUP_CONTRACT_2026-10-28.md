# TC-01 内部契約・typed cleanup終端・二軸診断：純粋fake検証

日付：2026-10-28。[接続設計draft-0.2 §10](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md#10-tc-01独立した純粋fake契約2026-10-28)。

## 1. 対象と境界

- 新規module：`src/review/abort-scope-evidence-cleanup-contract.ts`。
- 新規試験：`tests/review/cleanup-contract.test.ts`。
- factory単位のprivate WeakMap／opaque handleと注入clockだけを使う独立fake。importはzodだけで、実session・fixture会計・fetch／Response／Stream・Worker・timer・ファイルを操作しない。
- primitiveなfake観測からtyped終端票を作り、HTTP／workerの別slotへ同一性・一度限りの消費を確認して合流する。confirmedの直接指定は受けないが、primitive自体は**合成前提**であり、実APIからの観測証拠ではない。
- run／session／source／認証世代／予算の正式binding、counter更新、receipt／seal／findingの発行はない。既存の非同梱prefix`abort-scope-evidence*`を維持する。

## 2. 合成68ケース

| 区分 | 確認した内容 |
|---|---|
| HTTP終端 | EOF、cancelled reader／unlocked body、no_response／no_bodyを区別。pending fetch／read／cancel、cancel拒否、closed未確認／拒否、unknown reader、lock／abort失敗、不整合をunconfirmedにする |
| worker終端 | terminated／listeners detached／両stream closedだけconfirmed。pending／拒否／未解放を別理由で拒否し、HTTPの状態を借用しない |
| one-shot | 同票の二重終端・consume、別attempt、cross-axis、clone／scalar confirmed、別factoryのpurpose／attempt／worker／reportを拒否。外国realmは不変 |
| 診断保持 | 先行取消／認証失敗／access_denied／G・P予算理由を後続cleanupで上書きしない。未知Errorを固定化し、raw秘密を出さない |
| run集約 | 開始済みのrunは確定前in_progress。全開始票consume後にのみconfirmed。pending／未消費はunconfirmed。未開始resourceはnot_started、worker未起動からconfirmedを推定しない |
| clock／phase | HTTPのhard期限前・等号・後、workerの前・等号、逆行／非有限／例外、final遷移時の起点維持、残時間ありの旧phase票拒否 |
| 遅延・再入 | 期限内に確定した過去cleanup事実のconsumeと活動再開を区別。未確認やclosedをlate成功で修復しない。clock callback中の最終close／phase交換を再検査 |
| 有限枠・閉鎖 | fake purpose／attempt上限、設定による上限引上げ拒否、HTTP最大1／worker最大1。I/O・会計更新・session登録・本文・正式発行APIなし。診断・票を凍結 |

期待値は製品の分類関数を呼ばない固定の観測表で与えた。これはcleanup分類の独立した合成期待値であり、TC-02以降のC/G/P/E/Rイベントoracleや実会計の検証を完了したものではない。

## 3. TDD中の失敗と修正

1. module未実装でimport失敗を確認し、HTTPの最小縦経路を実装して成功。
2. worker API未実装で失敗を確認し、別型・別台帳・別診断軸を追加。
3. 既知票の二重consumeがbinding不整合に分類される失敗を確認し、invalid_stateに統一。
4. normal phaseでfinal用途を受け付ける失敗を確認し、用途名とphaseを照合。
5. closed後の未知票で確定診断が変わる失敗を確認し、closed診断を固定。
6. 未開始HTTP／workerがhard期限でunconfirmedになる2件の失敗を確認。存在しないresourceはnot_startedを保持し、期限理由を別に記録するよう修正。
7. access_denied／receive_budget_exceeded／payload_budget_exceededが未知扱いになる3件の失敗を確認し、設計で定めた固定primary語彙を追加。実権限・実予算を操作する変更ではない。

その後、再入・cross-axis・duplicate・worker期限等を加えて68件が成功した。これらは開発中の合成契約の差分で、実機の不具合やセキュリティ評価を主張するものではない。

## 4. 検証結果

- 新規単体合成：1ファイル・68件成功。
- `npm run build`：成功。
- 全体合成：`vitest run --maxWorkers=3`、165ファイル・4,863件成功、スキップ0件（30.47秒）。
- src／testsのESLint：エラー0件、既存warning 374件。
- offline cacheによる`tests/review/package-worker.mjs`：377ファイル、production-only install／解析／集約／境界テスト成功。prefix検査でTC-01 moduleを含む開発専用evidence群の非同梱を確認。
- 関連MD 5文書・相対リンク43件の参照先欠落なし。`git diff --check`の空白エラーなし。
- 中間の全体再実行は、追加62ケース時に165ファイル・4,857件成功、追加65ケース時に165ファイル・4,860件成功。意図したred以外の失敗はなかった。

## 5. 未実装と次工程

TC-01は型・状態・診断の純粋fakeのみ。fake用途ラベルを実GET／retryの許可にせず、既存実sessionへの生成claim、共通state・mutable lease、認証bootstrap、動的予約、typed body、実Promiseのread／cancel／closed／lock、実worker jobは未接続。

`finishRun`成功はモデル内の終端契約成立だけを表し、HTTP成功・body受領・レビュー適合・正式証拠成立を意味しない。

fake handleの数を数える`model_counts`は実HTTP試行数ではなく、実C/G/P/E/Rへ課金・返金・resetしない。受理形状は有限だが、不正入力clone前byte制限、実allocation／control work、物理終了／次run受付policyは未評価。timerはなく、操作時のfake clock検査だけで、実時間60秒の強制中断を証明しない。

正式発行口閉鎖・Unknown・全体受付無効、telemetry／VM／監視保留を維持。次はTC-02のprivate生成claimと単一state結合をfake依存で検証する範囲。実transport・実機操作・設定変更・本番cap・有効化の承認を本記録から得ることはできない。
