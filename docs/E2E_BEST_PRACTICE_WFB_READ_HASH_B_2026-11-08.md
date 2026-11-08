# WF-B (B)：同scratch・同bytes hashと一度限り候補受理の合成検証

後続追記（2026-11-08）: 下記の「最大8MiB未実施」は各記録時点の状態。[最大8MiB成功走査・上限境界の合成検証](E2E_BEST_PRACTICE_WFB_READ_HASH_CAPACITY_2026-11-08.md)で補完した。過去の件数・失敗／未確認記録は変更せず、同snapshot接続・行集約・実source照合は未実施のままとする。

Date: 2026-11-08 / 実装基準HEAD: `6fd83d4` / [契約・固定操作表](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md) / [親設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)。

## 対象と保証の範囲

新規`tests/review/fixtures/read-hash-fake.ts`と`tests/review/read-hash-fake.test.ts`。既存(A)、実MapSupplySnapshot／source供給・runtime・session・既存coreを変更しない独立assemblyである。固定scenarioだけを受け、同scopeに閉じた合成resourceとprivate scratchからNodeの同期SHA-256へ進む。実file／実sourceの読取・実hash採取や期待値pin、実通信は行わない。

固定8phaseはopen／before／init／read／after／final／close／accept。fileあたりread以外7操作、共有read試行R≤65,536、file数F≤32、最初の拒否で最大2guard、finishの2guardから、上界は`2(R+7F)+4=131,524`。cleanupは停止時にも予約済みcloseを1回試行し、当該F枠に含める。guard上界自体が切れた場合は追加時刻採取をせず、cleanup時刻をunknownに保つ。schedulerはR+7F+1 step以下。

通常の既知ベクトルはabc・空列・hello。期待digestは静的な別定数で、実行対象のhash返値から生成しない。normalはopen3／observe6／init3／read5／update2／受信8／正常hash済8／final3／close3／受理3／guard54、1-byte分割はread11／update8で同じfile結果となる。空fileのupdateは0で、EOF／after／finalは通す。

## 計数・候補・失敗の対照

- 受信済量、正常hash済prefix、次位置、update試行／完了を区別。第2update故障では受信2、正常prefix1、position1、update試行2／完了1を保持。backendへ一度updateしてからthrowする対照でも受信3／既知hash済0・poisonedを保持し、再読取やfinalへ進まない。
- read中の取消／期限到達後も妥当なpayloadをupdate1回してから停止。hash故障＋取消はhash_unavailableとcancelledを別slotに残す。readとupdate間のguardは全対照で0回。
- 最初のinterrupted＋retry32はread33／retry32／update0。update予約累計はupdate試行＋未使用解除＋現予約に一致し、現予約は終端0・同時最大1。EOF余剰byteは受信だけ課金、早EOF／余剰byteではafter観測を行わない。
- 正常な第1fileの9操作の全10部分prefixを別イベント表で計数。未完了finishは予約closeを回収し、既課金・受信・既知prefixをrefundしない。残2fileがあるので第1file受理済みでもsession未完了を保持する。
- candidateのcopy・別scope／owner／canonical fileはprivate内部対照だけで拒否。同一候補の再受理は同じ受理前提検査を再度通して拒否し、acceptedを増やさない。close前candidate生成故障、close確認後record準備故障、acceptのpost取消／時計故障を分ける。
- readCompletedFilesはEOF確認後のafter観測一致で加算する。final故障・close未確認でも読取観測は保持するがhashAcceptedFiles相当のcounts.acceptedは0。record準備失敗ではcleanupをclosed_confirmedのまま保つ。
- closeのfalse／throw／期限超過、mismatch＋close未確認、取得なし／取得済み失敗、時計例外・不正値・逆行・信頼回復禁止、read throw／failed／不正n、digest差・after変更を確認。raw例外・digest・bytesは診断へ返さない。
- 全file確定後の取消／期限／時計故障は確定済みhash_matchを変えず、firstReason=noneのままstopReasonとterminalDisposition=stoppedへ残す。部分確定後の停止は先行理由と未開始fileを保持する。終端の再呼出しでは同じ不変結果を返し、新しい操作や診断を増やさない。

固定profileではupdate≤payload read≤read≤65,536であるため、update上限だけの拒否は通常入口から到達しない。update_capはupdate枠だけ0にした合成内部対照で、read=0を確認する。read／retry／受信余裕／update／位置加算の検査順を維持する。read_cap・received_cap・guard_capも故障点を分ける縮小profileであり、本番capの承認ではない。

## 実行結果

| 検証 | 結果 |
|---|---|
| 新規(B)＋既存(A) | 99件成功（B47件、A52件）、失敗0 |
| 関連15ファイルの合成回帰 | 1,272件成功、失敗0 |
| npm run build | 成功 |
| 新規fixture／testのstrict TypeScript（unused／implicit-return含む） | 成功 |
| 新規2ファイルのESLint | エラー・警告なし |
| 別一時出力へCommonJS compile＋Node単独実行 | 既知vector、poisoned prefix、閉鎖authorityの固定assert成功 |
| npm pack --dry-run --ignore-scripts | 441ファイル、tests／docs／A・B・supply fakeの混入0 |

関連対象はread-hash-fake／read-ops-fake／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの各`tests/review/*.test.ts`。期限や既存test設定は変更していない。

