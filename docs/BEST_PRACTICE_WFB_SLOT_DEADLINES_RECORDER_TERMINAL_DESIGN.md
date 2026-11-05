# WF-B：slot固定期限表・保存経路閉鎖後recorder終端の接続差分

Version: draft-0.1 / Date: 2026-11-05 / 基準HEAD: `31712a6`。

Status: **設計のみ。接続実装・新規合成試験は未実施。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。保存先・保持期間・運用cap／時間枠・停止方式は未承認。再採取・既存証拠copy／保管操作・実接続・実通信・設定変更・Pushは行わない。

親は[Store／recorder接続設計](BEST_PRACTICE_WFB_STORE_RECORDER_BRIDGE_DESIGN.md)と[EvidenceStore契約](BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_CONTRACT.md)。既存SB-A／SB-B・試行別結果とレビュー修正を維持し、次の合成実装への差分だけを定める。型名・操作名は提案で、実装済みのAPIではない。

## 1 差分・非目標

| 現状 | 必要な差分 |
|---|---|
| Storeの全slotでdeadline／cleanupDeadlineが1組 | 生成時に2区分の期限表をpinし、保存・receipt消費・closeが同じ区分を使う |
| bridgeのD_save閉鎖はStoreを取消さないが、後続manifestも同じ期限に阻まれる | 健全Storeに限りmanifest専用枠を残す。checkpointの閉鎖と全Storeの致命的停止を分ける |
| bridgeがClosed／Stoppedになると通常操作・observeStopが拒否される | 保存用guardとは別のprivate終端入口で、同recorderを一度だけClosedへ進める |
| public abandonは停止checkpointを追加し得る | 閉鎖後はqueueを変更しない専用terminal sectionを使い、停止不足を診断へ残す |
| Store試行別結果は既に凍結DATAとして保持 | 期限区分を付加しても主理由／cleanup／先行結果を上書きしない |

範囲は試験専用kernel・注入clock・メモリdriverだけ。manifest内容／必須集合・session票・実観測本文・ProcessOwner・OS backend・実承認は対象外。manifest期限が到達可能であることを、manifest発行口やrun保全成功の有効化とは呼ばない。

## 2 期限の供給元・固定表

元のRunBridgeOwnerがpinした同run／budget origin・開始時点・単調clock・planTimeを唯一の供給元とする。入力の数値・予約・必要なgetterは一度だけ読み、検査からprivate copyまで任意callbackを挟まない。外部Recordへ任意slot／期限を追加させず、2区分と14固定名の対応を内部定義する。

`D_confirm=stages[2]`、`D_flush=stages[3]`、`D_manifest=stages[4]`、`D_all=stages[5]`。既存工程内を切り分ける正の有限予約`C_store`／`C_manifest`から計算する。

| 区分 | 固定名 | 操作期限 | cleanup期限 |
|---|---|---|---|
| evidence | conditions.json、source写し3点、report.partial.0001〜0006、report.final.json、termination.json、analysis.json | D_save = D_flush − C_store | D_flush |
| manifest | manifest.jsonだけ | D_manifest_save = D_manifest − C_manifest | D_manifest |

`D_confirm < D_save < D_flush < D_manifest_save < D_manifest < D_all`を要求する。safe integer・正の予約・加減算overflow・空の処理枠・未知区分・欠落／重複した対応を拒否する。元planの受付条件と、観測可能窓が218秒＋承認済み正の余裕より大きい条件も維持する。**数値の運用既定値は新設しない。**

表の各rowと全体をprivateに複製・凍結し、同run／budget／版のoriginへ結ぶ。残時間から期限を再計算しない。後からC_store・C_manifest・clockを差替えない。旧単体fakeの1組capは互換の試験経路として残せるが、新bound経路へ暗黙fallbackしない。

### 2.1 各操作への適用

- saveは固定slot名から区分を内部選択し、その呼出しの最後まで同rowを保持する。write／flush／再読・receipt発行の前後guardは操作期限、取得済みhandleのclose確認は同rowのcleanup期限を使う。
- Savedのprivate情報へ区分／期限表originを結ぶ。公開consumeとprivate consumerは**receiptの内部情報から**同rowを選び、callerに区分を指定させない。checkpoint receiptへmanifest期限を借用させない。未知／foreign receiptは従来どおり拒否する。
- 正常closeと失敗後finallyのcloseは同rowを使う。close前に期限を確認し、返答後もconfirmed／late／unconfirmedを判定する。遅い返答・読めない時計をconfirmedへ補完しない。期限表は同期処理を強制中断する仕組みではない。
- 試行結果は従来のdisposition・create／handle／close flag・予約byte・主理由・cleanup理由を維持する。区分・表版の固定診断を追加するなら当該試行にのみ記録し、実pathや私的originを出さない。

## 3 閉鎖とStore失敗の分離

`D_save`をbridgeのguardが先に検出した場合、checkpoint受付だけをClosedにする。Storeのsave／consume／cancelは呼ばず、既存queueをretire診断として残す。健全なStoreなら、将来の限定manifest writerはmanifest区分の期限まで到達可能である。現段階の結合入口は引き続きcheckpointだけで、manifest writerを追加しない。

