# WF-B EvidenceStore／recorder：一度限り接続の差分設計

Version: draft-0.9 / Date: 2026-11-05 / 基準HEAD: `fb91044` / SB-A実装基準HEAD: `2f1120f` / SB-B実装基準HEAD: `186cea6` / 試行別結果の実装基準HEAD: `85eb9ad`。

draft-0.9: [slot固定期限表・閉鎖後recorder終端の差分設計](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)を追加。receiptに結ぶ区分別rowと、保存guardから独立した一度限りterminal claim、queue不変／未受理件数・診断保持を具体化した。設計のみで実装・承認状態は変更しない。

draft-0.8のレビュー修正: partialのcleanupが`not_started`にならない実装に§5を合わせた。不足していたbridgeの対照を追加し、§7のBR04を実施済みとした。§8の「当時の記録」の範囲に§8.1を含めた。

draft-0.7: [Store試行別結果の検証記録](E2E_BEST_PRACTICE_WFB_STORE_ATTEMPT_2026-11-05.md)を追加。SB-Cの最初の段階として`saveAttempt`を実装し、bridgeは当該呼出しの凍結resultを保持する。slot区分別期限表と閉鎖後の最終終端は未実装のまま。

draft-0.6のレビュー修正: 試験終端後の余分な呼出しでStoreを取消し、未保存の証拠を失っていたので、`Draining`／`Verifying`での`state`理由は停止にしない。消費中の`D_save`超過を§4へ明記した。未受理件数の定義を実装に合わせ、§7へSB-A／SB-B時点の状況を追加した。

draft-0.5: [SB-B合成検証記録](E2E_BEST_PRACTICE_WFB_STORE_RECORDER_SBB_2026-11-05.md)を追加。同checkpointの固定header・メモリ保存・private消費・固定ackを接続した。public friendを増やさず試験用実装を共通kernelへ集約し、旧pathは同じclassの再exportとして維持する。実保存・run全体の保全・ProcessOwnerへの昇格はない。

draft-0.4のレビュー修正: 共有clockが停止後に例外を返し、Storeの解放処理を止めていたので、読取と受付を分けた。新しいkeyで同じrootに別Storeを作れたので、rootもclaimの対象にした。recorderの誤用を致命的停止へ分類した。`D_save`後のdiscardはStore.cancelを呼ばず閉鎖する。

draft-0.3: [SB-A合成検証記録](E2E_BEST_PRACTICE_WFB_STORE_RECORDER_SBA_2026-11-05.md)を追加。同生成元owner・別brand・run生成claim・元checkpointへの準備claimと固定discardを試験専用assemblyへ実装した。旧単体fakeの実装・入口は変更せず、新経路ではraw子instanceを非公開にする。保存証拠発行・保存／ack接続は未実装。

draft-0.2のレビュー修正: 取消でStoreまで閉じると停止後の証拠を保存できないため、観測停止と致命的停止を分けた。Storeの期限をslot区分ごとの固定表とし、`manifest.json`を`D_save`後も保存できるようにした。cleanupの`late`を反映した。試行別の結果にStore側の変更が必要なことを差分へ明記した。線形化sectionの処理を補った。

Status: **SB-A／SB-Bをメモリ内で合成検証。SB-Cの詳細診断・期限表と実保存は未対応。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。保存先・保持期間・運用cap／時間枠・停止方式は未承認。再採取・既存証拠copy／保管操作・実接続・実通信・設定変更・Pushを行わない。

親は[固定採取器契約](BEST_PRACTICE_WFB_FIXED_RECORDER_CONTRACT.md)と[EvidenceStore内部契約](BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_CONTRACT.md)。既存の単体fakeとレビュー修正を維持し、試験専用の新しい結合経路だけを後続対象とする。以下の型名は提案であり、既存コードに存在するとは限らない。

## 1 現状との差分・今回の境界

