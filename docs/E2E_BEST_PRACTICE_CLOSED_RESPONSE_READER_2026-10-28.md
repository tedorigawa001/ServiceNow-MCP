# AU-BR-006 CD-03：同Response・native reader・同bytes解析の合成検証

Date: 2026-10-28 / Scope: fake dispatcher／clock／scheduler、注入native Response／Streams限定。

設計：[draft-0.3 §12](BEST_PRACTICE_ABORT_SCOPE_CLOSED_DISPATCH_SIGNAL_DESIGN.md#12-cd-03同responseからnative-reader同bytes解析への接続)。
実装：[同coreの待機・本文監督](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[private body parser](../src/review/abort-scope-evidence-closed-body-candidate.ts)。
試験：[CD-03追加30件](../tests/review/closed-response-reader.test.ts)（初回26件＋§6の4件）。

## 1. 実装した経路

`createInjectedClosedParentResponseReader`は同constructorの固定親GET／不変fixture auth contextとprivate request台帳を、同ReadStateのinitial／finalへ結ぶ。Response待機中のattempt参照・deadline／ioDeadline／reserve・controllerをそのままnative readerへ引き継ぐ。dispatchとC加算は1回だけで、Response到着時に10秒・全体60秒・予算を作り直さない。

native Responseの所有・status・URL・bodyを検査し、200＋bodyあり＋D_io前のliveな応答だけを同default readerへ採用する。closedを一度捕捉して、共通superviseBodyから既存pump・private copy・一度の課金・hash／固定解析へ進む。EOF／cancel／pending read／closed／releaseLockの監督も共用し、CD-01／CD-02／stream-onlyの既存入口は維持する。

固定要求の対象sys_idをprivate resourceへ渡し、親result.sys_idが異なればinvalid_responseで拒否する。rejectした受信byteの課金は返金しない。返却は既存の固定合成summary／診断だけで、本文・対象ID・URL・認証context・reader・候補・正式receiptを返さない。

## 2. RED→GREENと発見事項

1. 最初の正常経路はfactory未実装で失敗。同Response待機→native reader→同bytesのhash／解析までを接続して成功した。
2. 既存の合成parent parserがsys_id形式だけを検査するため、別親のbodyを正常扱いする回帰を再現。CD-03だけ固定対象IDをconsumeへ渡し、private bytesのschema検査と同時に一致を確認するよう修正した。旧ID未指定の合成入口は互換維持。
3. Response到着時に待機タイマーのdisposerが失敗すると、primaryはinternal_review_errorでも本文側のcleanupがconfirmedになる回帰を再現。待機側のscheduler／clock／abort失敗・revoked・cleanupDeadline・abort済み状態を本文側へ引き継ぎ、未確認と固定理由を保持するよう修正した。同signalのabort通知は1回。
4. snapshot試験の初期fixtureはclock closureが初期化前の変数を参照してconstructorエラーとなったため、明示的な未設定状態を使うfixtureへ訂正した。また非露出試験で固定body診断キーを本文と誤認していた判定を訂正し、summaryの生body不在とretained_bytes=0を別々に確認した。いずれも製品の期限や拒否条件は緩めていない。

## 3. 合成観測

| 観点 | 結果 |
|---|---|
| 同attempt | 待機を1秒消費してもC=1。Responseを9秒で渡した後も元9750msのI/O cutoffで停止 |
| 本文時間 | 正常headers到着から250msを越える読取も、元のI/O期限内なら受理。header到着をcleanup開始にしない |
| snapshot | source bufferを課金後のclock callbackで改変しても、private copyのdigest／schema結果は一致 |
| retry | timeout prefixのGを保持し、新Response／body／signal・同context／URL・ordinal=2で再試行。旧fragmentは混ぜない |
| cleanup | cancel pendingはnative closedとreadが決着し、lockを解放できても未確認。late決着で診断を修復しない |
| 取消・close | 同signal・同readerだけを一度停止／解放し、一次codeを保持 |
| 切替 | 待機タイマーの後始末失敗を本文側の未確認診断へ保持。abortとcancelを二重実行しない |
| 所有 | foreign lock・Response再利用・Proxy／偽receiverを拒否し、外国readerを操作しない。caller getter／getReader overrideは使わない |
| 初回／最終 | 同URL／対象／contextと所定slot順序を維持。各logical readのordinalは1から始まる |
| 拒否・非露出 | 別親ID、不正JSON、非200、上限超過、empty-read 16／17境界を検証。secret／bodyは結果へ出さず、Gは返金しない |
| 閉鎖 | global fetch sentinel下で実行。正式発行・MCP登録・実session採用はしない |

試験側でbytesの長さ／digest・固定ID・fake絶対時刻・signal／context参照・underlying cancel回数を独立に観測する。期待値を製品builderやstatsだけから再計算しない。

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| CD-03追加試験 | 26 tests成功 |
| CD-03＋CD-02＋CD-01＋supervisor＋stream＋body＋ReadState＋gate | 8 files／288 tests成功 |
| `npm run build` | 成功 |
| 変更した2実装・追加試験のESLint | 成功 |
| 全体 `vitest run --maxWorkers=3` | 176 files／5,300 tests成功、30.61秒 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／73 linksの存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

既存ローカル合成待受を許可して全体試験を実行したが、実PDI／外部サービスには通信していない。製品・試験の期限は変更せず、package除外prefixを維持する。

## 5. まだ認定しないもの

親本文は固定GETのfieldsと同じstrictな5列で解析する（§6）。表示値差・実Table APIの実応答との互換性、初回と最終の安定性は未検証。このsummaryをParentSnapshot／正式source証拠・本番レビュー成功へ昇格しない。

Responseや同じURL・対象IDだけではHTTP origin／実認証の由来を証明できない。実AuthSnapshotIdentity／ReleasePermit、選択window・payload／worker job、上位正式JSON・全体work／heap・本番cap・OSの実時間終了保証は引き続き未接続／未承認。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持。実transport・実機操作・token発行・設定変更・Pushは行わない。

## 6. レビュー修正：固定GETのfieldsと親本文schemaの一致（2026-10-28）

固定GETは`sysparm_fields=sys_id,state,application,sys_updated_on,sys_mod_count`を要求する一方、body laneの親schemaは`result.sys_id`だけのstrict objectだった。このため固定GETへの正しい5列応答は必ず`invalid_response`となり、その要求からは返らない`{result:{sys_id}}`だけが成功していた（プローブで確認）。

- 対象sys_idを結合したCD-03経路では、本番`bounded-source`の`parentSchema`と同じstrictな5列schemaで解析し、sys_id一致検査を維持した。対象ID未指定の既存合成入口は従来のprojectionのまま。
- 試験の親応答を5列の形へ更新し、sys_idだけ・余剰列・state欠落・不正な`sys_mod_count`の拒否を4件追加（余剰列の値はstatusへ出ない）。
- 修正前のschemaでは9件が失敗（5列応答を使う既存試験とsys_idだけの拒否）。CD-03 30件・body lane 50件成功、`npm run build`、変更ファイルのESLint、全体176 files／5,304 tests成功。
