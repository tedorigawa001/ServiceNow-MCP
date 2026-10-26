# AU-BR-006 単一budget owner・session binding・dispatch/chunk会計 合成検証

Date: 2026-10-26 / fake I/O・fake timers限定。

## 1. 範囲

[transport設計draft-0.3 §13](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)の第2段階。実`BoundedReadSession`の登録・AuthSnapshotIdentity・prepared ownerを利用するが、fetch依存はfixture応答だけ。PDIには通信せず、認証値は架空データ。実transport／worker・設定変更・正式発行・有効化を行わない。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

## 2. 接続した境界

- lifecycleの同owner／session照合後、session側transport claimを一度だけ消費。重複・別session・失効・失敗後再生成を拒否し、秘密やsnapshotを返さない。
- sessionのprivate requests／receivedBytes／payloadBytesを直接課金するclosureを渡す。baselineの費用を残し、statsから新台帳を再構築しない。
- dispatch直前にCを消費、retry・同期throwでも返さない。G/S/payload/Eは同attempt連番chunkの採用時に一度課金し、超過分も保持する。
- Rは親／metadata各2、table受付ごとに最終2追加。通常C+1+R<=Q、final固定順序、不要retry枠返却を確認する。table初回は初回2＋最終2の余裕を要求する。
- claim後のlegacy GET・chargePayload・setPhaseReserveを拒否し、別経路による二重課金やphase変更を許さない。未claimの既存経路は変更しない。
- 元のsession clock・deadline・request timeoutと低減設定を使用。late event／取消／close／期限切れは未採用で、未来の会計を止める。sessionの固定abort signalでfake状態機械も同期失効し、未消費本文参照を外す。
- fake本文のbyte数に加えincremental SHA-256を比較。未課金本文と同長の差替えもreceiptへ進めない。parse・consume・診断で再課金しない。

## 3. 合成テストとoracle

新規`tests/review/abort-scope-evidence-transport-budget.test.ts`は27件。

| 分類 | 検証 |
|---|---|
| 結合 | 別session／二重生成／owner停止／close、legacy混用拒否、秘密非出力・正式発行拒否 |
| C/R | dispatch前課金、同期throw、retry、通常枠不足でdispatchゼロ・予約保持、親→metadata final枠の消費と解放、順序違反 |
| chunk | 1byte分割、連番の重複／飛び／clone、byte数・hash不一致、未課金本文、採用後参照を持ち出さない |
| G/S/E/payload | G等号／超過、table単体超過の局所停止、payload単体超過保持、E累計262144byte等号で後続table dispatch拒否 |
| clock／停止 | I/O cutoff、元のhard deadline、取消・close後のlate chunk、空chunk16回／17回目停止 |
| 独立oracle | 固定イベント列のdispatch数・各chunk長からtest内でC/G/E/payload/Rを再構成し、各イベント後にsession statsと比較。製品計算器で期待値を生成しない |

最初の2ファイル実行は78件中77成功・1失敗。二重生成でownerを停止した後、test helperが新permitを取得してthrowしていた。停止前に取得したpermitを使ってbegin拒否を検証するよう修正した。製品やテストの期限は緩めていない。

## 4. 検証結果

すべて`bdo`経由。

| 検証 | 結果 |
|---|---|
| 新規transport-budget単体 | 27件成功 |
| transport-budget／transport-state＋関連owner・selection・stream・reservation・channel・bounded-source・release・adapter・target-selection・soft-deadline・R2 | 22ファイル・896件成功 |
| `npm run build` | 成功 |
| 変更実装5ファイル＋新規testのESLint | 成功 |
| `npm pack --dry-run --json --ignore-scripts`と一覧検査 | 377ファイル、`dist/review/abort-scope-evidence*`同梱0件 |
| 差分・文書検査 | `git diff --check`成功。4文書・ローカルリンク24件の存在と末尾空白なしを確認 |

実sessionの内部port契約は本体に含まれるが、fake adapter／状態機械／既存合成issuerは梱包除外。公開MCPツールや正式な証拠発行口には接続していない。全リポジトリの全テスト・実機E2Eを実行したという意味ではない。

## 5. 未接続・残課題

- 実source／ReleasePermitの深い証拠、選択receipt／payloadの実由来、worker plan、実phase世代、cap採用承認は未接続。adapterのselection_ready／plan_ready等はfake前提。
- 今回はauth-ready後の生成。認証bootstrapを新portから行う経路は未接続。以前の認証費用は残すが、新経路のOAuth単独検証は未実施。
- 実read／cancel／reader.closed／pending Promise／lock／OS資源の終了確認は未実施。snapshot値はfakeであり、実機cleanupの証拠ではない。
- 局所失敗tableのfinal skip・R解放、payload単体不足の専用上位分類、実worker／上位結果との合流は次工程。skipを勝手に成功へ置換せず、順序違反で停止する。
- portの型だけで任意の同processコードを隔離するものではない。正式な証拠発行口は閉鎖を維持し、合成成功を本番証拠に昇格しない。
