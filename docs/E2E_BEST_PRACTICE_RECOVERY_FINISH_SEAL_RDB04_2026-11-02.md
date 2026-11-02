# RD-B04 同accepted期待値封印・失効／固定discard接続 合成検証

Date: 2026-11-02。開始時HEADは`ca67222`。作業中の既存RD-B03追加修正`fda1f22`を保持し、最終検証は同commitを基準に実行した。RD-B03比較器・その160件の試験は本作業では変更していない。

## 1 実装範囲

[既存kernel](../tests/support/review/synthetic-recovery-kernel.ts)のprivate acceptedFinishを一度だけ取り外し、同plan／source／frame・元pinsからbounded期待値を作る`sealRecoveryFinishExpectation(binding, accepted)`を追加。[pinned root](../tests/support/review/synthetic-pinned-recovery-root.ts)は固定引数を転送するだけで、raw header／manifest／receipt／時刻／frame・callbackの追加指定は拒否する。

共通actがowner／busy／hard／bindingを確認した後、外部guard前にseal claimとaccepted取り外しを行う。元plan／seed／time・ready origin・source identity／参照・cleanup identity／serial=0・同frame／sink・acceptedTerminationを両guard前後で照合し、固定plan再projectionと元accepted projectionの比較を行う。新期待値は既存RD-B01のstrict bounded projectionで固定し、post guard後にだけ別brandの空・frozen handleとprivate sealedFinishを公開する。

元S／全L／O／T_i／U・header・集合・receipt／reviewed起源はprivate snapshotから供給する。E・現在時刻・応答・追加inputやreadyを採取しない。元accepted handleとacceptedTerminationはcleanup責務用に残し、sealはその再利用権を作らない。戻り値／inspectから期待値・frame・元ID／UTCを取得できるgetterはない。

## 2 失効と解放の接続

- source close開始・新frame cleanup開始・hard stopはsealedFinishを同期破棄する。healthyな失効時はacceptedTerminationだけを残す。
- 固定RA-03-B discard claimでもsealedFinishを明示破棄し、同source／新frameの両終端確認とpost guard後だけdiscardedへ進む。元accepted handleが必要で、sealed handleは代用できない。
- seal／discard／close等は同busy境界にあり、再入例外をcallbackがcatchしても外側commitを拒否する。失敗後にacceptedやseal claimを復元しない。
- 先行soft／hardとcleanup診断を分離したまま保持する。hard後のpreissued cleanup sinkは診断回収用だけで、sealed期待値や正常close権限を復活させない。
- normal closeはsealed／accepted終端責務が残れば拒否。両固定解放→元acceptedのdiscard→normal closeだけを確認する。

## 3 RED／GREEN

最初のtracerは新seal methodがないためTypeErrorで失敗。同kernel接続後に、accept→seal→source／新frame解放→discard→normal closeが成功した。

次の負の対照でlegacy／lifecycle-only rootにseal methodが見えてしまうREDを確認。wrapperのruntime method除外、diagnostic fieldとhard phaseの型除外を接続してGREENとした。既存accept／discard試験も無変更で成功。その他の型検査・lint・buildの失敗はなかった。

## 4 合成確認

[新試験](../tests/review/synthetic-recovery-finish-seal.test.ts)は72件（表駆動内でも両guardを検査）。

