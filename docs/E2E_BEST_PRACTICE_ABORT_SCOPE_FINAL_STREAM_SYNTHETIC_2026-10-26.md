# BR-006 最終再読・局所継続・sealの合成検証（2026-10-26）

## 1. 範囲・制約

前工程の初回source/stream接続を拡張した合成試験。実PDI E2Eではない。実transport／worker／実認証／リリース実測／公開JSON／本番permitは未接続。VM・監視・telemetryは保留、Unknown・全体受付無効を維持し、実機操作・設定変更・トークン発行・Pushは行わない。

実時計／timerは導入せず、fixture時刻の区間・非逆行、外部deadline通知とAbortSignalを扱う。実経路の60秒／210試行を緩和していないが、この合成module自身が実時間60秒を自動監視するものではない。

## 2. 接続内容

- prepareで同stream／台帳の通常枠を使い親→metadataの基準値を取得する。fixtureのready booleanだけではfinalizeできない。
- 初回と最終の親／metadata GETは同条件。metadataはall-metadata固定subset、limit101/lookaheadで0..100件、順序・重複・接続先Update Setを検査。payloadは要求しない。review_targets実選択は未接続。
- finalizing claimはawait前に一度だけ消費。親→metadata→table受付順で予約を使い、全slotを終端化する。
- 404／retry枯渇／不正JSON／下位証拠capを局所unavailableとして継続する。completeUnavailableで票を消費し、HTTP200を捏造しない。JSON正規化で判明した初回不足も台帳へ反映し、最終GETなしでskipする。
- E閉鎖でも親／metadataは通常G内で続行。未処理tableはCを増やさずskipし、予約を一度だけ解放。失敗body／超過chunkの受信量は返金しない。
- 認証／binding／取消／deadline通知／G超過／cleanup不明は全体停止。primaryと先行の固定局所診断を保持し、body・cache・seal参照を失効する。
- 親／一覧／全tableが完全かつ同一、scope非null、受付拒否なし、予約残0、cleanup確認済みの場合だけopaque synthetic sealを発行する。changed／unverifiedではseal=null。seal消費は同ownerで一度だけ、返却summaryはsynthetic:true。

## 3. 独立oracleと試験

fixtureの実callback呼出しイベントからCを、実readで返したchunkのbyteLength合計からG/Eを独立集計する。製品の課金関数や計算器をoracle内で呼ばない。成功1tableは6試行、2tableは8試行を独立期待値とし、最終予約残0／slotのattempts・skippedを確認する。

確認範囲：

- 固定descriptorと最終順序、table最終retryのslot専用消費・失敗body課金。
- 初回404/503/不正JSON/0件の後に別tableを取得し、初回不足のfinalをGETなしskip。
- final404/503/不正JSON/shape不正/0件の後も次tableを処理し、sealを出さない。
- 親／metadata／tableの版変更、同名再作成・scope変更、初回基準値不足、null scope。
- metadata100件成功・101件lookahead不足、重複ID、他Update Set/親ID混入。
- 初回・最終E閉鎖のskip、C受付不足から予約finalへの継続、prepare／finalのG超過停止。
- 401/403、cleanup無応答、待機中の取消／deadline通知と一度だけのcancel。
- sealのclone／他owner／二重消費／未発行／close後、準備なし・二重finalize・時刻逆行・期限境界。
- receiptのphase結合、局所失敗票の一度限りの消費、issuer全table終端必須。
- 繰り返し受付拒否の診断重複排除と、public close/stopの秘密文字列非反射。

前工程の「不正JSON・下位capでcomposition全体を閉じる」期待値は、今回の局所継続契約に合わせて変更した。別table混入・認証・cleanup不明等の全体停止は維持する。初回時刻不正は受信前checkpointで拒否するよう変更した。前工程記録は当時の結果として保持する。

## 4. 検証結果

- 関連10ファイル、443テスト成功。初回接続・issuer・stream・予約台帳・channel・比較owner等を含む。
- npm run build成功、変更したsource4ファイルとtest3ファイルのESLint成功、git diff --check成功。
- npm pack --dry-run --json --ignore-scripts：369ファイル、dist/review/abort-scope-evidence*は0件。一時cacheはprocess限定で指定し、npm設定ファイルは変更していない。実インストール検証ではない。
- 全リポジトリ試験・実機試験・本番用worker実行は未実施。

## 5. 残課題

実session／release permit／共有時計／実transport、既存選択metadata/payload receiptとworker jobへの結合、同名cacheのjob別配送、上位診断owner／公開completionへの接続。synthetic sealはレビューの安全・網羅性・違反・BR-006候補確定を保証せず、本番sealとして使えない。実行permitは発行しない。非同梱prefixを維持する。
