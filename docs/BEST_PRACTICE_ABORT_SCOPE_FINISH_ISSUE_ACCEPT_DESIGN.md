# RB-D後のfinish証拠発行・RA-03受理 接続差分設計

Version: br006-finish-issue-accept-draft-0.2 / Date: 2026-11-02。
Status: **RA-02④-Aの同kernel一度限り発行・同期失効・固定discard接続まで合成限定実装。RA-03受理は未実装。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `6021339`。対象は[RA-02③](BEST_PRACTICE_ABORT_SCOPE_FINISH_ASSEMBLY_RA02_BINDING_DESIGN.md)§11と[RD-A](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)§5〜7との差分。実装・証拠発行・実接続・実通信・設定変更・Pushの承認ではない。

## 1 現状と追加境界

RB-Dの`bindRecoveryPlan`は元`transferredPlan`／handoff、constructor pinと同source／frame／ready origin／cleanup identityを結合するだけ。`finishBindings=1`や`route_bound=true`は発行・受理・route利用の許可ではない。結合だけなら`evidence_issues=0`、RA-02④-Aの明示的な合成発行commit後だけ1となる。permissions=falseは維持する。

追加するslotは同kernelのowner／busy／hard／guardの下に置く。別ownerのwrapper、外部登録台帳、raw header／結果／pin／route／任意callbackを受ける入口は追加しない。legacy factory・data-only RA-02・旧試験は維持する。runtimeの台帳やfixture登録口と共有しない。

## 2 費目と能力を分けたprivate slot

| slot | 内容・発行元 | 終端 |
| --- | --- | --- |
| RB-D BoundFinishRoute | 元plan／handoffとprivate pin・live originへの参照。既存結合継続のみ | 失効時は実行参照を落とす。再bindしない |
| FinishContextIssueSlot | unused → issuing → issued。別brandの空opaque handleと同bound snapshotへの対応。未公開pendingはwork局所値 | issue失敗・live失効でfailed／invalidated。再issueなし |
| FinishContextAcceptSlot | unused → accepting → accepted。同handoff／evidenceから期待値ownerへの唯一の移譲 | 失敗はfailed。元slotへ返さない |
| RouteUseClaim | unused → spent。accept開始時に消費する同frameの利用claim | 受理失敗でも巻き戻さない |
| AcceptedExpectationSlot | 同plan／frame／source／時刻／集合の非実行期待値と別brand handle | 固定discardで消費。E・finish job・候補能力は含まない |

handleは空・凍結・identity一致を必須とし、brandだけで真正としない。公開summary・RA-01 projection・同値copyから作れない。snapshotの参照共有は可だが、二つのslotへ独立した消費権を複製しない。issue claimはRB-D結合claimと別である。

## 3 発行の固定順序

合成限定APIは`issueFinishContext(binding, handoff)`のみ。runtime／正式発行口には追加しない。

1. 同ownerのbusy／hard／bindingを検査。他rootのslotは検索・変更しない。
2. 自ownerのissue開始claimを外部guard前に占有する。別handoff・二重issueでも自ownerを停止し、claimを戻さない。
3. pre guardと同bound plan／handoffのidentity、source open、同frameのready origin、cleanup未開始serial=0、未消費routeを確認する。
4. 元private pin・planの集合／receipt／T_i／S・全L・O・U／header／verify事実を固定規則で再照合する。任意raw値やRB-Dの公開診断を入力にしない。
5. post guard後に同live条件・同bound identityを再確認してから、同snapshotへ対応するopaque evidenceをprivate slotへ公開する。発行件数はcommit時だけ1へ更新する。

発行はhandoff／route利用claimを消費しない。発行成功後もRA-03で再確認する。値検査失敗は一旦保持してpost guardを通し、既存の最初のhardを優先する。未知例外は固定internal_review_errorに写像し、raw例外・stack・値は表示しない。

## 4 RA-03の原子的受理

操作案は`acceptRecoveryFinishContext(binding, handoff, evidence)`。同ownerの保護区間で、accept開始claim、受取handoff／plan、発行済みevidence slot、route利用claimを一度だけ取り外す。取り外した値は局所pendingへ保持し、失敗でも元slotへ戻さない。取り外しとidentity検査の間に外部guard／callbackを呼ばない。他ownerは不変とする。

pre guard後に、取り外した同plan／snapshot／元pinの一致とlive条件を再検査する。post guardとlive再検査が成功した後だけ、privateな非実行ExpectedRecoveryFinishDraftと別brandのAcceptedFinishContextを公開する。RA-01のprojectionコピーから元frameやhandleを再構成しない。受理後の元handoff／evidence／RB-D discardは全て利用不可とする。

acceptedは合成期待値を所有するだけで、実finish送信・E採取・正常終了候補を許可しない。Eや候補用の未導出slotを仮値で埋めない。元analyze受理captureや実結果の由来は引き続きUnknownであり、合成descriptor由来の参照を本物の解析証拠へ昇格しない。

## 5 同一handoffの競合表

| 状態 | 許可する唯一の次操作 | 拒否／失効 |
| --- | --- | --- |
| RB-D bound・未issue | 一度のissue、または既存固定discardの終端経路 | summary復帰・再transfer・再bindは不可 |
| issued・live | 一度のaccept、または固定discardへ向けたsource／cleanup終端 | 二重issue不可。close／cleanup開始でevidence利用を同期失効 |
| issuedだがlive失効 | source close完了・新cleanup確認後の同receiver固定discard | accept不可。失効を発行し直して補わない |
| accepting | 同保護区間のcommitまたはhard停止 | discard・issue・acceptへの再入はhard。例外をcatchされても外側commit不可 |
| accepted | accepted専用の固定discard／後続の非実行検証（別工程） | 元handoff discard・summary・再accept・再issue不可 |
| failed | 事前確保済みsinkによる固定診断回収のみ | claim・pin・routeを復活しない |