| 現状 | 接続後に必要な差分 |
|---|---|
| recorderの`acknowledge(slot)`は同じqueue先頭の参照だけを要求 | 同生成元で発行したprivate保存受理証拠を必須とし、直接ackを結合経路から使えなくする |
| Storeのreceiptは同store／runへ結合。`consume`の返値は凍結DATA | DATAを権限へ昇格せず、同Storeのprivate消費継続からのみack用証拠を渡す |
| Storeの保存情報はslot・size・digest | 同checkpoint origin・sequence・trigger・固定encoding版・期待bytesへ結ぶprivate結合情報を追加 |
| recorderとStoreはclock・停止・期限を個別保持 | 先行する単一RunBridgeOwnerから同clock／停止世代／絶対期限のreadonly viewを供給 |
| Storeのcleanupは直近saveの診断、recorderはqueue／unsavedを保持 | 各保存試行のcleanupを上位slotへ即時固定し、queue保持と独立に診断を残す |
| Storeの`snapshot`はstore全体のfirst reasonと累積値。sticky拒否された試行ではcleanupが前回のまま残り、create失敗と未試行が同じ`not_started` | **Storeを変更**し、拒否も含めた`save`ごとの試行結果（create試行の有無・その試行のcleanup・結果区分）を返す。store全体のfirst reasonとは別fieldにする |
| Storeの`deadline`／`cleanupDeadline`は全slotで1組 | **Storeを変更**し、生成時に固定するslot区分別の期限表にする（§4）。保存中に変更・再計算しない |
| recorderの`acknowledge`は内部でclockを読み、失敗時に停止処理へ進む | §3の線形化sectionに使えないため、bound経路専用のprivate ackを別に設ける |
| `publish(boolean)`／`verify(boolean)`は単体fake注入 | 本接続からは呼ばない。run保全／process終了の証明は後続のまま |

checkpoint本文・WF-A集約・実reporter・manifest集合・session票・ProcessOwner・OS storeは範囲外。結合試験は固定の小さいheader snapshotとメモリdriverだけを使い、実採取の入口を作らない。

## 2 同生成元・所有権と供給

`RunBridgeOwner`はrecorder／Storeより先に確保し、固定6件の保存診断slot・first failure slot・非再入claim・共有clock／停止ownerを所有する。owner確保失敗なら下位を生成しない。同じ閉じた生成継続から、次のidentityをprivateに供給する。

- run origin、recorder origin、Store origin、root identity、clock／budget origin、停止世代。
- recorderが発行したcheckpointの**元参照**、sequence、trigger。snapshotのコピーや値一致だけでは代替しない。
- sequence 1〜6に対応する`report.partial.0001.json`〜`.0006.json`。trigger名から別名を選ばず、実際の発行順へ一対一対応する。
- 固定encoding版・同snapshotから作ったprivate owned bytes、その実サイズとdigest。byte列は外部へ公開せず、検査からcopyの間にcallbackを挟まない。可変長buffer・subclassの長さ／iteratorを信頼しないというStoreの修正を引き継ぐ。

単体fakeの既存入口・試験は残すが、新しいbound recorder／Storeは別のprivate admissionで区別する。既存`acknowledge`や`consume`の公開DATAからbound経路へ登録／昇格できるfriendを作らない。結合ownerの生成は同runにつき一度だけclaimし、失敗しても再生成してStoreのsticky失敗・累積枠を回避しない。claimは試験module内のprivateなWeakSetにrun tokenをkeyとして持つ。同じrootにも1 ownerだけとし、同様にWeakSetでclaimして返さない。run tokenは呼出し側が作れるので、これだけでは新しいtokenで別Storeを得られるためである。実sessionや製品runtimeの台帳とは共有せず、process間の一意性は保証しない（session台帳の後続課題）。

`conditions_ready`も他のcheckpointと同じ連番partialへ保存する。これは`conditions.json`自体の検証・R01〜R08承認を代替しない。今回のfakeで子起動状態へ進むとしても、実processを起動する権限はない。

