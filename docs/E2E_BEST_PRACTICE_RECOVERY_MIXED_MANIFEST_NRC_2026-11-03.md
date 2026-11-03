# NR-C 混合manifest・reviewedゼロ件 合成検証記録

Date: 2026-11-03 / 基準HEAD: `d93908c`。

## 1 範囲と接続

[非reviewed設計draft-0.4 §11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_NONREVIEWED_DESIGN.md)を、新しいcreateSyntheticMixedRecoveryRootだけに実装した。既存runtimeのソースと旧rootのAPI／診断は変えていない。旧試験は残した。

- 同constructorのprivate pinsから全選択行receipt・元outcome・存在する元input参照を固定順に保持する。処理済み行のeventは全件ちょうど1個、retainedはeventなし。reviewed＋nonreviewed＋retainedの完全partitionを要求する。
- reviewedは既存CG-Bの同元receipt／accepted outcome・元応答JSON・context検査を再利用する。metadataは選択行だけに結び、存在しないinput／T_i／jobを作らない。retrieval／analysisは同constructor内のNR-B producer別発行を使い、元pinsのstrict値と比較する。
- 新しいconstructor-only supplierはprivate evidence集合を先に取り外し、canonical rowに索引付けて元期待値と比較する。未発行／discard済み行・pending terminal／delivery・cleanup未確認は停止する。通常NR-B issuerにseal入口は増やしていない。
- 同accepted／plan／handoffの既存kernel seal、partition pre/post、必要なcapture／supplier pre/postを通った後だけ、別brandのopaque mixed handleを一度返す。全8 guardの取消・再入で部分公開しない。
- reviewedゼロ件は、同planと全選択行receiptに結ぶprivate empty proofを内部で作る。metadata＋retained、全件retained、100選択行を確認した。汎用空token・selectedゼロ・元active inputなしは受理しない。
- source close／cleanup開始・hard・固定discardで、capture・supplier・partition link・seal参照を同期に外す。constructorで既にcopy／検証済みのcaller context／raw JSONをmixed partition経由で保持し続けない。診断countと既存終端責務は残す。物理的なheap消去ではない。

元worker omittedはreviewed_origin:nullだけ。親でreviewedを受理した後の省略、合法な親omission、finish job・full内容gate・candidateへの移譲は未接続である。合成issuerのcleanupは実native cleanup証拠ではない。

## 2 RED／初回失敗と修正

新constructorが未存在のimport／関数失敗をREDとして確認し、metadata＋retainedのゼロreviewed tracerをGREENにした。旧NR-B／CG-BP1と合わせて最初の3ファイル142件が成功した。

strict TypeScript検査では、新supplierの戻り型をunionからExtractした箇所がneverとなり12エラーになった。明示したprivate supplier surface型へ訂正し、旧issuerのruntime surfaceは維持した。count診断の初期値がliteral 0型へ狭まった1エラーもnumber型の明示で訂正した。

拡張試験の初回は42件中19件失敗した。fixtureのanalysisにmissing_required_field、omittedにresult_size_limitを使っており、いずれも既存の当該producer契約にないためconstructorが正しく拒否していた。analysisをinvalid_xml、omittedをresponse_limitに訂正し、許可範囲は広げていない。その後残った1件は「元retrieval理由との不一致がconstructor時に失敗する」という試験の想定誤りだった。private evidence全体と元期待値を比べるseal時に停止することへ訂正した。

レビューで、失効時にはmixed sealだけでなくpartition link自体も外すよう修正し、countを独立したscalar診断として残した。reviewed eventの元caller参照もcapture生成後に外した。

## 3 検証結果

| 検証 | 結果 |
| --- | --- |
| NR-C新規試験 | 64件成功 |
| NR-C／NR-B／NR-A／CG-BP1／CG-B／CG-A関連 | 6ファイル・429件成功 |
| 全体回帰1回目 | 264ファイル・12,860件成功、失敗0・pending 0（追加6件前） |
| 全体回帰2回目 | 264ファイル・12,866件成功、失敗0・pending 0 |
| 最終コード全体回帰 | 264ファイル・12,866件成功、失敗0・pending 0（raw delivery参照解放後） |
| build | 成功 |
| 新試験・関連helperのstrict TypeScript検査 | 成功 |
| 変更TS／梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。新constructor／supplier／scope／brand非同梱、固定import監査・seeded漏出／I/O／worker／clock負の対照成功 |

新試験は、metadata／reviewed／retrieval／analysis／retainedの混合・元omitted・0.3、reviewedゼロ・全件retained、Dictionary／Choice名を含む100行、元retrieval inputの有無、analysis input／T_i欠落・不一致を確認した。missing／重複／順序差／余剰event／unknown variant／余分field／sparse／101件、別accepted／binding／plan／handoff／summary／コピー、二重移譲、余分な引数は拒否した。

全8 guardの取消と5種類の再入、共通停止の保持、source／cleanup開始時の同期失効、preparation discard、late cleanup後の先行hardとaccepted終端責務を確認した。producer evidenceの不足／discard／元理由不一致／expected順序差、pre/post停止、manifestの別owner discardも検査した。旧rootと旧issuerには新しいseal入口・診断を増やさず、別brandのcompile-fail対照も通した。

caller後書換え・getter／Proxy trap実行0、空opaque handle・scalar診断に本文／row IDを含めないことを検査した。固定countの期待値はfixtureのpartitionから独立に記述し、collector自身のsummaryから期待値を作っていない。

最後に旧issuerのsummary型へsealed／manifestが広がらないよう明示し、旧summary.manifestを拒否するcompile-fail対照も追加した。型のみの訂正後、strict型検査・関連6ファイル429件・lint・梱包を再確認した。

全体回帰は既存localhost合成待受を許可した条件で、maxWorkers=3・既存期限を変更せずに実施した。新root自体にはnative worker／transport／時計／timerの入口がなく、外部サービスは使っていない。

## 4 費用と未対応

最大100件のpins／event／private row／partition索引、既存bounded copy、CG-A／Bの同JSON検証、NR-A投影、NR-B producer別claim、manifest集合copy・比較、最大8 guard、handle／clearは追加費目。実heap／総CPU／work上界はUnknown。元C/G/P prefix・retry・60秒・210試行を変更していない。JS heapのゼロ化や実worker終了を主張しない。

次は親omission／合法な省略の証拠・元captureとの結合、混合manifestのfinish job／full gateへの一度限り移譲が残る。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Push・本作業のコミットは行っていない。
