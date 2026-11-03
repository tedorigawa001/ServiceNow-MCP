# OB-03：移譲先owner・seal接続と本文／混合manifest比較

Version: br006-recovery-ob03-destination-content-draft-0.1 / Date: 2026-11-03。
基準HEAD: `4f82d9c`。Status: **設計のみ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実装・seal成功・実接続・実通信・設定変更・Pushは行わない。**

[OD-B設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)§3〜7、[OB-02接続](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)§6〜8と[PD-B接続](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PENDING_PREFIX_BINDING_DESIGN.md)§10の差分。prefix関係値を確認できることと、元本文を保持したmixed内容を一つの移譲先へsealできることを分離する。調査時のkernel作業中差分は変更せず、本稿の現行到達点は上記コミットを基準とする。

## 1 現行到達点と再利用禁止

現行`createSyntheticNormalTransferRoot`は同accepted／内容を一度takeし、PD-A比較・post関係値受理を経て、引数なしの固定consumerで関係値を消費・破棄し、必ず固定abortする。この動作と旧試験を維持する。

消費済み関係値の再発行、元accepted slotの復元、spent handoffの再bind、summaryからの再構成でsealへ進めない。既存公開`sealRecoveryFinishExpectation`を先に成功させ、別取引で内容移譲を足す方式も禁止する。今回の詳細設計だけで固定abortを外さない。

将来のOB-03は**別fresh合成rootと同module内の固定destination継続**を設計対象とする。旧rootの一般的なmode引数／callback、外部dest／accepted／manifest登録口は作らない。新rootも同生成元のtake・header／projection受領・関係値消費を一度だけ通り、固定consumerの役割を「破棄」か「同destへのcommit」のどちらかにconstructor内部で固定する。旧rootで消費した関係値を新rootへ渡さない。

## 2 二つの本文比較を区別する

| 段階 | 比較するもの／到達保証 | 保証しないこと |
| --- | --- | --- |
| seal前の供給内容比較（本設計） | 同OwnedMixedSupplyの元列・row台帳・親traceと、固定assemblerが作る全行manifest／本文を照合。元reviewed全fieldを保持し、変換は承認済み親省略だけ | 実worker wire／実payload由来、まだ存在しないfinish応答の一致 |
| seal後のfinish本文比較（後続OD-C） | 同finish jobから受領したbounded全応答を、sealed expected manifest／元本文と照合 | schema適合やprefix一致だけによる内容保証、別job／summaryの採用 |

seal前のローカル期待値を将来の実応答と同じものとして扱わない。`projectRecoveryFinishExpectation`と`compareRecoveryFinishValues`の既存小型契約はcontext／manifestを扱い、reviewedのfindingsやrecommendations等の全本文を比較しない。これらの成功をfull content checkに昇格させない。

また、新検査が合成DATAをfull schema検査しても、既存`content_evidence`の`original_body:unknown／full_schema:unverified／wire:unverified`を実証拠として書き換えない。新しい合成内の比較範囲は別の内部型で表す。既存CaptureAssembly等の別rootのhandleを後付け登録しない。

## 3 所有者・private型の責務

名称は案であり未実装。全owner／失敗slot／claimをDATA検査やpayload確保より先に同constructionで生成する。

| 内部保持物 | 生成元・保持内容 | 一度限りの責務 |
| --- | --- | --- |
| DestinationOwner | 同construction tokenと未使用のdest slot・失効serial | caller指定不可。正常payloadの受理先は一つだけ |
| PendingBoundTransfer | 現行同takeのaccepted／plan／handoff・CompletedMixedContent・同pins／row／input／budget | 元slotは既に外れ、再準備・復元不可。保護scope外へ出さない |
| FullMixedDraft | 同pendingの元列・親変換後全行、同body参照と必要なbounded値、P0／Pp／trace・入力対応 | work中の非実行値。単独の成功boolやcopyを証拠として登録しない |
| ContentChecked | 同pending／row台帳・draft・model・budget／失効serialに結合した内部検査結果 | 固定検査継続だけが生成し、postで再照合。prefix関係値とは別の証拠 |
| TakenSealProjection | 同accepted受理済みprojectionへのprivate受領物 | 同take／既存receipt claimから一度だけ供給。再投影は比較用であり発行元の代用品ではない |
| SealedMixedBundle | 同destが所有するexpectation・全mixed manifest／元本文・accepted origin・終端責務への結合 | post後にのみcommit可能。公開には空handleだけで本文getterなし |
| TerminalOwner／FailureOwner | 同source／cleanup／新世代等の最小解放責務と固定診断 | payload利用権限とは別。正常確認とhard時の未解決custodyを混同しない |

値配列の参照が検査用に重複していても、利用可能ownerは増やさない。固定scopeだけが借用でき、元／pending／destの状態に応じて一つだけが利用可能となる。元本文のcopyを新しいoriginal originとして登録しない。