## 3 保存からackまでの固定手順

bridgeの利用状態は `Idle → InFlight → Idle`、致命的停止で`Stopped`となり再開しない。`D_save`で`Closed`（保存経路だけの閉鎖）となり再開しない。観測停止（§4）では状態を変えない。全体に非再入。checkpointごとの状態は`Pending → Claimed → Saved → Acknowledged`、途中失敗は`Failed`で終える。

1. queue先頭の元参照・同run／origin・未claim・sequence／保存名対応・共有停止世代を確認する。checkpoint用claimを先に消費し、以後失敗しても返さない。
2. 固定headerを内部encodingし、有限byte上限・予約を確認する。期待bytes／digestを同じsnapshotへ固定する。後からsnapshotを取り直して別bytesへ差し替えない。
3. 同Storeの`save`を1回だけ呼ぶ。Store内の有限short write／EINTRは既存費目。bridgeは新たなretryや代替slotを発行しない。取得handleのcleanupは最後までStoreが所有する。
4. saveが返った時点で、receiptの有無にかかわらず、Storeが返す同試行の結果（§1）とstore全体のfirst reason・byte予約結果を先行診断slotへ固定する。callbackが途中で失敗しても、後続saveで上書きしない。
5. 成功receiptを同Storeのprivate継続で一度だけ消費する。同run・Store・checkpoint origin・sequence・trigger・encoding版・slot・実size・期待digestを照合する。claimの消費は失敗時も不可逆とするが、sticky拒否下で観測できない内部順序を試験で証明したとは呼ばない。
6. privateな`StoredCheckpointEvidence`をbridgeの消費中slotへ置く。コピー／foreign receipt／返値DATAからの生成はできない。pre／post guardで同owner・予算・停止世代・queue先頭を再確認する。
7. 最後のguard後、**callback・await・clock読取・IOを挟まず、事前確保したものだけを使い、失敗し得る処理を呼ばない固定section**で、同証拠を消費し、同queue先頭を1件だけ外し、`conditions_ready`なら`start()`が要求する書込済みフラグを立て、当該slotをAcknowledgedへ進める。これをackの線形化点とする。必要な結果／診断containerは先行確保する。現行の`acknowledge`はclockを読むので使わず、bound経路専用のprivate ackを設ける。JavaScriptの内部割当てが起きないことは保証・検証しない。

線形化点前に必要情報が欠けた場合はqueueを外さない。ack後の失敗を理由に同checkpointを再save／再ackしない。任意hookを線形化sectionへ注入する設計は避け、前後の故障点を合成試験で区別する。新規実装でこの固定sectionの前提を満たせなければ、成功経路を有効化しない。

Storeの既存`consume`返値は引き続きDATAである。新private継続は同constructor内に限定し、任意callbackへreceiptや権限を渡す汎用APIにしない。証拠・receipt・owned byteの別名は成功／失敗の固定終端で外し、診断DATAだけを残す。これは機密bytesの物理消去保証ではない。

## 4 共有期限・取消

ownerは元runの開始時点・単調clock・`planTime`の絶対期限・停止世代を一度pinする。recorderとStoreへ異なるclockや新しい開始時点を渡さず、残時間から期限を再計算しない。共有viewは別runやserialized summaryから作れない。

- 既存のflush工程終端を`D_flush`（現在の計画のstages[3]）とする。この内側に正・有限のStore cleanup予約`C_store`を**切り分け**、`D_save = D_flush − C_store`、`D_store_cleanup = D_flush`とする。checkpointのsave・receipt消費・ackのguardは`D_save`、取得済みhandleのclose確認は`D_store_cleanup`まで。
- Storeは次の期限表を生成時に固定する。

  | slot区分 | 操作の期限 | cleanup期限 |
  |---|---|---|
  | `conditions.json`・source写し・`report.partial.*`・`report.final.json`・`termination.json`・`analysis.json` | `D_save` | `D_store_cleanup` |
  | `manifest.json` | `D_manifest_save = D_manifest − C_manifest` | `D_manifest`（stages[4]） |

  `C_manifest`もmanifest工程の内側を切り分ける正・有限の予約で、`D_flush < D_manifest_save < D_manifest`を保つ。manifestの保存自体は範囲外だが、期限表で後続の経路を塞がない。