保存／消費中にStoreのguardが期限を検出すれば、従来どおりStoreのsticky失敗と致命的停止になる。**期限表を切り替えても、この失敗を解除してmanifestへ進めない。** 新run keyや別Storeを同rootへ作り直す回避も許さない。同じ境界時刻でも、bridge閉鎖とStore失敗は理由と残責務を別に保持し、どちらもackしない。

明示取消・D_stop・通常の観測停止ではStoreを取消さず、保存受付が開いている間はstop_requestedを含む残queueをFIFOで処理する。致命的停止だけがStore.cancelへ進む。共有clockの読取・検証はどの閉鎖後も残し、Store所有handleのcleanupを妨げない。不正値・逆行を無視してよいという意味ではない。

## 4 二つの状態面・終端入口

| 状態面 | 状態・責務 |
|---|---|
| checkpoint保存受付 | Idle／InFlight／Closed／Stopped。Closed／Stoppedからsave・receipt受理・ackへ戻らない |
| recorder終端 | NotRequested／Pending／Entered／Committed／Failed。先行確保した1 slot・1 claimだけを使う |

RunBridgeOwnerは子生成前にterminal診断slotとclaimを確保する。終端identityは同owner／run／recorder／budgetへ結び、保存の停止epochとは別に保持する。保存epochの進行を理由にcleanupやrecorder終端まで失効させない。診断には要求時／完了時の保存epochを残し、他ownerへ移譲しない。

将来の限定facadeから`finishRecorder`を要求できるが、callerが時刻・成功bool・四軸・queue・終端理由を供給するAPIにしない。内部owner状態から固定理由を選ぶ。通常の保存用enter／guardを迂回する**終端専用のprivate継続**であり、保存権限を迂回するfriendではない。

- 保存受付がまだ健全に開いている要求はnot_readyで拒否し、終端claimを消費しない。観測停止を勝手に保存閉鎖へ昇格させない。
- Closed／Stoppedで、保存／消費の同期区間が残っていればclaimを取りPendingだけを記録する。未解決handleはStoreが所有したまま。Storeのfinallyとbridge消費中slotの回収が戻るまでrecorder終端sectionへ入らない。
- Pendingは1件だけで再入・再要求をqueueへ積まない。安全な固定unwind点でEnteredへ進める。同期待originを再確認するが、正常save用のD_save guardは呼ばない。
- 既にrecorderがClosedなら既存結果を保持し、already_closedの診断だけでCommittedとする。recorderが生成されていなければnot_constructedとし、Closedになったと捏造しない。
- 二重要求・コピー・foreign owner・summaryからの終端再構成を拒否する。失敗してもclaimは返さず、自動retryしない。診断DATAは再実行権限ではない。

同期操作が永久に戻らなければPendingの完了も保証できない。実host／ProcessOwnerでの強制停止は別課題で、ここでは終了確認をUnknownのまま残す。

## 5 一度限りのterminal section・共有時間枠

終端の記録／判定費は元planのfinal予約（D_manifestからD_allまで）へ一度だけ所有させ、Storeのcleanup予約と二重に使わない。要求は保存閉鎖直後から行えて、D_allまで待つ必要はない。早く実行しても新しい時間枠を足さず、manifest／session票の締切を後ろへ動かさない。具体work／時間費用の上界は後続で確認し、未導出を受付可能とはしない。

1. 同identity・eligible状態・安全なunwindを確認してclaimをEnteredへ進める。元の状態・四軸・queue件数／参照順・既存診断を先行slotへ保持する。
2. 同共有clockを最大1回読む。例外・逆行・不正値はterminal.clock診断へ固定し、先行Store／bridge reasonを上書きしない。新clockへのfallbackをしない。
3. callback・await・clock・IO・public abandon／verify／publishを呼ばないprivate sectionで、同recorderの観測受付を閉じてClosedへ進める。queueは追加・除去・並替えしない。四軸・test異常・first reason・保存claim／予約をそのまま保持する。
4. pre-clockが有効だった場合だけ、最大1回のpost-clockでD_all内／等値以降／時刻不明を診断する。等値はlate。Committedというメモリ状態は後から巻き戻さない。post-clock中の再要求も元claimへ新たな権限を与えない。
5. 完了DATAは同ownerに固定する。clock不明や期限後でも、新規IOをせず可能なメモリ閉鎖を行うが、枠内完了・process終了・保存完了とは扱わない。有限回の記録であり、実wall-time内の実行保証ではない。

public abandonをそのまま使わない理由は、停止checkpoint追加とreason更新を伴い得るため。保存経路閉鎖後に新しいstop_requestedを捏造しない。D_stop通知が抜けてObservingのままなら、forced_from_observing／stop_not_observedを終端診断へ残す。試験未終端のincomplete軸をpassedへ変えず、試験終端後のcomplete軸もcleanupの都合で変更しない。