## 4 全行manifestと本文の比較契約

供給元は同`pending.content.owned.model`の`original_rows／assets／trace／selected`と同row台帳、同pins／inputsだけ。ID一致は検索の補助であり、row・一般row receipt・input receipt・元accepted outcomeのprivate参照対応を別途検査する。選択順は同じ昇順、集合は一意かつ完全、retainedは連続末尾を維持する。

| 行 | 固定assemblerの出力と検査 |
| --- | --- |
| reviewed keep | 同元reviewed全assetを保持。resultの全schema field・findings／evidence／recommendations等の配列順序・重複・optional fieldの有無と値を照合。ID／contextだけの検査にしない |
| reviewed→親result_omitted | 同元reviewed本文／accepted outcome・input receiptをprivateに保持し、同traceのparent_omitと照合。公開outcomeは既存のstate／ID／response_limitだけ。元本文を元worker omittedへ付替えない |
| 元worker result_omitted | 同producer／元state・固定reasonを維持。reviewed_originはnullで、元reviewed本文や親省略decisionを捏造しない |
| その他nonreviewed | NR契約のstate×producerとstrict field／reasonを完全比較。metadata行のinput不在、retrieval／analysisのinput条件を維持 |
| retained not_processed | 同not_processed input・T_i・deadline_exceededを維持。completedへの付替えや途中位置への挿入を拒否 |

親省略は一部findingsを削って100件へ収める方式にしない。既存OM-Aの全asset keep／omit、原順序のP0→Pp・traceと保持findings合計を照合し、親prefixの変更は同PD関係値だけで証明する。実装の再実行だけを独立oracleの代用にしない。

reviewed出力0件でも親省略により元reviewedがあれば、元body数／originを保持する。真に元reviewed0件の場合だけ同全partitionのゼロ状態を保持し、空manifestや架空empty proofで欠落を救済しない。既存回復subsetの選択1〜100・active not_processed必須・0.3削除行拒否を維持する。

比較はschemaで許された全fieldを対象にし、object keyの列挙順には依存しない。配列の追加sort／dedup、Unicode正規化、string trim、hash一致だけの短絡で不一致を消さない。変更可能性を残したcaller objectを検査後に借用し続けず、同constructorが既に所有するfreeze済み値を使う。

対応schema／ruleset版は同pinsの版へ固定し、未知field・未対応variantを無言でstripして一致扱いしない。対象は受理済み型付き本文の意味的なfield一致であり、JSONの空白・object key順などwire文字列表現の同一性ではない。wire由来の証明は別のまま残す。

## 5 accepted投影と小型expectationの供給

現行のheader consumerは同accepted projectionを保持するprivate slotを消費してheaderだけを渡す。OB-03でfull metadata再照合が必要なら、**新rootの同take・同receipt消費の中**でprivate projection比較と必要値の移譲を完了する固定継続を設計する。headerを受け取った後に二度目のconsumeを追加しない。旧header consumer／旧rootの公開契約は維持する。

同planからの再投影は、同受理済みprojectionとの完全値比較に限って利用できる。placeholder route／新しく作ったaccepted／後から復元したheaderをoriginalの代わりにしない。run／session／source／key／origin／budget／release／window・frame／ready／cleanup・S／O／T_i／U／全deadline、版・target・policy／coverage等の既存検査を維持する。prefix関係値だけではfull header適合を証明しない。

小型expectationの局所上限へ全reviewed本文を一括で詰めない。context用expectationと全行manifest／元本文は別保持物として同bundleへ結合し、一方だけの成功をsealと呼ばない。本文は既存OM-A等の各asset bounded枠を維持し、全列・copyピーク・比較費用の不足は停止条件にする。未導出の総量capを黙って導入・拡張しない。

## 6 一度限りの移譲とatomic commit

新rootの固定操作案`sealBoundMixedExpectation()`は外部accepted／manifest／destを引数に取らない。処理順は以下に固定するが、今回実装・seal成功は有効化しない。

1. 同ownerのbusy／first hardを確認し、transfer／content準備claimを先に消費。元accepted・内容・採用ticketを同pendingへtakeする。
2. pre guardと同identity／live route／未開始cleanupを検査。停止したら再取得せず全破棄へ進む。
3. workでFullMixedDraft・全行／本文比較・既存投影との比較・小型expectation・PD暫定候補を作る。dest bundleと公開用空handleも未公開の状態で必要確保／検査を済ませる。shape／limit／不一致は暫定保持する。
4. post guardを実施し、同pending／projection receipt／row／model／budget／失効serial・source／cleanupを再確認。post取消・期限・先行hardをwork不一致より優先する。
5. post後だけprefix関係値を受理する。新rootの固定consumerがroot側one-shotを消費し、関係値とContentChecked・未公開bundleが同pending由来であることを照合する。旧(C)で既に消費された関係値を受け取らない。
6. **一つの固定commit section**でpayload責務を同dest bundleへ移し、pending・借用slot・一時relationを外す。destの利用可能状態への切替を最後の線形化点とする。途中でcaller hook／await／I/O／追加guard／任意getterを呼ばず、新規の解析・確保・通知をしない。
7. commit後だけ同destの空handleを返せる。元slotは復元せず、元pendingとdestが同時に利用可能な状態を作らない。成功件数1と元payload利用権限0を一体で確定する。

