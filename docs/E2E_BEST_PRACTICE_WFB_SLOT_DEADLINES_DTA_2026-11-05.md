# WF-B DT-A：slot固定期限表の合成検証

Date: 2026-11-05 / 実装前HEAD: `eb642a2` / Status: **合成依存限定、未コミット**。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。運用時間枠・保存先・保持期間・停止方式は未承認。再採取・証拠copy／保管操作・実接続・実通信・設定変更・Pushは行っていない。本記録のMD作成とローカルbuildは、証拠Storeの実保存ではない。

設計は[固定期限表・recorder終端の差分設計 draft-0.3](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)§8.1。今回はDT-Aのみで、DT-B／DT-Cは実装していない。

## 1 実装範囲

- `tests/review/fixtures/store-recorder-kernel.ts`へ`planSlotDeadlines`と合成table issuerを追加。固定keyのDATAを厳密検査し、元の開始点・session絶対期限・6予約から凍結2区分を計算する。任意row／slot対応・運用既定値は受け付けない。
- tableをprivate WeakMapで同run／budget originへ結合する。table copy・公開plan・別run／budgetはStore生成前に拒否する。bound ownerは非公開の同origin・同clockでStoreを生成し、`cleanupMs`と明示必須`manifestCleanupMs`を一度pinする。実予算ownerや会計更新への接続ではない。
- `manifest.json`だけmanifest、それ以外13固定名はevidence。saveが選んだrowをreceiptと通常／失敗closeへ保持する。public／private receipt consumerも同rowと表originを照合する。consume DATAは従来のslot／size／digestだけで、期限指定口は作らない。
- table-modeの当該attemptには固定区分・版を付加する。旧単体`StoreCaps`のdeadline pairと結果形は互換維持し、不正tableからlegacyへfallbackしない。busy／sticky拒否へ前回区分やcleanupを複写しない。
- `fixed-evidence-store.ts`は同class／型の再exportを維持。runtimeソース・設定・既存台帳は変更していない。

## 2 独立oracleと受入結果

明示合成値は開始0、外側300000、session期限600000、余裕1000、予約`1000/2000/3000/4000/5000/6000`、cleanup各1000。運用値の承認ではない。期待値は計算器や`planTime`を呼ばず、手書きの加減算・境界表で定めた。

| 区分 | 操作期限 | cleanup期限 |
|---|---:|---:|
| evidence | 288000 | 289000 |
| manifest | 293000 | 294000 |

確認済み:

- 元session期限が先の場合も同開始時点の絶対期限を使い、残時間から再計算しない。入力の後変更で凍結planが変わらない。
- 不足／未知field・symbol・accessor・非列挙field・独自prototype・反射例外・不正scalar・safe整数overflow・不足窓・空の処理区間を拒否する。getterは呼ばない。
- 同run／budget以外・表copy／公開plan・継承したtable・legacy pair混在を拒否し、生成拒否ではfake操作0。table-mode limitsの後変更は受理済みStoreへ影響しない。
- 全14名の内部区分と、save／consumeの期限直前・等値・直後を照合。Store開始点未満の時刻も拒否する。
- create／write／flush／reread後の期限到達、consume guard中の到達を拒否。receiptの二重消費・別Store混入も拒否する。
- evidence期限後の要求はslotとbyte予約を先に消費してsticky `deadline`。後続manifestも拒否し、期限枠を借り換えない。
- 通常closeと失敗finallyは同rowのcleanup期限を使う。予約前の返答はconfirmed、等値／超過の返答はlate、開始前に予約切れならclose 0回・unconfirmed。試行したcloseは最大1回で、主deadline理由を保持する。
- bound checkpoint laneが`D_save`で閉じても健全Storeを取消さない。spyで捕捉した子Store／private runだけからmanifest rowへ到達できることを確認した。bound公開manifest入口・run保全／process終了への昇格はない。
- 既存private consumer・固定header／FIFO ack・取消／cleanup・旧単体pairの回帰試験を継続した。

## 3 実行結果

本変更の試験実行で失敗は出ていない。追加中の段階実行も399件、404件で成功し、最終結果は以下。過去の全体回帰結果を今回の結果へ流用していない。

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/slot-deadlines.test.ts` | **48件成功** |
| 上記＋`fixed-recorder`／`fixed-evidence-store`／`store-recorder-binding`／`store-recorder-persistence`の5 test files | **406件成功**、失敗0 |
| `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck`＋共通kernel／3 wrapper／上記5 test files | 成功、型エラー0 |
| `bdo npx eslint`＋変更したfixture／test計5ファイル | 成功、問題0 |
| `bdo npm run build` | 成功 |
| 静的build／配布境界 | `tsconfig`のsrc限定・tests除外とpackage filesのtests不含を確認。src 183ファイルに新table／kernel参照なし。archive作成0 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |

全体14,000件規模の回帰、npm pack／dry-run、配布物展開・production install、実保存・OS／process／network接続は実施していない。静的境界確認を実梱包成功や実機保証とは呼ばない。

## 4 残課題・非昇格

DT-Bのprivate終端slot／一度限りclaim／安全なPending／queue不変のrecorder閉鎖、閉鎖後clock異常のStore取消と診断保持は未実装。DT-Cの状態別連続対照・最終費目も未実施。本書のDT01〜DT05確認は期限表部分に限り、DT06〜DT12全体を合格扱いにしない。

manifestはopaque bytesの単体／spy-only対照であり、正式writer・必須集合検証・run保全成功ではない。予算originは合成identityのみで実cap承認や追加配賦を証明しない。未確認の解放・ProcessOwner・運用値はUnknown／未承認のまま残す。
