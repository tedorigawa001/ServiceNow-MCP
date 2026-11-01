# WJ-B：同inputのT_i受理・U保持／analyze期待値照合

Date: 2026-11-01 / 基準HEAD: `654730a`。
Status: **配布対象外の合成issuerのみ。実worker／runtime・実sessionとは未接続。**

[詳細設計draft-0.6](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)§12と[接続契約draft-0.8](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装範囲

[新owner](../tests/support/review/synthetic-worker-time.ts)が既存WJ-Aをprivateに所有し、runtimeの登録台帳・session・workerを共有／importしない。WJ-A本体・既存157件は変更しない。WJ-Bには汎用consumeやfinish発行口を公開せず、同input期待値を通った非実行candidateだけを返す。

Oで初期化したUは同receiptのT_iについて非減少を検査し、最後のpost-guard後にだけ更新する。T_iは値入力で、新しい時計を採取しない。S／全L／Oと元identityを各追加guardでも照合する。startup前に受理でき、startup／ready・送信失敗、rejected／result_omittedでも受理済みUを削除しない。

失敗時はbinding／generation／input／pendingとseedのidentity参照を同期失効する。S／L／O／Uの**値だけ**を固定終端データとして保持し、再開やfinishの権限にはしない。`discardTerminalTime`は値を破棄するだけで、失敗状態や先行診断を解除しない。正常closeは時刻も破棄する。外部copy／heapの物理消去は保証しない。

応答はpendingをguard前に消費し、同generation／supervisor／worker／id／kind／targetをWJ-Aで確認した後、同receiptの対象・元record時刻・rule集合・instance binding・release context・必要limitationsを照合する。reviewed_at／retrieved_atは同T_iと文字列で完全一致する。比較不正でもpost-guardを行い、取消／期限を優先して停止する。全guard後だけauthority:noneのdataを返す。

必要fieldだけをdescriptorで読む。Proxy／accessorは実行せず拒否し、findings等の全結果を親で再parse／copyしない。pureな既存値schemaの再利用であり、既存full schema／wire上限の代替や実release admissionではない。局所copy上限は設計§12の通りで、本番日時長capや全体work／メモリ上界は未承認／Unknown。

## 2 独立oracle・境界

[63件の合成試験](../tests/review/synthetic-worker-time.test.ts)で確認した。

| 観点 | 確認内容 |
|---|---|
| 独立field oracle | 15種の期待field差替えをすべて拒否。予測には実比較器／schemaを呼ばず、差替え表の拒否結果を固定 |
| 独立時刻列 | 100 input／100 analyzeを、別の整数UTC非減少計算と逐次比較。Uの採り直し・余分なjobなし |
| T_i境界 | U等号、S+L等号、1ms下限割れ／超過、不正UTC、前回Uより古い次receiptを確認 |
| guard | inputの全5点、応答の全6点で停止。最終guard失敗では新U／成功counterを公開しない。比較不正より後続停止理由を優先 |
| startup／send | startup失敗、送信の同期throw／reject相当の合成イベントでUを保持。再生成・遅延返却は拒否し、秘密の例外本文を出さない |
| input／job同一性 | 別owner／input／job／generation／worker／supervisor／id／kind／assetの混入、二重消費・捕捉再入を拒否 |
| 終了 | 正常source cleanup後は既存pendingだけ消費可能。run取消は同期失効し、固定discard／正常closeで時刻データを破棄 |
| 非公開値 | 入力期待値の呼出し元変更は影響しない。必要fieldのgetter／Proxy実行0。関係しないfindings getterも実行0 |

これらは合成assemblyの保証であり、本物の供給元／ReleasePermit／worker jobを結合した証拠ではない。runtime soft recoveryや既存の停止後部分finishを変更していない。

## 3 初回失敗と訂正

| 段階 | 観測／対応 |
|---|---|
| T_i基本RED | stubのUがOのままで1件失敗。受理後U更新でGREEN |
| 非減少RED | 古い次receiptが通り1件失敗。U下限とsticky停止でGREEN |
| 最終input guard | 初回はguard位置を6と誤記し取消未到達。実際の5点目に訂正した後、新Tが失敗時にも残るREDを確認。Uのcommitを最後のpost-guard後へ移してGREEN |
| seedの最終照合RED | 最後のinput guard内のsource差替えが通り1件失敗。wrapper追加guardも同10項目を再照合してGREEN |
| pending順序RED | 最初の応答guardでpending=trueを観測し1件失敗。wrapper slotもguard前に取り外してGREEN |
| binding省略RED | 省略値をconstructor用skipと混同し、startup失敗がinternalではなくcancelledに分類された1件。skipをbinding phaseだけへ限定してGREEN |
| 梱包負の対照 | 未使用runtime importがTypeScript変換時に消え、期待した拒否が起きず初回失敗。最小変換で原因を確認し、値参照を伴う混入へ訂正。その参照を拒否することを確認 |

このREDは新規stub／合成owner／検査fixtureの開発履歴で、従来製品の脆弱性や実通信失敗を観測した主張ではない。旧試験のskip・削除・期限緩和は行っていない。

## 4 最終検証

| 検証 | 結果 |
|---|---|
| 新規＋WJ-A | 2ファイル／220件成功（新規63＋既存157） |
| build | `npm run build`成功。新helperはtests配下でdistには出力されない |
| standalone TypeScript | 新試験と参照helperをstrict／noUnusedLocals／noUnusedParametersで確認、エラー0 |
| ESLint | 新helper・新試験・変更梱包script、問題0 |
| 全体合成・初回 | maxWorkers=3、237ファイル／10,398件成功、失敗0・pending 0。約32.7秒。この時点は新規62件 |
| 全体合成・最終 | binding省略回帰追加後、maxWorkers=3、237ファイル／10,399件成功、失敗0・pending 0。約35.3秒 |
| offline梱包 | `node tests/review/package-http-classification.mjs`成功、441ファイル。WJ-A／Bのpath・関数名がdist JS／宣言／mapに無いことを確認。runtime import・clock／I/O／worker参照の負の対照も成功 |

全体JSONはローカル一時領域の`/tmp/servicenow-wjb-tests-final-20261101.json`。時間はJSONの開始〜最終試験終了。numTotalTestSuitesはdescribe節を含むため、ファイル数はtestResults.lengthで数えた。合成testはローカルだけで、PDIや本物の資格情報は使用していない。

## 5 レビュー修正（2026-11-02）

§2・§4の63件／10,399件は修正前の記録として残す。レビューで、owner実装にある次の3判定をそれぞれ外す変異でも63件が成功することが判明した。

| 判定 | 外した場合の影響 | 追加試験 |
|---|---|---|
| analyzeは期待context付きreceiptを要求 | 時刻だけのreceiptでjobを発行でき、rejected／result_omitted応答が同input期待値を経ずにcandidateとして受理され得る | 時刻だけのreceiptのanalyzeが`internal_review_error`／phase=analyzeで停止し、pending・inputを残さずUを保持 |
| `discardTerminalTime`は停止後だけ | 稼働中runのS／L／O／Uを消したまま継続する | 稼働中は拒否して停止し、Uとheld timeを保持。正常close後はclosed・診断なしのまま拒否 |
| `startupFailure`はstarting中の世代だけ | ready済み世代の失敗をstartup失敗の理由で記録する | ready済み世代では`internal_review_error`／phase=startup_failureで停止し、Uを保持 |

各変異では対応する追加試験1件だけが失敗し、復元後に`cmp`一致を確認した。owner実装・WJ-A・runtime sourceは変更していない。

修正後の結果：

| 検証 | 結果 |
|---|---|
| WJ-B合成 | 1ファイル／66件成功 |
| ESLint | `npm run lint`（repo全体）exit 0、errors 0 |
| 全体合成 | maxWorkers=3、237ファイル／10,402件成功、失敗0・pending 0。JSON内の開始〜最終試験終了は約50.4秒 |

詳細設計はdraft-0.6へ更新し、§12の件数・保証範囲と上位設計・本書からの版数リンクを直した。

## 6 未実施・残課題

finishのE／対象集合・soft世代移行・WJ-C／D、TB-B／CT-Aからの正式供給／上位移譲、実worker／runtime接続、CT-C・B-03 compiled保証は未実施。固定seedが実sessionと一致することや本番唯一性は証明しない。配置／全work・exact layout・本番capはUnknownのまま。

実接続・実通信・実機操作・トークン発行・設定変更・Permit発行・本番cap投入・正式発行・全体受付・Pushは行っていない。VM／監視／telemetry調査は保留のまま。無関係な`.vscode/`／`CLAUDE.md`には変更を加えていない。