`discardBoundRecoveryPlan`を第二の消費台帳にしない。issue後でも受理前なら、既存receiverを使う固定discardがsource／新cleanupの両確認後にhandoffと発行slotを一緒に終端化する。発行済みevidenceを残して成功してはならない。現行RB-Dのdiscardがこの追加slotを扱えると仮定せず、issue実装と同時に接続・試験する。

## 6 失効・解放・診断の責務

source close開始・新cleanup開始は依存呼出し前に単調更新し、bound／issued／acceptedの実行利用を同期失効する。ただし受理前の元receiver、受理後の固定discard token、cleanup sinkを失効処理で先に捨てて後始末不能にしない。実行権と終端責務を別slotにする。hard時は利用可能な参照を落とし、診断回収責務だけを残す。

acceptedのdiscardは一度claimを占有し、期待値を実行不可にする。成功には同source正常終端と同新frame cleanup確認の両方を要求する。未確認ならhard停止し、正常closeで隠さない。sink confirmedからRD-Dの正常cleanup能力を発行しない。元UTC／会計は既存終端規則でのみ破棄し、再採取・再課金しない。

診断はissue／acceptの開始・commit・失効・discard状態と件数、最初の固定hard code／phaseに限定する。元soft、旧cleanup、新cleanup、source終端は別軸を維持。ID／UTC／snapshot／結果本文／identityを公開しない。guard取消・期限切れは既存分類を保持し、後続internalエラーで上書きしない。

## 7 有限枠・費目所有

RA-01の共有枠（深さ8・配列100・object項目30・訪問10,000・保守的文字費262144）を各固定projection／比較内で維持し、recordごとにリセットしない。issueとacceptで再検証する費用は別々に計上すべきであり、RB-Dで検査済みという理由で無料にしない。

| 費目 | 所有する操作 |
| --- | --- |
| issue claim・再照合・bounded projection・pending／handle／freeze | issue |
| accept／route claim・元slotの取り外し・再照合・期待値slot／handle | accept |
| source／cleanup開始による失効 | 各開始境界。診断recordで重複計上しない |
| receiverまたはacceptedの消費・参照破棄・終端確認 | 対応する固定discard |
| guard・固定診断 | 各操作。pre／postを別イベントで計数 |

新analyze／HTTP／finish／E採取は0、C/G/P・retry prefixとS／全L／O／T_i／Uを維持する。ただし追加work／allocation・exact layout・全体上界・本番capはUnknown。今回の設計ではモデルや全体受付を有効化しない。

## 8 実装順・合成受入条件

1. **RA-02④-A**：同kernelのissue内部型・claim・同期失効・固定discard連結。合成依存だけで一度限り発行、失敗後再発行拒否を検査。
2. **RA-03-A**：同handoff／evidence／routeの原子的消費とpost後の非実行accepted公開。別brand・コピー・別root・部分失敗・再入を検査。
3. **RA-03-B**：accepted固定discard、source／新cleanupの独立診断、issue→accept→終端の連続合成検査。

RA-02④-Aのみ合成実装済み。RA-03-A／Bは別指示まで未実装とし、accept／route利用claim・accepted slotを先行生成しない。

必須の負の対照は、別rootの不変、二重issue／accept、summaryからの昇格、issue直前／直後・accept両guard中の取消／期限切れ／source close／cleanup開始、吞み込まれた再入例外、issue後discardとの競合、片側だけの解放確認、失効後の再発行／再準備である。成功対照でもpermissionsをfinish実行可にしない。

旧合成試験・legacy APIを維持し、新brand／scope／helper／宣言／mapの配布物非同梱とruntime／I/O／clock／worker依存の負の対照を継続する。build・strict型検査・全体合成回帰・梱包確認を実装工程で行う。

## 9 RA-02④-A実装範囲

`synthetic-recovery-kernel.ts`の同owner内にprivate issue状態・開始claim・handleとbound参照／再検査projectionの対応を追加した。新たなguard owner・登録台帳・setterはない。元pinと集合／時刻／verify事実を再projectionし、post guardと同bound参照の再検査後だけhandleを返す。失敗・取消・期限切れ・再入でpendingを公開しない。

別brandの`SyntheticIssuedFinishContext`は空・凍結・null-prototypeで、外部へsnapshotを返さない。RA-01に残る発行機能のないplaceholder型とは別であり、値projectionや旧handleをcastして発行しない。RA-03はこのprivate slotのidentityを受ける唯一consumerとして今後接続する。

issue状態はunused／issuing／issued／invalidated／discarded／failed、診断はstate／started／issues／pendingだけ。issuesはcommit済み履歴0または1で、失効・破棄後も履歴を保持する。source close・cleanup開始ではhandle対応とsnapshot参照を落とすが、元receiverとcleanup sinkは残す。同receiverの固定discardが両解放確認後にhandoffとissue slotを終端化する。hard後に診断confirmedを回収しても発行権は戻らない。

legacy／lifecycle専用factoryには新method・診断field・phase型を公開しない。旧pin／lifecycle／RB-D試験の「発行methodが存在しない」という時点依存の期待3箇所だけを新段階に合わせ、秘密非露出・結合のみ発行0の検査は維持した。現在の公開合成経路はverify=nullのまま、実結果の由来・元analyze capture・RA-03・E／finish／候補は未接続。

[合成検証記録](E2E_BEST_PRACTICE_FINISH_ISSUE_RA024A_2026-11-02.md)参照。追加のwork／allocation上界は未導出で、全体受付無効を維持する。
