# RC3-D02：同sourceの200行ack・固定比較・guard・seal後summary

Date: 2026-11-01 / Baseline: `6c3d8f3`。開発assemblyの固定値・合成I/Oのみ。

## 1 変更範囲と維持する閉鎖条件

[RC-03設計draft-0.4](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)のD02だけを実装した。

- 開発sourceの同realm／contextにだけprivate観測slotをarmし、元のrelease ackから消費した同じprojectionを一度退避する。固定ownerによるtakeはguard前にslotを消費し、再読・再利用を拒否する。通常profileでは従来どおりprojectionを破棄する。
- 条件ownerはclaimed→comparing→compared→transferring→transferredと一度だけ進む。同source／context／世代1／doneを、取得後・比較後・退避後にも照合し、固定`compareRelease`以外を注入する口は作らない。
- rootは正常body完了時にdata-onlyのfresh frozen候補を退避する。source／ownerの参照を破棄し、cleanup confirmed・source closed/sealed・先行失敗なし・元clock／外部signalの最終確認後だけsummaryへ公開する。

明示opt-in時だけ`release_comparison`を追加する。scopeはrelease_value_comparison_only、kindはrelease_comparison_draft、権限4項目はfalse。rootの既存field／scope／permissionsとbootstrap.release_match=not_evaluatedは不変。ok=trueやmatchedをadmission・実Permitと解釈しない。

source値profileは合成値をcomplete_200として試すC=0の経路であり、HTTP200を実測した証明ではない。fixed-200 transcriptは同じ合成bytesのC/G課金を検証する別経路である。どちらも実source／native statusの取得証拠へ昇格しない。

runtime src・実source・MCP・認証・実transport・設定は変更しない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。binding不一致no-requestはD03まで未対応、native/status-onlyとの併用はI/O前に拒否する。空200の設定代替は純粋値モデルで、HTTP fallbackの有効化ではない。

## 2 新規44件の独立した合成検証

`tests/review/development-release-adoption.test.ts`の期待値は固定family・reason・warning配列・bytes長／試行数から記述する。既存sourceや同じ比較器の返値だけをoracleにしない。

| 対象 | 確認する事実 |
|---|---|
| 正常公開 | source closed/sealedとcleanup confirmed後だけ固定summary。Permitやlive handleなし |
| 同ack | 消費後の元rows変更やaddress等の余剰列が結果へ混入しない。callerの代替rows／draftを受けない |
| 一度限り／identity | 完了前compare、二重compare／transfer、別source／context／draft混入、失敗後再開を拒否。別ownerは正常なまま |
| guard | 比較前／後、取得guard中のowner失効、比較guardの再入、source単独revoke、退避前／後の期限で候補を破棄 |
| エラー優先 | policy矛盾はinternal_review_error。比較後の取消が先行した場合はcancelledを保持し、ordinary unknownで救済しない |
| 値 | 5family、空／欠損／未知／21行sentinel、設定代替のwarning順、expired設定との競合を固定期待値で確認 |
| 拒否層 | raw22行／row型不正はinvalid_response。UTF-8不正はG課金を保持して停止し、unknownへ格下げしない |
| 会計／予約 | per-user／cachedはC=2、exchangeはC=3。Gは同bytes長、P=0。final4予約／返却1回、bootstrapはnot_evaluatedのまま |
| 最終公開guard | cleanup後の取消、時計throw／逆行、元deadline到達で結果非公開。時計callback中の取消も拒否 |
| cleanup失敗 | timer解放throwでunconfirmedとなる場合は候補非公開。試験側で残ったtimerを必ず回収 |
| 公開前待機／replay | wait中に結果を返さず、取消後は非公開。summaryのJSONを次の条件として再採用しない |

D01の4つのopt-in互換caseだけは、D02で新fieldを追加するという仕様差分を明示して更新した。新fieldを除いた既存summaryのdeep equalityは維持し、新fieldのscope／非実行性／値を別に確認する。旧profileの削除・skip・期待緩和、旧case対応表の分類変更はしていない。

## 3 RED／GREENと初回型エラー

1. seal後summaryの成功caseを先に追加し、新field欠落のREDを確認して接続した。
2. 比較／退避のpost-guard中にsourceだけがrevokeされる2件を追加し、拒否されないREDを確認。owner guardに加え、各post-guard後も同sourceのprimary／closed／sealed／世代／doneを再照合してGREEN。
3. 初回standalone TypeScriptは、比較器のinvalid_input拒否後も結果unionが残るTS2322を1件報告した。systematic-debugging手順で該当分岐を確認し、固定拒否を`return reject(...)`として終了を明示した。同じ型チェックで成功し、型抑制やruntimeの権限昇格は行っていない。
4. 初回全体成功後、cleanup前の最終観測より時計が逆行するが開始時刻よりは後、という追加1件でREDを確認した。同canonical leaseの残時間をcleanup直前に保持し、最終確認で残時間が増えていないことも照合してGREEN。元deadlineを再設定・延長せず、旧profileにはこの追加読取を行わない。