atomicはJS内の同期所有権・状態遷移を指し、プロセス停止・OOM・OS資源のtransactionを保証しない。final sectionへ入る前に可能な失敗を局所化する。commit前の失敗は未公開bundleを破棄し成功0、commit後にhardが起きた場合はdestを同期失効して同失敗経路へ進め、元ownerへのrollbackで救済しない。

## 7 失敗時破棄と終端責務

任意の失敗位置で元／pending／未公開dest／公開済みdestの全payload利用権限を外し、元本文・manifest・pins・expectation・projection・関係値・一時copyの参照を固定clearする。本文破棄証拠は保護scopeが終了し、新slotを含むisClearedが成立した後だけ発行する。未公開bundleがclosure等へ残る場合も成功扱いしない。

上位custodyへ移すのは同constructionのcleanup-only capsuleと固定診断だけ。本文やheader／manifestをcapsuleへ隠して渡さない。commit前後で解放責務のholderを二重化せず、先行hard・cleanup診断・Unknownを保持する。比較失敗のraw例外・本文・sys_idを上位へ出さない。

正常時もsource close／cleanup開始でdest payloadを同期失効し、最小terminal-only証拠だけを残す。同source closed＋同cleanup confirmedを満たした固定discardだけが正常終端を消費できる。hard後に通常source close／accepted正常discardを通せるとは仮定せず、未解決は既存FailureOwnerへ保存する。この正常終端接続はseal commitと別に設計・検証し、未確認のまま完成成功票を作らない。

## 8 費目所有・失敗時停止・未確認事項

| 費目 | 所有者／要計数内容 |
| --- | --- |
| 元列／本文保持・row／input索引 | 同供給owner→同pending→同dest。引継ぎは利用権限のmoveで、再copy費用をゼロ扱いしない |
| full schema／本文比較・親trace照合 | 同work。全field／全行の最悪走査、比較用copy・stack・索引・失敗経路を含む |
| 既存投影再検査・expectation・PD関係値 | 同private取引。既存小型予算とは別に重複copyと保持ピークを計数 |
| post検査・claim・commit／clear | 固定owner。成功／拒否／取消・commit前後の費目を分ける |
| terminal-only／失敗custody | 固定終了owner。payloadを含まない責務保持とlate cleanupを区別 |

元C/G/P・retry・210試行・全60秒を維持する。総work／heap・3round配賦・中断粒度・全列の必要予約は未導出／Unknownであり、seal実装の成功だけで全体受付を有効にしない。実source／worker／transportのoriginと終了確認は未接続のまま。

## 9 合成受入条件と実装分割案

- 独立oracleは元行・findings件数・親keep／omit・prefix／error順を手書き表と別表現の逐次処理で導出する。assembler／OM-A／PD-A／本比較器を呼んだ値だけを期待値にしない。
- 同じcontextでfinding・evidence・recommendation等を1箇所変更、配列順序／重複／optional fieldだけを変更した本文を拒否する。hash／ID／schema一致だけで通す変異を負の対照にする。
- 親省略と元worker省略の交換、originの有無・元body0件と出力reviewed0件の混同、nonreviewed variantの余分なfield／reason、retained順序変更を拒否する。
- 別pending／dest／pins／accepted／plan／window／budget／serial・summary／copy、二重take／consume／commitを拒否する。commit直前post停止では成功0、途中destは利用不可、失敗後再開不可。
- 正常commit後の元slot利用不可・同destだけが利用可能・body getterなしを確認。停止／失効／clear漏れの負の対照でpayload-clear証拠と上位移譲が拒否されることを確認する。
- strict compile・実emit graphの固定fault試験・package除外／friend不在を確認し、旧(C)固定abortの試験と新正常系保証を区別する。全条件があるまでseal成功の承認へ進めない。

実装分割案：(D1) 非実行のFullMixedDraft値契約・全field比較と独立oracle、(D2) 同pendingへのprivate ContentChecked／未公開dest owner・一度限り準備／固定abort、(D3) 事前レビュー後のatomic commitと同期失効、(D4) 正常terminal-only／固定discard・hard診断の連続接続。D3のseal成功は別の明示指示待ちであり、本稿やD1／D2の成功で有効化しない。