- `D_save`到達ではbridgeがcheckpoint経路だけを`Closed`にする。Storeを呼ばないので、Store失敗にも`Store.cancel`にもしない。保存中または消費中に`D_save`を超えた場合はStoreの`deadline`失敗で、後述の致命的停止となる。同じ時刻でも、bridgeのguardが先に読めば`Closed`、Storeのguardが先に読めば致命的停止で、どちらもackしない。
- `C_store`は新しい時間の追加ではない。正のflush工程を二分し、`stages[2] < D_save < D_store_cleanup = D_flush < D_manifest ≤ D_all`を保つ。加減算のoverflow・空の処理枠を拒否し、manifest／session票の後続予約を借用しない。byte処理／再読／ackに使える残枠が不足する場合は新規saveを始めない。具体値と費用モデルは未承認・後続確認事項で、未導出の受付保証はUnknownのまま。
- 共有clockは読取と検証だけを担い、停止後も読める。受付の判定はguardが行う。Storeが取得済みhandleのcleanup時刻を読むためで、不正な値と逆行は停止後も拒否する。
- deadlineは全operationの前後、ack直前にも検査し、等値で拒否する。同期操作が期限後に返った場合は新たな成功証拠へ進めない。closeは期限前に成功返答を確認できた場合だけconfirmed。同期処理の途中停止や実wall-time保証ではない。
- **観測停止**（明示取消・`D_stop`到達・採取器の停止要求）: recorderへ通知し、新規観測を止める。Storeは閉じず、停止世代も変えない。処理中の保存はそのままackまで進め、`stop_requested`を含むqueueの残りを`D_save`までFIFOで保存する。親契約§4の`stop_requested`と§5の停止後の作成予約を満たすための区別である。recorderがClosedなら（Reservedでの取消等）新規保存もackも行わず、queueの残りはunsavedとして残す。
- recorderの理由は次のとおり分類する。`cancelled`・`deadline`・`window`は観測停止。`clock`・`state`（誤用）・`binding`（gate拒否・矛盾する引数）は致命的停止。ただし`Draining`／`Verifying`での`state`は、試験終端後の余分な呼出しによるrecorderの診断なので停止にせず、呼出しへ`false`を返す。queueの証拠を保存し続けるためである。
- **致命的停止**（clock不正・binding不一致・Store失敗・recorderの誤用）: 同ownerの停止へ合流する。まずownerをStoppedとして停止世代を進め、新規save／receipt受理／ackを閉じ、次にStore.cancel、recorder停止通知の順で同期通知する。各通知は一度だけclaimし、片方のthrowでも固定診断を保持して他方と取得済みhandleの回収責務を省略しない。通知中に再入しても新規権限を与えない。Store.cancelはこの場合だけ呼ぶ。
- 通常のcase／module／hook失敗は停止要求ではない。first anomaly保存を試み、suite継続と観測終端を妨げない。採取器の失敗・利用者取消と混同しない。

どの停止後も取得済みhandleの解放責務は残る。cleanupにより新規saveが再許可されたり、期限原点が更新されたりしない。bridgeがStoppedになっても、recorderをDrainingからObservingへ戻さない。Published／Closed後は新規bridge保存なし。

## 5 cleanup診断・四軸・queue／unsaved

