# TC-03：注入Web Streams・同attempt typed cleanupの合成検証

Date: 2026-10-28 / 対象：[接続設計draft-0.4 §12](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md)。

## 1. 実装範囲

- [開発専用adapter](../src/review/abort-scope-evidence-run-stream.ts)がTC-02のfake runを内部生成し、唯一のtransport claimを消費する。sourceは注入Response／PromiseとAbortSignalだけ。global fetch、実OAuth、実workerを使用しない。
- 同じTC-02 attemptでread結果を連番採用しG/Sへ課金。cancel Promise、事前に取得したreader.closed Promise、releaseLock成功を別々に観測し、TC-01のstrict票を1回だけ終端化・消費する。
- TC-01に同attemptの低減期限、TC-02に同clockの観測viewと最大10秒の任意timeoutを追加。timeout省略時のTC-02既存契約は維持する。reentrant時計観測は外側guardを解除せず拒否する。
- 本文はコピー・decode・解析・表示しない。payload用途もモデル上discardしP=0を維持。source取得証拠・選択receipt・scope証拠は発行しない。

## 2. 試験と独立oracle

[注入Streams試験](../tests/review/run-stream-cleanup.test.ts)33件、[TC-02追加回帰](../tests/review/run-transport-cleanup.test.ts)2件、TC-01既存回帰を含む関連3ファイル155件。

| 群 | 主要な確認 |
|---|---|
| 正常終了 | native streamの2byte＋1byte、read3回（EOF含む）、C=1／G=3／P=0、cancel0回／release1回／待受0件。製品計算器を使わずfixtureのイベント列から期待値を固定 |
| 中断 | pending readをcancel1回、cancelとclosedの決着後にrelease1回。要求だけでconfirmedにせず、先行cancelledをHTTP confirmedと分けて保持 |
| 未確認 | cancel pending／reject、closed未観測、read／closed reject、release失敗、locked／未知reader、scheduler失敗。worker未起動をconfirmedにせずnot_started |
| 遅着 | deadline後のsource Responseは一度だけbest-effort cancel、遅着closedは所有readerだけ解放。確定したunconfirmed／primary／counterを修復しない |
| 費用 | 超過chunk4byteをG cap3byteに対して1回加算後停止。期限後のread結果は不採用G=0。Response／stream再利用の2回目はCだけ加算し古いbyteを再課金しない |
| 期限 | fake timeout100ms、IO cutoff75ms、cleanup予約25msを同run clockに結合。C=1で取消・確認後も元hardの残時間59,925ms。残量3msで予約不能ならC=0 |
| 安全側 | 並列run拒否、実行中finishを解放証拠にしない、clock不正で古い時刻を使わない、source内取消でも開始済みslotを回収 |
| 秘密・出力 | 固定結果・readonly会計・二軸診断・操作数だけ。コード／token／例外message・stack／Response・reader・本文receiptを返さない |

### 開発中の失敗と修正

1. module未実装をREDで確認し、native EOF／closed／releaseのtracerをGREENへした。
2. cancel未接続のREDから、pending read・cancel Promise・closed・lockを同resourceで観測する経路を追加。
3. attempt期限の未接続をREDとし、元のhardを延長せず低減期限を同attemptへ結合。
4. 通常parentのEOFにもpayload専用discardを呼ぶ接続ミスを、primary=evidence_binding_mismatchから追跡。payload用途だけdiscardするよう修正し、通常EOF回帰を再確認。
5. 最初のlocked／再利用fixtureでは、注入前にnative Response constructor自身がTypeErrorで拒否していた。constructorの独立再現で確認し、Responseを作成した後にlock／共有するfixtureへ訂正。constructorの拒否をadapterのunknown-lock検査成功と混同しない。
6. closed拒否のhandlerがread拒否より先に動く競合ではprimaryがgeneric cleanup errorになったため、captured closed拒否をinvalid_responseとして先行保持。
7. source pending中にschedulerが壊れた後、同じ壊れたwaitを再試行していたREDを再現し、abort_failedで即時未確認終端へ進むよう修正。
8. 新しいcleanup時計viewの再入でclockが余分に呼ばれるREDを確認し、外側busyを触らず固定拒否するよう修正。

以上は開発中の合成試験であり、PDI／実transportの障害再現ではない。

## 3. 最終検証

| コマンド／確認 | 結果 |
|---|---|
| 関連3ファイルのVitest | 155件成功 |
| `bdo npm run build` | 成功 |
| 変更対象3TS＋2テストのESLint | エラー・警告なし |
| 全体合成 `vitest run --maxWorkers=3` | 167 files／4,950件成功、33.12秒。スキップなし |
| offline cacheでの`tests/review/package-worker.mjs` | 377 files、production-only install＋解析＋集約成功。既存のabort-scope-evidence prefix除外で新adapterも非同梱 |
| 文書確認 | 変更5MDの相対リンク52件、参照先欠落なし。`git diff --check`成功 |

全体合成試験のローカル待受はfixtureのみで、PDI・実transportを利用しない。既存の無関係な作業中ファイルは変更しない。

## 4. 未対応・停止条件

- 250ms／空read16回は**未承認のfake候補値**。本番policy投入ではない。request timeout内のIO cutoffはupstream_unavailableとして停止し、retryやscope不足への格下げを行わない。
- 50/55秒のphase cutoff、E/R/T予約、認証／source／ReleasePermit・選択payload／worker jobの正式binding、実session mutable portは未接続。次工程はTC-04。
- source／schedulerは信頼された注入依存。悪意あるcallbackや進まない時計を隔離する保証、実OSでの強制終了、未決着Promiseの物理解放・保持量、allocation／control workの全体上界は未証明。
- cancelやreleaseを要求・観測できた範囲を超えて、socketやOS bufferが消えたと主張しない。実機操作・設定変更・トークン発行を行わず、正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持する。
