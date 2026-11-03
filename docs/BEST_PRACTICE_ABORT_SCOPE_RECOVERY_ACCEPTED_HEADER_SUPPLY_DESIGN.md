# PD-B前工程：実accepted headerのprivate供給境界

Version: br006-recovery-accepted-header-supply-draft-0.1 / Date: 2026-11-03。
Status: **設計のみ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

[順序付きprefix・固定delta契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PREFIX_DELTA_DESIGN.md)§8と[NB接続設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)の差分。実装・実接続・実通信・設定変更・Pushを行わない。NB-03の固定abortと、移譲先seal未接続を変更しない。

## 1 現行の生成点と不足

[合成kernel](../tests/support/review/synthetic-recovery-kernel.ts)のaccept処理は、workで再投影し、post-guard後に`acceptedFinish`へ`handle／projection／bound`を格納する。対象は、この**受理されたprojectionの`snapshot.header`**であり、pinsのseed header、issued時のprojection、summaryから再計算したheaderではない。

現在の`NormalAcceptedSnapshot`はpins／accepted／plan／handoff／origin／source／cleanup／windowだけを返す。private takeは検査後に`acceptedFinish`を消し、状態をtransferredへ移すため、その後にaccepted slotを再読してheaderを得ることはできない。spent routeの再開やacceptの再実行も禁止する。

ここでいう実acceptedは既存の合成kernel内の受理済み値であり、本番証拠・実worker由来の保証を意味しない。

## 2 二案の比較と推奨

| 案 | 境界と利点 | 必要な追加設計／制約 |
| --- | --- | --- |
| A：kernel内比較 | 実headerをkernel外へ渡さず、固定private継続で比較する | 同pendingのP0／Pp／trace・PD-A結果をkernelへ安全に渡す契約が必要。汎用callbackや値登録factoryにしない |
| B：同takeのprivate receipt | 既存takeの一度限り移譲へ、同accepted projectionのheader参照を束ねる | receiptとpendingの寿命・失効・clear対象を追加。公開snapshotを拡張しない |

**Bを次の実装設計の推奨とする。** 既存NB-03のtake／pending／失敗custodyの境界を再利用でき、別呼出しによる観測ずれを作らないため。ただし本稿は供給境界のみを決め、PD-A入力のprivate結合・内容比較・seal成功を実装済みとはしない。

## 3 発行元・所有権・同一性

名称案`TakenAcceptedProjection`は同constructorのkernelだけが生成する非exportの受領物とする。raw headerを受け取るfactory、外部登録、public getter、fixture登録口を追加しない。

受領物には既存take markerと、同owner／pins／accepted handle／plan／handoff／origin／source／cleanup／windowへのprivate結合、受理済みprojection identityとそのheader参照を束ねる。外部指定のID文字列や構造的一致だけをidentityの代用にしない。現行のowner・live route・termination sinkの検査を省略しない。

headerは[既存投影](../tests/support/review/synthetic-finish-plan-binding.ts)で検査・所有されたfreeze済み値へのreadonly参照とする。新たな再投影や独立した深いcopyを実acceptedとみなさない。freezeだけでは発行元の証明にならず、同kernelのprivate生成経路とidentity検査が必要である。参照を束ねても、acceptedを利用できるownerを二重に作らない。

## 4 同takeでの移譲順序

1. 既存one-shot take claimを先に消費する。検査失敗でも再armしない。
2. 同owner・accepted handle・受理状態・pins／window・live source／cleanupを検査する。
3. その時点の同`acceptedFinish`からprojection identityとheader参照を取得し、同take markerへ束ねる。caller callback・await・getter評価を挟まない。
4. 元accepted slotを消し、transferredへ移す。既存受領物とheader受領物は一つのpending移譲単位にする。
5. 途中失敗なら局所参照も破棄し、既存固定abort／診断へ進む。部分受領物を返さない。

事前のreadでpreviewしたheaderを後のtakeへ流用しない。take後に元slotへ戻す処理、summaryからの再生成、別takeによる補完も禁止する。将来の型でheaderを単独取り出しできず、同pending内の固定比較だけが借用できるようにする。

## 5 利用・失効・破棄

状態は未移譲→pending保持→比較で一度限り消費、または失効／固定discardとする。take claimと比較claimは別責務であり、値のfreezeやmoveだけで失効検査を置換しない。比較結果は移譲先seal authorityではない。

利用時には同pending／taken markerと同失効serialをpre／work／postで検査する。取消・期限・hard・source失効・cleanup開始等の既存停止条件を弱めない。work中の値不一致は局所保留し、post-guardの停止理由を失わない。詳細なPD-A入力結合と比較claimの順序は次工程で具体化する。

失敗時はreceipt・projection／header参照・関係値・一時copyをすべてclearする。`payloadPending`と本文破棄証拠の検査対象へ新保持slotを含め、参照が残る状態でPayloadClearedReceiptを発行しない。private受領物を外部へescapeさせないことが前提であり、参照clearはメモリの物理消去やOS cleanup完了の証拠ではない。

headerにはlimitations／errors等が含まれるため、cleanup-only capsuleや上位診断へ入れない。NB-03の固定reason・件数・未解決責務だけを同custodyへ移す。Unknownを解放確認済みに昇格させない。

## 6 比較範囲と費目所有

PD-Aの成功はprefix-local値だけを保証する。供給したheaderからschema version／collection／limitations／errors等の必要項目を固定抽出し、同pendingの計算値との関係を次工程で検査する。full headerの他項目の適合・元receipt／traceのprovenanceは別の既存検査を維持し、prefix一致で代用しない。

| 費目 | 所有者／今回の扱い |
| --- | --- |
| takeのidentity検査・receipt保持 | 同kernel。既存費用と新参照保持を区別する |
| 比較claim・pre／post・固定抽出・比較 | 同pendingの保護scope。次工程で計数する |
| PD-Aのcopy／merge／sort・一時値 | 既存input usageだけで全work／heapを証明しない |
| clear・診断・custody移譲 | NB-03の固定失敗経路。二重所有・二重回収を作らない |

上限やschemaは拡張しない。追加費用をゼロとせず、全work・保持量・3round配賦は未確定／Unknownのまま。全体受付・本番capを有効にしない。

## 7 合成受入条件と残課題

実装時は以下を独立の負の対照で確認する。本稿では試験を追加・実行していない。

- pins seed／issued projection／summary再生成値ではなく、accept post-guardで保存した同projectionのheaderが供給される。
- 別owner／accepted／pins／plan／handoff／window／take marker、構造が同じcopy、二重takeを拒否する。
- take後は元accepted slotを再読せず、同pendingだけが受領物を保持する。失敗後の再arm・再投影を拒否する。
- 発行後の取消・期限・hard・source失効・cleanup開始で利用を拒否し、先行診断とpost-guardの理由を保持する。
- 全失敗位置でheader参照をclearし、payloadPendingと本文破棄証拠が一致する。上位custodyにはheader本文を残さない。
- 既存read／旧試験・固定abort・200限定guard・梱包除外を維持し、公開getterや配布物からの登録経路が増えない。

次の範囲は、同pendingのP0／Pp／traceと実header受領物を固定比較へ結ぶ詳細契約・実装、one-shot関係値の破棄、費用計数である。移譲先seal成功・実session／worker接続は引き続き対象外とする。