終端後も共有clock・Storeの既存cleanupを無効化しない。manifest区分の存在とrecorder Closedは独立であり、後続manifestがrecorder状態を記録しても、それだけでrun保全を成立させない。本書はmanifest／正常run終端の発行口を有効化しない。

## 6 queue・未受理件数・診断

terminal section前後で元queueの参照と順序を保持する。ownerの`unacknowledged`は常にqueue件数。recorder Closed後は`unsaved`も同件数になり、保存済み未ack・partial・未試行の区別は既存`saves[].attempt`／dispositionから読む。**未受理件数はbytes不存在を意味しない。**

ack済み件数・成功slot・消費済みreceipt・失敗claim・累積予約は不変。終端を通って再保存／再ackできない。新しい停止checkpointを後から発行しないため、終端だけでqueue件数が増減することもない。保存済み未ackから新たなreceiptを再発行しない。

terminal slotは固定理由・元状態／最終状態・clock診断・late・要求／完了状態・queue件数・保存epochだけを持つ。試行別主理由とcleanup理由、Store-wide first reason、bridge first reason、試験異常は別に保持する。cleanup confirmedはfake handleの返答、recorder Closedはメモリの受付閉鎖で、どちらもProcessOwnerのtermination confirmedではない。

未知の通知結果・未解決handle・clock不明はUnknownのまま。未確認の解放責務／leaseは診断とは別に所有元へ残し、terminal helperにそれを破棄する権限を与えない。OS leaseの具体方式は未実装である。必要なidentity／recorderが欠ける場合はFailedまたはnot_constructedを記録し、成功boolで埋めない。payload／私的証拠別名は固定unwindで外すが、診断・queueを削除／無限複製しない。raw例外・bytes・実path・環境・認証情報は出さない。

## 7 合成受入条件（未実施）

| ID | 対照 | 必須結果 |
|---|---|---|
| DT01 | 表の欠落／未知／重複、0／負／非整数／overflow、予約順序違い | 生成前拒否。旧legacy capへfallbackしない |
| DT02 | 生成後の入力・getter・clock差替え、別run／budget表の混入 | pin値不変、同生成元以外を拒否 |
| DT03 | 各rowの操作／cleanup期限の直前・等値・直後 | save／consume／closeの選択rowが一致。等値拒否／late、借用0 |
| DT04 | D_save後のcheckpointとmanifest、checkpoint receiptへmanifest期限の指定 | 健全Storeのmanifest rowだけ到達可能。receiptの期限借用0。必須集合の証明とは数えない |
| DT05 | 保存／消費中に期限切れ、先行sticky失敗後のmanifest | failure解除0、別root ownerによるやり直し0 |
| DT06 | D_stop→FIFO保存→D_save閉鎖→recorder終端 | 保存締切と観測停止を区別。未受理queueの参照順・四軸保持 |
| DT07 | 閉鎖後にObserving／Draining／Verifying／既Closedのrecorderを終端 | 生成済みは一度だけClosed。新checkpoint・ack・IOなし。既結果を上書きしない |
| DT08 | not_ready要求、二重／再入／foreign終端、入力DATAからの再構成 | eligible時だけ1 claim。Pending増殖・再実行・保存権限復活0 |
| DT09 | 取得handleのcleanup中に終端要求、通知throw・部分生成失敗 | Storeの1回の回収試行と結果固定を先に終える。未確認責務・主理由とcleanup結果を保持。二重close0 |
| DT10 | pre-clock例外／逆行、D_all等値／超過、post-clock失敗 | 有限read回数、期限延長0。可能なメモリ閉鎖と時刻不明／lateを分離 |
| DT11 | 保存済み未ack／partial／未試行が混在する閉鎖 | queue／未受理数・成功slot不変。終端後のunsavedを0へ補正しない |
| DT12 | 終端後のmanifest側cleanup、全header ack済み、raw例外／秘密 | 共有clock読取可能。保全／process終了への昇格0。秘密反射0 |

oracleは表生成器やterminal helperを呼ばず、手書きのrow／境界値／状態・queue順序表を使う。狙った故障点への到達をassertし、前段拒否で後段試験を成功扱いしない。生recorderでVerifying等を準備する場合はbranch対照と明示し、bound成功と区別する。compiled／梱包の負の対照も別に確認し、試験driverを配布物へ入れない。

## 8 後続の順序・未確認事項

1. **DT-A**: 固定表の純粋計算・strict構造検査・同run／budget binding。メモリStoreのsave／consume／closeへ接続し、legacy単体入口を維持する。
2. **DT-B**: privateな終端slot／claim・安全なPending／固定terminal section。queue不変・四軸・診断保持を確認し、save-lane guardから独立させる。
3. **DT-C**: D_stopから保存完了／閉鎖／終端まで、通知throw／部分生成失敗を含む連続fakeと費目上界を確認する。manifest rowは到達性だけで、正式writerの発行へ進めない。

全段階とも別の明示実装指示を要する。期限の具体値・terminal費用・正式保存先・保持／削除・OS backend・実承認は未承認／未確認。本文・容量モデル・ProcessOwner・manifest集合・session台帳・実採取は別課題であり、本書作成で状態を進めない。
