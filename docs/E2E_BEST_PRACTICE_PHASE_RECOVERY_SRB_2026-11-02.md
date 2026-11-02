# SR-B：phase期限型・集合保持・fake verify会計の合成検証

Date: 2026-11-02 / 基準HEAD: `f61faeb`。
Status: **配布対象外の独立合成issuerのみ。実worker／runtime・実予算writer・実通信・実finishへ未接続。**

[soft回復claim設計draft-0.6](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§13と[親設計draft-0.11](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 範囲・会計訂正

既存SR-Aの同owner・未消費recovery handleからだけphase planを準備し、ready世代維持／未起動からの初回fake readyを区別した。公開されたSR-A消費dataからの昇格は拒否する。選択行・完了状態・受理済みT_i／保持Uをcopyして未処理行をdeadline_exceededに分類する。prepare時のsource／budget／release／origin参照は同rootに結合するが、window／receiptはfixtureの合成参照であり実取得証拠ではない。

コード照合で、従来設計の「verify GET最大1」は不正確と判明した。`src/review/bounded-source.ts`のverifyは親→metadataの2 GETを行い、`src/servicenow/bounded-read.ts`のrequestはupstream_unavailableに限り各最大1 retryする。したがって**論理verify最大1、物理最大4試行**が正しい。設計を訂正し、実source・retry・final4予約・210試行の製品契約は変更していない。

fake台帳は同budget identityに対応するC/G/P prefixを一度copyする。各attemptだけC、同attemptの一意chunkだけGを加算し、verifyのP追加は0。C210・G16MiB・response4MiB・P prefix8MiBを維持する。retry待ちはイベントのみでtimer／sleepなし。これは実canonical writerへの接続・実受信会計の証明ではない。

## 2 独立oracle・停止条件

- SR-B 112件。phase3種×既存ready／未起動×verify継続有無を固定イベント数と比較。
- 20 pre/post guardの全取消位置について、C/G/P prefix・実行済み費目・fake起動数を独立の位置式で比較。post-guard取消でも実施済み費目を消さない。
- 親→metadata・各最大1 retry・最大4物理試行を確認。consistency段階／継続なしは0。C上限直前、G／responseの等号と超過、chunk重複・attempt混入・二重消費を拒否する。
- 継続対象9理由はunverified＋固定診断として保持。取消／全体期限／receive予算失効／未知例外はhard停止。raw例外・getter・Proxyから秘密を読まず固定理由のみを保持する。
- 先行soft／hardを別slotに残し、失敗時はphase／attempt／ready能力を破棄。pending／retry待ち／ready待ちを正常closeと数えない。
- 完了集合と受理済みT_iを保持し、未完了inputはnot_processedへ終端化。最大T_i=U、0 inputならO=U、集合外／重複／逆行／U欠落を拒否する。
- 未起動ではverify完了後だけfake起動1・同frame ready1。既存readyは起動0・ready再受理0。返却planはimmutable・authority:noneで一度限りの非実行data。実finish／E比較・cleanup証明ではない。

## 3 開発中のRED・失敗履歴

| 段階 | 観測と対応 |
|---|---|
| prepare tracer | stubにより1件RED。同recovery slotの先行占有とprivate model作成でGREEN |
| 未処理集合 | selectedが0のままで1件RED。strict集合・T_i/U保持を実装してGREEN |
| verify dispatch | stubにより1件RED。attempt／prefix課金と順序を実装してGREEN |
| worker選択／消費 | stubにより1件RED。verify後だけの分岐・one-shot非実行消費でGREEN |
| ready frame投影 | strictな3列worker契約へ7列factsを直接渡し、2件失敗。直接core試験を追加すると計3件で同じ境界を再現。supervisor／worker／generationだけを投影してGREEN |
| 補助診断 | `tsx -e`はmodule実行前にローカルIPCのEPERMで失敗。権限変更せず、純粋Vitest再現へ切替 |
| 中間型検査 | 未実装段階のunused 4箇所、およびunknownなcodeのPropertyKey型1箇所を検出。対応機能の実装と既存string検査後の型絞込みで解消。検査設定は緩和していない |

上記は合成開発履歴であり実通信障害の観測ではない。テスト・製品の期限変更、旧試験削除／skipは行っていない。

## 4 最終検証

| 検証 | 結果 |
|---|---|
| SR-B＋SR-A | 2ファイル／236件成功（112＋既存124） |
| 関連WJ-A／B／C＋SR-A／B | 5ファイル／541件成功 |
| build | `npm run build` exit 0 |
| standalone TypeScript | 新helper・試験と参照元をstrict／noUnusedLocals／noUnusedParametersで検査、エラー0 |
| 変更箇所ESLint | 問題0 |
| offline梱包 | `node tests/review/package-http-classification.mjs` exit 0、441ファイル。SR-Bの関数／path／scope混入とruntime／I/O／clock依存の負の対照を追加。既存compiled回帰も成功 |
| 全体lint | `npm run lint` exit 0、errors 0・warnings 374（変更箇所の単独検査は警告0） |
| 全体合成 | **未完了／合格扱い不可**。maxWorkers=3・JSON出力の全体実行とunit切分け実行は最終report未生成のまま停止（各exit 143）。raw runnerのunit再試行も外側90000msでSIGTERM、exit 143。途中の失敗マーカーを観測したがcase名・失敗詳細・最終件数は未回収であり、既存環境制約か退行かは未確定 |

全体合成JSONの予定先は`/private/tmp/srb-vitest-results.json`、unit切分けの予定先は`/private/tmp/srb-unit-results.json`だったが、どちらも最終reportは生成されていない。成功件数を推計して補わない。長時間実行2件は今回固有のoutputFile名で限定して停止し、runner終了を確認した。通常権限でのプロセス一覧・停止は利用不可だったため、限定停止だけ追加権限で行った。切分け再試行の90000msは検証コマンド全体の外側打切りで、製品60秒・各test timeoutや試験内容の変更ではない。JSON実行2件に一時的な重なりがあり、負荷との因果関係も未確定とする。補助`tsx -e`のIPC拒否だけから全体未完了の原因を断定しない。

梱包内の既存compiled回帰をSR-B専用compiled／B-03保証へ流用しない。新規MD5文書のローカルリンク64件・末尾空白、変更diffの空白検査は成功。検証は今回の限定機能と全体回帰を分けて扱う。

## 5 レビュー修正（2026-11-02）

§2・§4の112件／236件と「全体合成：未完了」の記載は、修正前の記録として残す。

**全体合成の再実行**：レビュー時に`npm test -- --maxWorkers=3 --reporter=json`を単独で実行し、240ファイル／10,720件成功、失敗0・pending 0、exit 0（JSON内の開始〜最終試験終了は約64.8秒）を確認した。§4で観測したとされる失敗マーカーは再現せず、失敗した試験はなかった。exit 143は外側からの打切りによる終了であり、当時の未完了は実行環境側の制約だった可能性が高い。ただし当時のmarkerの内容は未回収のままで、原因を断定しない。

**未保護の判定**：レビューで、次の判定をそれぞれ外す変異でも236件が成功することが判明した。

| 判定 | 外した場合の影響 | 追加試験 |
|---|---|---|
| verify結果の`kind==='failure'`・`type==='bounded'` | `type:'unexpected'`の失敗がunverified継続になり、「BoundedReadError以外はhard停止」に反する | 非bounded失敗でhard停止（internal_review_error）、worker起動0 |
| success結果のchange flagのboolean検査 | `changed:'no'`のような文字列が真としてchangedになる | 非booleanのflagでhard停止 |
| `preparePhase`のworker期限型拒否 | worker期限の観測からphase planを作れ、SR-Cの旧世代終了証拠を迂回する | worker期限型のrecoveryからのprepareを拒否し、phase診断を作らない |
| 受理済みinputのないreviewed／result_omittedの拒否 | T_iのないreviewed結果が完了として残る | reviewedのみでinputなしのprepareを拒否 |
| window／verify／receiptのopaque参照検査 | 文字列やProxyが`===`の値一致で同一参照と扱われ得る | 3種×文字列／Proxyでprepareを拒否（3件） |
| ready世代維持時の`initial_worker=null`要求 | 不要な初回起動frameが黙って無視される | ready世代維持で初回frameを渡すと拒否 |
| ready失敗理由の限定 | `access_denied`等がそのままhard理由として残る | 想定外の理由をinternal_review_errorへ固定 |

各変異では対応する追加試験1件だけが失敗し、復元後に`cmp`一致を確認した。`used>=2`、U超過のT_i、retry_wait／takeのstage判定、preparePhaseのstate／phaseModel判定は、外しても他の判定で同じく拒否される等価変異として扱い、追加試験の対象にしていない。model・issuer実装・runtime sourceは変更していない。

修正後の結果：

| 検証 | 結果 |
|---|---|
| SR-B＋SR-A | 2ファイル／245件成功（121＋124） |
| ESLint | `npm run lint`（repo全体）exit 0、errors 0 |
| 全体合成 | maxWorkers=3、240ファイル／10,729件成功、失敗0・pending 0、exit 0。JSON内の開始〜最終試験終了は約56.7秒 |

soft回復claim設計はdraft-0.6へ更新し、§13の件数・保証範囲と親設計・本書からの版数リンクを直した。

## 6 未実施・残課題

SR-Cのworker期限型・旧世代終了証拠・世代交換、SR-DのWJ-C finish／E・実cleanup・外側checkpoint連結は未実装。実session／ReleasePermit／実選択window／payload receipt／worker jobの正式証拠発行、実予算writerと予約台帳の接続、全費目上界・本番cap・全体受付は別工程。非実行dataを正式権限へ昇格しない。

実worker／runtime接続・実通信・実機操作・トークン発行・設定変更・permit発行・Pushは行っていない。無関係な`.vscode/`／`CLAUDE.md`は変更していない。本書の局所状態や合成cleanupは実終了の証明ではない。
