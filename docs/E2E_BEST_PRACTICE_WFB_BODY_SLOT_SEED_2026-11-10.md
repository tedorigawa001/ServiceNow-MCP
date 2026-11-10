# WF-B B03後半：先行shell／13carrier・context／origin／sentinel／pin

Date: 2026-11-10 / 基準HEAD: `b3f1f3e` / 未コミット差分の合成検証。

対象は[先行slot配置設計](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)§12と[固定body unwind契約](BEST_PRACTICE_WFB_BODY_UNWIND_EXIT_DESIGN.md)。開始時は作業ツリーがクリーン。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。今回コミットも行わない。

## 実装と未接続境界

package除外のcomposition fixtureにcreateProbeBodySeedFakeを追加した。同既存root／start／binding／cells／RunLink／duty／immutable exit anchorを再利用し、旧B03-Bのguard進行とB03-Cのlocal進行は生成しない。追加はprepare保護区間のBS00〜14とBC00〜05だけ。既存constructorへbody用array／origin等の生成副作用を入れず、shell捕捉後に13位置arrayと13空carrierを捕捉する。

contextはbinding側ownerとcell束側ownerをそれぞれ元の正規参照へ結合する。別ownerを等値化しない。body origin、throw／cancel sentinel、非実行pinは同contextへ結合し、pinは同grant保持slotだけを参照する。正式grant発行・body実行・throw／cancel発生ではない。dataはissuedを保持してからfreeze／current捕捉・strict関係検査を行い、初回rejectedも保持する。

正常はshell held／seed_held・ok=false、構築ready=false／root ready=false、bind未試行。dataは1〜5だけconfirmed、6〜13carrierはnot_started／未使用／参照なし。BC06以後・body start borrow・bundle／draft・BD／ready・BA／body・BU／退役・(C)証拠を実装しない。公開APIはprepare／check／checkLegacy／close／inspectだけ。任意callback／artifact／mode登録口やfake friendはない。

失敗・closeは同root failure・最初のphase／boundaryと保持prefixを残す。再prepareは正常後ならduplicate_preparationのrefusal、失敗後なら同固定返答。再入はconstruction_in_progress。slot clear／claim返却・別root補完・borrow解放は行わない。全返答は有限plain data・freeze・固定enum／strict booleanで、private参照・symbol・関数・getter・raw例外を出さない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-seed | 154件成功 |
| 関連25ファイル | 1,891件成功、失敗0 |
| 新compiled-probe-body-seed | exit 0。field33、copy／brand／extra／getter各5、shell2、owner分離、重複refusal、先行保持2、carrier identity、未使用carrier、参照漏洩・root ready・body trap、型拒否9 |
| 旧compiled16本 | 全てexit 0 |
| composition＋新試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（既存設定のsrc／tests） | exit 0、error 0・warning 374 |
| 梱包dry-run | exit 0、441ファイル、tests／新fixture／composition fixtureの混入0 |

関連試験はprobe-body-seed／probe-local-exit／probe-exit-guard／probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundaryの各`tests/review/<name>.test.ts`を`bdo npx --no-install vitest run`へ明示した。全repositoryのvitest回帰は未実施。