| 保存試行の終わり | queue／ack | 上位に残す区分 |
|---|---|---|
| create前拒否（sticky拒否を含む） | 元先頭を維持 | not_started、固定reason、claim済み、予約状況 |
| create試行の失敗（handle未取得） | 元先頭を維持 | create_failed、cleanupはnot_started。未回収resourceがないことはdriverの前提で、未実証 |
| 部分書込・flush／close／再読失敗 | 元先頭を維持 | partial_unverified、cleanup（confirmed／late／unconfirmed）、first reason |
| receipt発行後、消費／post guard拒否 | 元先頭を維持。receiptの再利用不可 | saved_unacknowledged、保存size／digestの診断DATA、cleanup |
| 固定ack完了 | 同先頭だけ1件除去 | acknowledged、同sequence、cleanup |

`saved_unacknowledged`はprivate診断を残すための区分であり、receiptの再発行や再開権限ではない。bridge失敗後は別Storeを作り直したり、同名を上書きしたりしない。致命的停止に伴いrecorderが`stop_requested`を追加しても、失敗済みStoreへ再帰的に保存しにいかずqueueへ残す。観測停止では§4のとおり保存する。

Closedではack不可、queueの残りとその順序を診断として保持する。**未受理件数はownerの`unacknowledged`**で、閉鎖の理由を問わずqueue件数を返す。recorderの`unsaved`は、recorder自体がClosedのときだけ同じ件数を返し、それ以外は0である（`D_save`閉鎖ではrecorderがClosedではないので0）。どちらも物理的なbytes不存在を意味しない。保存済み未ack件数・partial件数は固定slotの`saves`から区別する。Closedへ進むだけでqueueを消したり、残数を0へ補正したりしない。

recorderのtest_result／measurementは既存契約を維持し、試験終端後のStore／cleanup失敗では書き換えない。Storeのclose confirmedはartifact handleのfake解放だけで、ProcessOwnerのtermination confirmedではない。`late`はconfirmedと同じ扱いにせず、時間予約内の解放の証拠にしない。checkpointが全てack済みでもmanifest／必須集合／session票の受理なしにpreservation verifiedへ進めない。本接続は`publish(true)`／`verify(true)`を注入しない。

上位診断は、最初のbridge停止理由、Store reason、試験異常、各保存のcleanup、recorder状態とqueue残数を別fieldで保持する。raw例外・bytes・URL・path・認証情報を反射しない。未知のcleanup／process状態はUnknownのままで、欠けた証拠をconfirmedへ補完しない。

## 6 費目所有・容量

| 費目 | 所有者／規則 |
|---|---|
| checkpoint claim・1回のsave／receipt／ack | bridge。最大6件。再入・失敗でも枠を返さない |
| header encoding／期待digest・private scratch | bridge。copy前の実byte検査と有限上限。後続の本文容量契約とは分離 |
| file／累積byte予約、write試行、EINTR、flush・close・再読 | Store。現行費目を二重計上しない。失敗しても予約を返さない |
| 共有時刻・停止・工程予約 | RunBridgeOwner。clock検査にも有限の操作数上界を持たせる |
| 元checkpoint snapshot・閉鎖後queue | recorder。最大6件を維持し、ack前の破棄をしない |
| 未解決handle／cleanup | Storeが解放を所有し、上位は診断を保持。bridgeで二重closeしない |

Storeの64KiB／1MiB等は合成構造上限であり、実観測本文に適合するcapではない。本文・UTF-8総量・serialization scratch・6snapshotの同時保持・共有session会計の詳細は次段階。bindingのためのprivate複製／hashの費用も明示し、既存費目へ無断で隠さない。

## 7 合成受入条件