初回の新規41件＋既存A52件は93件成功。その後、予約保存則・確定前の保持・時計stickyと最新設計に合わせた完了観測点・候補生成故障・二軸診断を追加し、最終B47件へ拡張した。今回の試験実行で失敗・型エラー・lintエラーは観測していない。途中で設計レビューcommit `6fd83d4`が追加されていたため、それを保持し、readCompletedFilesのafter一致加算、close後record準備、縮小update profileの限定を取り込んだ。レビュー前の契約へ上書きしていない。

梱包確認は一時cacheのdry-runのみ。archive取得／生成・公開・production-only install・packaged worker起動は行っていない。別compileも合成Bの計算だけを起動し、実worker／runtimeは接続していない。全repository回帰は今回未実施。

## 未確認・次工程

最大期待総量8MiBを(B)でhash成功させる試験は未実施。32file／1-byte read65,536回／共有retry32と縮小cap境界は確認したが、(A)の8MiB容量試験をhash保証へ転用しない。別scratch・supplierの混入はfactory拒否で、任意悪意readerの監視ではない。metadata／open／closeは合成resourceの固定事象で、OS解放・path同一性の保証はない。

private scratchは65,536 byteだが、静的合成source配列・hash内部heapは別に存在する。全heap／CPU上界、Node hashの参照非保持・native費用、OOM・GC・物理ゼロ化・実期限内完了はUnknown。独立固定vectorは暗号実装全体の証明ではない。

(C)の同MapSupplySnapshot／SourceMapDraftへのprivate借用、辞書全fileと行hash集約は未実装。rowsはnot_aggregated、ready=false、authority=none、formalIssuance=closed、wholeRunAdmission=disabled。5 gaps・runtime／native／実E／Sはunknownのまま。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わず、VM／監視／telemetry調査保留も維持する。今回の変更は未コミット。

## レビュー修正（2026-11-08）

レビュー基準HEAD `2eb2b76`。85 mutantで63件kill・22件生存し、以下を確認した。上記の件数・結果は修正前の記録として残す。

- 欠陥: 全file確定後に後着停止があると、`step()`が停止判定で先に戻り、done後の誤用を`binding`として残さなかった（停止なしでは`binding`）。done判定を停止判定より前に移した。
- 検出力不足: `digest_mismatch`／`mismatch_close_failure`はscenario名で不一致を強制しており、上記「digest差を確認」は実digest比較の失敗方向を通していなかった。実比較を外しても47件が成功した。対照payloadを`abd`へ変え、固定abc digestとの実比較だけで不一致にした。
- 検出力不足: sticky停止後に`step()`を直接呼ぶ対照がなく、停止判定を外すとpoisoned後の再read／再updateへ進む変異が生存した。
- 軽微: 900／1000境界が`LIMIT`参照でしか試されていない、初期値以外からの時計逆行、制御理由2件目の非上書き、guard枠切れ時の`cleanupTiming=unknown`、入口の引数個数（(A)は0個以外を拒否）が未検査だった。

追加8件のうち、done後誤用と入口引数個数の2件が修正前にRED、他6件は既存動作を固定する対照として修正前から成功した。fixture修正後、B55件＋A52件の107件成功。mutantは新パターンを加えた90件で75件kill。

生存15件は等価または防御的重複と判断した。

| mutant | 理由 |
|---|---|
| lim-received／ctor-total | 固定合成sourceは最大1 MiBで、受信上限・期待総量に到達しない |

後続注記（2026-11-08）: lim-received／ctor-totalの等価判定は当時の固定scenarioに限る。[容量検証](E2E_BEST_PRACTICE_WFB_READ_HASH_CAPACITY_2026-11-08.md)の8MiB＋1byte・宣言超過scenarioで到達可能になり、両変異ともkillされる。
| guard-expired-nosticky／guard-cleanup-end | stop 900がend 1000より前で、時刻逆行は時計異常になるため、通常guardが先に期限を捕捉する |
| cancel-nofail | 全経路が後続guardを通り、同じ取消が記録される |
| guard-interval-count／read-nopoison | 計測・tail毒化の補助。tail hash変異は毒化なしでもdigest差でkillされる |
| close-accept-anyway／bound-pending／bound-cleanup／final-prefix | 停止判定・close未確認のfail・位置一致が先に成立する防御的重複 |
| commit-nopost／commit-nofirst／commit-norebound | post失敗は未完了中なら必ずfirstReasonを立て、prepareからpostまでcandidateは変わらない |
| step-sticky-nostop | firstReason=noneでstopReasonだけが立つのは全file確定後で、直前のdone判定が先に処理する |

全repository回帰: 307 files、15,302件成功、失敗0。lint・build・package-http-classificationも成功。実期待値pin・実source照合・実通信・設定変更・Pushは行っていない。

## コミット前の対象限定再検証

上記「未コミット」は記録作成時点の状態。コミット候補7ファイルだけをindexへ登録し、そのindex全体を新しい一時作業ツリーへ展開した。既存node_modulesへの参照だけを加え、元の未登録変更や既存distをコピーせずに、同候補上で以下を再実行した。

- npm run build: 成功。
- 上記関連15ファイル: 1,272件成功、失敗0。
- 新規fixture／testのstrict TypeScriptとESLint: 成功。
- build後のnpm pack --dry-run --ignore-scripts: 441ファイル、tests／docs／A・B・supply fakeの混入0。

候補に含めるのはBのfixture／test、CHANGELOG、当該検証記録、scratch差分設計と親2設計書のみ。記録追記はMDだけで、検証済みの実装・試験内容を変えていない。実期待値pin・実source照合・実通信・設定変更・Pushは行っていない。全repository回帰および最大8MiBのB成功走査は、引き続き未実施である。