compiledは新fixtureに加え、probe-local-exit／probe-exit-guard／probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualを`bdo node tests/review/fixtures/compiled-<name>.mjs`で実行。変異は一時scratchだけへ出力しfinallyで除去する。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-body-seed.test.ts`。buildは`bdo npm run build`。lintは既存eslintのsrc／tests全体をJSON集計。梱包は一時cache指定の`npm pack --dry-run --json --ignore-scripts`の一覧検査で、archive生成／公開なし、cacheはfinallyで除去する。

## 独立期待値と対照の意味

bootstrap15操作×4境界の60件は本体からscheduleをimportせず、indexとretained境界前後だけでshell／array／carrierのprefixを独立計算する。holeを空carrierとしない。BC01〜05×6境界30件は予約・call境界・issued／current・confirmedを独立表で比較し、生成前／issuedのみ／provisional／confirmedを区別する。BC00の2境界とproducer throw5件はdataなし／生成結果未確認責務を保持し再呼出ししない。

field一覧は本体の配列をimportしない。5dataのfield33種とcopy／brand／extra／getter各5種、合計53件は対象carrierでbinding_mismatch、初回rejected保持、後段data0を確認する。正常1件・close／再入の2試験（各92境界の有限loop）・未知入力拒否1件を含め154件。全variant×全故障位置の直積ではない。

compiledでは33fieldの各関係を1節ずつ外した場合にだけ、対応する不正dataがseed_heldへ変わることを確認する。copy guard・brand・field数も同様。getter対照はdescriptor検査中はhook0、検査を外すと固定getterが1回呼ばれることを検出し、最終失敗だけで保証しない。bindingOwnerとcellOwnerを誤って同じ値へ揃えたproducerも、cellOwner節で拒否する。

source failure参照／building stateの後段混入、bootstrapのsame-object捕捉、未使用13番carrierの予約済み混入も単独節の感度を確認した。shell／issued保持の削除はretained／issued直後のfaultで保持が消えることを検出する。重複prepareの先行guardを外す変異は後段の既存mint防御で再生成を止めるが、正規heldがfailedへ壊れるため拒否理由／先行状態の差を検出する。二重防御の全てを単独の操作防止保証と主張しない。

context参照をpublic sameOwnerBindingsへ漏らす変異をtypeofで検出し、root readyの早すぎる設定も実fieldのprojectionで検出する。公開graphは500node未満・plain data・freeze・primitive終端を検査する。旧body入口のthrow sentinelにも到達しない。semantic compile-fail9行はexecutable／origin kind／shell ready／bind使用／stage／index14／body関数field／readonly pin書換え／sentinel kindの不正を拒否する。同値copyの拒否はruntime identityであり、TypeScriptの構造型だけで証明しない。

## 初回の問題と訂正

初回strictは返答cacheをReturnTypeで自己参照したことによるTS2502／TS7023と、false固定fieldへのtrue比較TS2367で停止した。明示的な固定返答型と厳密boolean projectionへ直した。strict・新154件はその後成功。

既存compiled-canonical-gate-draftは、旧seed比較anchorが新contextの比較にもsubstring一致して停止した（anchor seed_copy）。旧試験の条件・期限・期待値は変えず、新しい比較だけを等価な逆順へ変更し、既存compiledを再実行した。製品のruntime挙動変更や期限緩和ではない。

最終レビューでは、生成後・issued捕捉前にscript判定が残らないよう、故障条件を生成前へ移し、固定producerが返した参照を直ちにissuedへ記録する順序に揃えた。malformed producerの候補形成はproducer内部、copy受領対照はissued保持後として分離した。先行保持・各故障prefix・compiled対照を最終ソースで再確認した。これはVM内部OOMの診断必着を保証するものではない。

## 残課題・保証の限界

SC01〜05／09〜12のBS／BC01〜05部分だけが対象。BC06〜13のlive body履歴／closure／診断view／退役／terminal／control／bundle／draft、BDのbindと構築ready、BA active化／body実行、BU実unwind、(C)証拠は未接続。各base preflight・各再検査・全bootstrap fieldの単独変異を網羅したとはしない。unknown／未確認の責務を全体受付可能へ昇格しない。

旧startの空borrow fieldも今回は追加せず、borrowRetained=falseは「接続していない」という固定診断。grant／body／retirementの0も未接続経路の範囲であり、実資源のcleanup証拠ではない。旧37＋8＋4＋5の構築postはbody準備readyではない。root constructor以前の失敗・実OOM・全guard数／unit係数・実E／S／layout・実会計・全体work上界はUnknown。配布source・設定・製品／試験期限に変更なし。全体受付無効・調査保留、Pushなし。

最終確認：最終ソースで関連25ファイル1,891件・compiled17本・strict／build／全体lintを再実行し、全てexit 0。梱包dry-runは441ファイル・fixture混入0。設計／検証3文書のローカルリンク13件に欠落なし、新規ファイルを含め末尾改行／空白と差分空白に異常なし。src・manifest／lockfile・梱包／TypeScript設定に差分なし。対象は合成fixture／試験・CHANGELOG・設計／検証文書の9ファイルだけで、index登録・コミット・Pushは行っていない。

## コミット前の対象限定再検証（2026-11-10）

前節までの未コミット／index未登録の記述は実装時点の記録。本節はその後のコミット依頼に対する確認である。基準HEADは`b3f1f3e`。対象9ファイルだけを明示してindexへ登録し、index全体を一時ディレクトリへ展開した。対象9ファイルのbyte一致を確認し、既存node_modulesだけを借用した検証用コピーでbuild・strict・関連25ファイル1,891件・compiled17本を再実行し、全てexit 0。

全体lintはerror 0／既存warning 374でexit 0。梱包dry-runは441ファイル・tests／新fixture／composition fixtureの混入0、設計／検証3文書のローカルリンク13件に欠落なし、差分空白エラーなし。全repositoryのvitest回帰は今回も未実施。再検証後の変更は本節の追記だけで、実装・試験は検証時と同じ内容。他の作業差分・bind・構築ready・body起動・実接続・実通信・設定変更・Pushは含めない。