| ID | 注入／境界 | 独立した期待値 |
|---|---|---|
| BR01 | 正常な6trigger、発生順の違いと未発生trigger | sequence→保存名の手書き表どおり、同先頭だけ各1ack。発行済み枠は復活しない |
| BR02 | 別run／recorder／Store／checkpoint、コピー・同値の元参照、slot／digest／size／encoding不一致 | create前で拒否できるものはcreate=0。それ以外もack=0・queue不変・固定失敗 |
| BR03 | 外部DATA／summary／偽receipt、直接ack／legacy入口、二重save／consume／ack | 新bound経路へ昇格0、成功分の二重消費0、旧単体試験の保証は別に維持 |
| BR04 | 部分書込・EINTR境界・create試行失敗・flush／close／再読失敗・同長hash不一致、sticky失敗後の次の保存 | Storeの手書き試行列どおり、bridge retry=0。cleanup最大1回、元先頭が残る。試行別結果がcreate試行の有無を区別し、拒否された試行に前回のcleanupを写さない |
| BR05 | receipt発行直後、consume前後、最終guard直前の致命的停止／`D_save`到達／世代変更 | 線形化点前はack=0、saved_unacknowledgedとqueue／`unacknowledged`保持 |
| BR06 | ack後の停止・残queueを持つClosed、Store失敗に伴うstop_requested追加 | 成功分をqueueへ戻さない。未ackだけ残し、停止checkpointを再帰保存しない |
| BR07 | 残時間による期限作り直し、別clock、逆行・例外・遅いclose、cleanup等値 | 原点不変。`D_save`／`D_store_cleanup`はflush枠内、期限延長0。期限以降の成功返答は`late`、失敗返答と時刻を読めない場合はunconfirmed |
| BR08 | save／consume／guard／停止通知中の再入、部分生成失敗 | 新規権限0、claim不可逆、handleの二重close0、先行診断保持 |
| BR09 | test失敗とStore故障の組合せ、試験終端後のcleanup失敗、全checkpoint ack済み | test／measurement不変、artifact解放からprocess終了を推定しない、run保全への昇格0 |
| BR10 | 初期cap／byte予約不足、可変buffer／subclass、閉鎖後payload破棄 | copy前の実サイズと元snapshotが対応。cap超過は固定理由、queue診断を消さず本文別名を残さない |
| BR11 | 健全なStoreでObserving中に明示取消・`D_stop`到達、保存中の取消 | Store.cancel=0、Store reasonなし。手書きのqueue（例: `child_started`、`stop_requested`）がsequence順に保存・ackされ`unacknowledged`=0。処理中の保存はackまで進む |
| BR12 | `D_save`の前後と等値、残queueあり。Reservedでの取消 | 等値以降は新規save=0・Store呼出し=0・Store.cancel=0。残りは`unacknowledged`でqueue順を保持。Reservedの取消はack=0 |
| BR13 | slot区分別期限の境界。`D_save`後の`manifest.json`とcheckpoint、期限表の不正な順序 | `D_save`後でもmanifestの期限表には到達でき、checkpointは拒否される。順序不正はStoreを生成しない。実manifest集合の検証とは呼ばない |
| BR14 | `conditions_ready`のack成功・線形化点前の失敗 | ack成功時だけ`start()`へ進める。失敗時は子起動0 |

SB-A／SB-B／試行別結果の時点の状況は次のとおり。実施済みはメモリfakeでの確認で、実保存の証明ではない。

| ID | 状況 | 残り |
|---|---|---|
| BR01、BR05、BR14 | 実施済み | なし |
| BR02 | 一部 | encoding版の不一致。slot・size・digest・別owner・コピーは実施済み |
| BR03 | 一部 | 成功分の二重消費は、receiptの再利用経路がないので到達不能 |
| BR04 | 実施済み | なし。sticky失敗後の次の保存は、bridgeが健全時しか保存を始めないので、Storeの取消を直前に差し込んで確認した |
| BR06 | 一部 | 成功分の保持は実施済み。停止checkpointの非再帰は明示の対照なし |
| BR07 | 一部 | 別clockの対照。`late`・逆行・原点は実施済み |
| BR08 | 一部 | 通知throw・部分生成の連続対照 |
| BR09 | 一部 | 試験終端後のcleanup失敗 |
| BR10 | 一部 | 可変buffer・subclassは単体Storeのみ。閉鎖後のpayload破棄は未実施 |
| BR11 | 一部 | 観測中の明示取消は実施済み。`D_stop`到達から保存完了までの連続対照 |
| BR12 | 一部 | `D_save`等値とReservedの取消は実施済み。残queueの順序の連続対照 |
| BR13 | 未実施 | slot区分別の期限表が未実装 |