## 4 検証結果

| 検証 | 結果 |
|---|---|
| D02新規＋D01・既存development root/source/bootstrap/native | 最終6ファイル202件成功（新規44件） |
| standalone TypeScript | 最終エラー0。D02/D01 unitと開発assemblyを確認 |
| `npm run build` | 成功 |
| compiled／オフライン梱包 | 425ファイル、既存compiled fixture成功。D01/D02のprivate module・観測arm API・summary markerがdist JS／宣言／mapにないことを確認 |
| 初回全体合成テスト | 追加の逆行1件より前。maxWorkers=1で226ファイル／9,944件成功、失敗0・pending 0、約101.8秒 |
| 最終全体合成テスト | 逆行試験追加・補強後、maxWorkers=1で226ファイル／9,945件成功、失敗0・pending 0、約86.1秒 |
| 文書・差分 | 9文書のローカル参照144件が存在。`git diff --check`成功 |

全体実行は他のbuild／testと重ねず、製品・試験の期限を緩めない。生成JSの既存fixture成功はD02開発assemblyの専用compiled保証ではなく、B-03の残差を維持する。

実行：`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-rc3-d02-tests-20261101.json`。JSONはローカル一時成果物で、恒久的な集計は本書へ記録する。直列での成功であり、通常並列の既存失敗の原因確定・再発解消を主張しない。

最終の再実行は`/tmp/servicenow-rc3-d02-final-tests-20261101.json`へ出力し、上表へ記録した。試験・製品の期限値は変更していない。

最終確認時に別の`package-worker.mjs`も実行したが、既定npmキャッシュへの書込みがEPERMとなり失敗した。一時キャッシュを指定した再試行も、依存再インストールがnpm registryへ取得を試み、DNS解決ENOTFOUNDで失敗した。この補助試験はオフライン条件に適さず、再試行しない。PDIへの接続・キャッシュ所有権／永続設定の変更はない。本変更の梱包保証は、専用の`node tests/review/package-http-classification.mjs`によるオフライン検査（425ファイル・既存compiled fixture成功）で確認したものであり、この補助コマンドの成功を主張しない。

## 5 レビュー修正（2026-11-01）

cleanup後の最終再確認（外部取消・元deadline到達・時計失敗・逆行）が、候補の破棄に加えてrunの`stopped`／`run_primary`を設定していた。admission返却・construction seal・source sealが済みteardownがconfirmedのrunでも、opt-inしただけで`ok:false`・`cancelled`等へ変わり、時計を読まない通常profileとは結果が分かれた。probeで、最後の時計callback内のabortにより`code:'cancelled'`・`run_primary:{code:'cancelled'}`・teardown confirmedとなることを確認した。

再確認は候補の破棄と固定の`release_comparison_withheld`（cancelled／deadline_exceeded／internal_review_error）だけに限定し、ok・code・run_primaryを書き換えない。cleanup前の`takeForClose`区間の失敗は従来どおりrun停止とする。既存の再確認試験5件（4種＋開始後の逆行）の期待を「run成功・候補非公開・withheld理由」へ変更し、遅延abort時に`release_comparison_withheld`を除くsummaryが同signal付きの非opt-in runと完全一致する試験を1件追加した。D02試験は45件成功。変異確認として修正前のassemblyへ戻すと6件が失敗し、退避copyから復元して`cmp`で一致を確認した。§2・§4の件数は修正前の記録として残す。

## 6 残課題・非主張

次はD03のbinding不一致no-requestをdispatch前へ接続し、release GET=0・予約返却を確認する工程。Rの実source差替え・構築時readonly deadline供給・実Permit結合・native/status-only移行・B-03の保証表／専用compiled・friend撤去は未実装／未承認。

設定日時の長さ上限、全入力byte／work、同期解析の時間上界、RのUTC採取位置／壁時計逆行と上位結果時刻の整合は未確定。D02のguardは同期比較の途中をOS的に強制preemptionできる証明ではなく、境界で停止を確認するものに限る。

[D01検証記録](E2E_BEST_PRACTICE_RELEASE_CONDITIONS_D01_2026-11-01.md)の初回39件失敗・1件未実行や、RC-01の初回16件失敗は保持する。本変更で並列時の再発解消や正式binding完了を主張しない。実接続・実通信・実機操作・トークン／実Permit発行・設定変更・Pushは行わない。