- guard前のone-shot占有、accepted pending取り外し、両guard中のseal非公開、post guard後だけのcommitをinspectの状態で確認。
- 同accepted／bindingのみ受け、別root・copy・issued／handoff／plan／ready・summary／raw／accessor／Proxy・追加callbackを拒否。他rootは不変で、caller getter／trapを実行しない。
- 二重seal、失敗後、cleanup／discard／close後の再seal、issuedだが未acceptの値を拒否。
- pre／postの取消・期限切れ、未知guard例外、誤accepted identityとcanonical projection不一致に対するpost guard優先を確認。handleやraw例外を先行公開しない。
- seal／discard／close／source／cleanup／accept／issue／bind／summaryへの飲み込まれた再入、discard中のseal／close／discard競合を拒否。
- seal前後のsource／cleanup失効、first hard、早過ぎるdiscard、source failed／unconfirmedとcleanup confirmed、cleanupの不成立を個別に確認。失効／failureでpending=false、先行診断と遅延cleanupを保持。
- 元acceptedとsealedのbrandを静的に区別し、sealedを別rootのacceptedや固定discardの責務証拠にできないことを確認。
- reviewed／result_omittedの元receipt／起源を含む2件transcript、0.3 selection、100件window、7種類のsoft観測起点を通す。元accounting／closure／世代の回数は不変、finish dispatchは追加しない。
- 封印後も期待値・本文・UTC・ID・frame・accepted originは返さない。content evidenceはUnknownのままで、finish consumer／candidate／送信口はない。
- legacy／lifecycle-only rootのAPI・diagnostic・phaseをruntime／型の両方で不変にする。

## 5 検証結果

- `npm run build`：成功。
- 新seal／既存accept／discard試験のstrict TypeScript型検査：成功。
- 変更TS／梱包scriptのESLint：成功。
- 関連合成：6ファイル507件成功（seal72／accept59／discard64／issue53／plan binding99／RD-B03比較160）、失敗0・skip0。
- 初回全体回帰：258ファイル12,435件成功、失敗0・skip0（約35.5秒）。post-guard canonical不一致優先2件の追加前。
- 最終全体回帰：258ファイル12,437件成功、失敗0・skip0（約35.5秒）。
- `node tests/review/package-http-classification.mjs`：441ファイルで成功。封印method／brandの非同梱、dist JS／型／mapのmarker非露出、kernel→純粋projectionだけの追加import、runtime／I/O／clock／worker注入対照と既存compiled fixtureを確認。

関連はmaxWorkers=1、全体はmaxWorkers=3。150秒の外側監督は検証用で、製品／既存試験の期限を変更していない。ローカル待受の既存合成テストを含むが、外部サービスへ通信していない。

## 6 レビュー確認（2026-11-03）

§5のESLintは変更したTS／梱包scriptだけに対する結果で、修正前の記録として残す。レビュー時にrepo全体の`npm run lint`を実行し、exit 0を確認した。同時に`npm run build`成功、offline梱包441ファイル成功、全体合成（maxWorkers=3）258ファイル／12,437件成功・失敗0・pending 0を確認した。

レビューで封印処理の14判定を外す変異を確認した。受理済みhandleの照合、選択IDの昇順検査、source／cleanup開始時の封印期待値の失効の3判定は、外すと既存試験が失敗した。残る11判定（seal一度限り、終端slotとのhandle／sink対応、cleanup serial・live照合、cleanup開始後のact制限、commitでの不一致flagと再確認、発行時snapshotとの比較、破棄時の消去、closeでの確認）は、外しても既存試験が通るが、claim時点で受理slotが空になること、受理時に同時生成される終端slotとの不変条件、開始時の失効処理、期待値未生成時のcommit停止とbusy、pinの不変性、source close時点の失効と終端slotによるclose停止によって同じく拒否される等価変異として扱い、追加試験の対象にしていない。実装・試験は変更していない。

## 7 費目・未確認事項

finish_seal.usageは新しい期待値projectionだけのnodes／character_units。plan再projection、RA-01比較の二入力枠、guard／同一性検査、Zod copy／保持data／opaque slot、失効・discardの総work／allocationを単一Budgetで計測した値ではない。各既存有限枠は維持するが、追加の総費用・本番cap・全体上界はUnknownとする。

元本文／findingsの真正なcapture、full schema／wireは未接続。RD-Cのsealed slot消費・finish job／応答相関・RD-B03比較連結、候補とその後の終端契約も未実装。本段階はgetter／consumerやfake Eを追加して先行発行しない。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry保留を維持した。実session／runtime接続・実通信・実機操作・トークン発行・設定変更・Permit／候補発行・Pushは行っていない。

[詳細設計§14](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_VALUES_RDB_DESIGN.md)参照。