oracleはbridge自身のmapper／encoder／guardを呼ばず、固定expected header・golden digest・イベント順・queue残数を独立定義する。各負の対照は狙った故障点へ到達したことをassertする。compile／配布物の負の対照ではprivate証拠を外部生成できず、試験登録口・driverが製品へ入らないことを確認する。線形化の中間故障を無理に注入して実装に新callbackを持ち込まない。

## 8 後続の実装分割と未確認事項

1. **SB-A（準備内部契約を実装済み）**: 同生成元owner・run／checkpoint binding・private証拠型の予約・一度限りclaimと固定discard。旧試験を残したまま混入／直接ackを拒否する合成経路を追加した。StoredCheckpointEvidenceの発行はない。
2. **SB-B（メモリ接続済み）**: 同snapshotの固定header encodingとStore保存／private消費／固定ackを接続。保存後の失敗・queue／未受理件数の区分を確認した。§8.2の範囲を参照。
3. **SB-C**: [固定期限表・recorder終端の差分設計](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)のDT-A→DT-B→DT-Cで具体化する。同clock／停止owner、上位cleanup診断・部分生成の回収を連続fakeで確認する。SB-B時点でも期限／取消の最低限の共通guardを省略せず、詳細な境界対照をここで補完する。

SB-Aの生成・準備claim、SB-Bのメモリ保存・線形化section、Store試行別結果の分類までを実装。slot区分別期限表・閉鎖後の最終終端・詳細費目は未実装。byte／work／時間の運用値、正式保存先、保管／削除、OS backendは未承認・未確認のまま。storeとrecorderが繋がっても、採取・保全・process監督の開始許可にはならない。

試行別結果追加後は`persist`が`saveAttempt`を呼び、戻りのreceiptだけを既存private consumerへ渡す。診断には同じattempt objectを保持し、snapshotの過去cleanupから推定しない。従来の上位粗分類`attempted_unverified`は互換で残し、詳細は`attempt.disposition`でnot_started／create_failed／partial_unverified／savedを区別する。下位methodそのものがthrowして戻らなければattemptは未定義であり、証拠不足として扱う。以下§8.1の未実装一覧にある試行別結果と、§8.2の「試行別結果はSB-Cへ残る」は当時の記録で、この部分は今回解消した。

### 8.1 SB-Aの実装境界

`tests/review/fixtures/store-recorder-binding.ts`は既存recorder／Storeを同じprivate継続で生成し、公開面は別brandのopaque参照と限定操作だけにする。旧子instanceへのreferenceは返さない。checkpointは元のqueue先頭から内部発行したbindingだけを受け、raw checkpoint・コピー・summaryも拒否する。型上のbrandと実行時の参照同一性を両方検査する。

ownerの6 slotは準備状態だけを保持し、実保存の試行別cleanup slotではない。run生成claimはmodule-private WeakSetへ先に記録し、生成失敗でも返さない。準備成功はInFlightとなるが、保存へは進めない。終わり方は固定discard（Stopped）、観測停止（Closed）、`D_save`到達（Closed）、致命的停止（Stopped）のいずれかである。discardも先にguardを通るので、`D_save`以降はStore.cancelを呼ばず閉鎖する。再入・二重準備・foreign claimも停止させ、元queueと診断を残す。失敗時は私的なcheckpoint／claim別名をretireし、共有参照を再利用しない。

clock viewと計画値を先行pinし、checkpoint用D_save／cleanup境界の構造条件だけを検査する。生成時の合成値は運用capではない。準備中の観測停止は致命的停止にせず、ReservedのrecorderをClosedにしてStoreは取消さない。D_save到達も保存側だけを閉じ、Store操作／取消をしない。共有clockは停止後も読めるので、処理中のStoreはcleanupを続けられる。recorderの誤用とgate拒否は致命的停止で、Storeを取消す。Closed時のbound診断は`unacknowledged`を持ち、recorder自体がClosedでない場合の旧`unsaved=0`と区別する。これは実保存bytesの有無を表さない。

SB-Aではconditions_readyをackできないので、観測状態へ進める成功経路・6checkpointの連続保存・保存中の取消継続は検証できない。SB-B／SB-Cへ残し、手前のgate拒否を後段の成功実証と数えない。既存子fakeは変更しておらず、slot別期限表・試行別結果・private Store consumer・callbackなしprivate ackは未実装。`D_save`で閉鎖した後の`observeStop`はrecorderへ伝えない（現状を試験で固定）。recorderを終端させる経路はSB-Cで決める。

### 8.2 SB-Bの実装境界

§8.1はSB-A単独時点の記録として残す。SB-Bでは`persist(PreparationClaim)`だけを追加し、外部からbytes・receipt・consumer callbackを渡せない固定継続にする。class実装を`tests/review/fixtures/store-recorder-kernel.ts`に機械的に集約し、旧3 pathは再exportにした。同moduleのstatic blockに閉じたprivate consume／ackだけを設け、公開DATAから証拠を生成する口はない。移動だけの段階で旧277件が成功した。

固定encodingはUTF-8／ASCII、key順は`version,sequence,trigger,at`、versionは`wfb-checkpoint-1`、末尾LF。元の凍結checkpointのscalarだけを内部で使い、再snapshotやcaller getterを挟まない。sequenceは1〜6、atはsafe非負整数、trigger最長16文字なのでheader最大95 byte。実装の構造上限160文字とStore file capをencoding前に検査する。本文・承認票・run identityをこのJSONから発行しない。

同private bytesから期待size／digestを作り、同Storeのsave結果をprivate WeakMapに基づくconsumerで照合・一度だけ消費する。private証拠には元checkpoint・receipt origin・owner epochを保持し、前後guard後に同queue先頭だけを固定ackする。conditions_readyの書込済みフラグも同sectionで立てる。公開`acknowledge`／`consume`を呼ばず、queue操作も先行captureした組込み関数を使う。JS内部の割当て／停止の不存在は保証しない。

各slotへ`not_started／attempted_unverified／saved_unacknowledged／acknowledged`、期待file／size／digest、saveのcleanup／reason、consumer失敗reasonを保存する。`attempted_unverified`はcreate試行の有無・partialの完全分類ではなく、§1で要求したStoreの試行別結果はSB-Cへ残る。今回のbridgeは健全時のsaveしか始めず、失敗後の次試行を呼ばないので、前回cleanupを新しいsave結果に複写しない。未試行slotのcleanupは未定義のまま。

保存後の期限／guard拒否では元先頭を残し、保存済み未ackを記録する。`unacknowledged`はbridge閉鎖時もqueue件数、recorderの`unsaved`はrecorder自体がClosedになった時の未受理件数であり、どちらもbytes不存在の証明ではない。ack済みslotは後続失敗でも退役表示へ戻さず、成功件数・診断を保持する。期待bytesとreceipt／証拠の別名は固定終端で外す。

観測中の取消はStoreを閉じず、現在の保存とstop_requestedのFIFO保存を継続できる。Reserved取消はClosedなので保存済みでもackしない。致命的停止後も共有clockはcleanup用に読める。全checkpointがack済みでもtest／measurement以外のrun保全・process終了軸は既存の未確認値から進めない。manifest区分の期限表・run終端・OS backend・実観測本文・容量モデルはSB-C以降のままである。
