# WF-B BL-B：固有ESMへの304case接続・旧方式との実行照合

Date: 2026-11-13 / 基準HEAD: `967c7d8` / 対象：[試験見直し設計§11](BEST_PRACTICE_WFB_BODY_LIVE_COMPILED_REDESIGN.md)。作業開始時treeはclean。

合成依存限定。通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushなし。作成時点では未コミット。

## 1 実装範囲

| 追加物 | 責務 |
|---|---|
| body-live-esm-loader.ts | 同source・台帳・URL・namespace／factoryの所有、順序／予約、同絶対期限のpre／post、固定first、有限公開観測のdigest、追加隔離対照 |
| body-live-driver.ts | hash固定の旧scriptからscratch driverを派生。全旧assertの本文／順序・意味診断入力とoptionsを維持 |
| compiled-body-live-b.mjs | opt-in別入口。既定はJS patch、--referenceは従来TS変異の全体emit。双方同じassert／観測を実行 |
| compiled-body-live-compare.mjs | 旧→新→新→旧を直列で起動し、60秒期限、有限出力、exit／close・group終端を確認して全caseを比較 |
| body-live-loader.test.ts | fake I/O／clockで停止・再入・混入・重複・source不一致・未知入力・派生scriptの保護部分を検査 |

上記5fileとCHANGELOG・設計・本記録だけを追加／更新する。旧compiled-probe-body-live.mjs・composition fixture・BL-Aのkernel／oracle・製品src／runtime・package／lockfile／設定・通常callerは変更しない。試験用load sessionは実認証sessionではなく、正式なclaim・source証拠・実予算を発行／更新しない。

## 2 保持した保証と状態混入拒否

旧scriptはSHA-256 `d78c192b304fa73d7e5f70d467564f0dea1a5b3d9cbff3736fd4fab1c0075f07`のまま保持した。派生時に全assert式の本文と出現順を照合し、独立testでもその集合／順序とextra／optionsの本文を旧scriptと比較する。関係節の単独除去、最初の拒否位置への感度、issued保持、readonly実操作、初回rejected、先行診断、descriptor／phase projectionの旧期待値を減らしていない。意味診断19行とbaseline診断0のassertも元のままである。

各loadで旧方式のTS入力を独立oracleの同case参照と比較してから、同runのJS値を固有URLへwriteする。write前にURLを予約し、write／import失敗やstop後にも予約を返さない。同じnamespaceまたはfactoryを別case／別ownerへ再採用できない。import完了後と公開直前にも同じ絶対期限・停止を確認し、失敗後の継続や並行loadを拒否する。

385回の元run結果（有限公開reply／snapshot）を順序付きで採取し、全体と304case別のSHA-256で照合する。型・array／objectの違いを保ち、凍結plain data・dense array・有限primitiveだけを受け付ける。getter・Proxy・function・穴のあるarray・上限超過を拒否し、入力をJSON.stringifyへ直接渡さない。最大1,024観測・encoded 4MiB、出力はdigest主体の有限JSONで、元TS・JS・private参照は出さない。暗号学的digestによる照合であって、全観測本文を永続保存したbyte比較ではない。

304個の実caseはBL-Aから得たJSそのままで、全て別URL／別namespace／別factory identityを確認した。追加の2moduleだけにscratch専用のcurrent差替えとcapture／offerを加えた。実case・元fixture・runtimeにfriendを追加していない。対照では、brand別identity、close後も他ownerの状態不変、双方向foreign参照2件・同値copy1件・Proxy1件のbinding_mismatch、元descriptor不変、入力hook 0、混入解除後の新owner正常を確認した。offerはfinallyで解除するが、ESM cacheやheapの解放済みを意味しない。

## 3 同条件の新旧実行照合

Node v24.18.0／TypeScript 5.9.3、利用可能CPU数10。同じ入口・依存・fixture・派生assertを使い、各childだけに独立の一時TMPDIRを与えた。子はNodeを直接spawnし、外側の診断起動とは起動経路を分けて記録する。旧方式の対照は観測を付けた派生driverであり、無観測の元entry単体と同一の計測条件とは主張しない。

payloadのtranspileは旧306回（主304＋補助2）から新3回（主1＋補助2）。別に両方式ともsupport4moduleを変換し、この起動費も60秒枠へ含めた。case304＋補助2のimportは維持し、隔離対照2を追加した。事前compileや保存cacheを期限外へ移していない。

最終版の結果（時間は親のspawn直前からchild closeまで）：

| 順序 | 方式 | exit／close ms | code／signal | 1分load開始→終了 | stdout／stderr byte |
|---|---|---|---|---|---|
| 1 | 旧方式派生対照 | 40,138／40,138 | 0／null | 3.99→5.31 | 21,339／0 |
| 2 | 新JS patch経路 | 10,653／10,653 | 0／null | 5.31→5.42 | 21,328／0 |
| 3 | 新JS patch経路 | 10,721／10,721 | 0／null | 5.42→5.29 | 21,328／0 |
| 4 | 旧方式派生対照 | 39,981／39,981 | 0／null | 5.29→5.14 | 21,339／0 |

全4runで304case、385観測、case別digest 304個、旧summary全fieldと意味拒否19行、隔離対照の全結果が一致した。全体digestは `f44fd5a59a65702e26f960ab9c26715342f06bae2615ea9f4d3aed0be099fdb2`。同条件の観測では平均約40.06秒→約10.69秒となったが、これを任意負荷・将来fixtureサイズに対する上界にはしない。新方式の独立3runとrepository全体の通常並列受入は未実施で、BL-C完了ではない。

各childの期限は60,000msのまま。stdout／stderrを各64KiB上限後もdrainする構造で、今回truncatedは全てfalse。全runのexitとclose、所有group不在2回を確認し、終了signalは不要だった。正常終了確認後に親の一時領域とchild生成物を除去した。過去のtimeout childや別groupへの離脱を含む全OS processの不在を遡及証明するものではない。

## 4 RED・初回失敗と訂正

| 段階 | 観測と対応 |
|---|---|
| load sessionのRED | 未実装stubのnot_implemented。最初のbase入力／固有URL／namespace受理を追加してGREEN |
| 派生driverの初回失敗 | 旧script全文のpin literalを早く埋め込んだため、後続の置換anchorが二重化しdriver_drift。インフラ置換の後で最後にpin literalを埋め、literal自体の不変をunitで確認 |
| 連続接続のRED | 全304case後のisolationが未実装でTypeError。意味診断や試験全体成功へは数えず、2module隔離対照を接続して再実行 |
| Proxyの初回test期待不備 | asyncがProxyを返すとPromiseのthen探索がnamespace受理前に走り、throwはioとなる。admissionのhookとPromise protocolを区別し、then探索1回／namespace検査hook 0の対照とthen throw→ioの対照を分離。実装の拒否条件は緩めない |
| 最終clock内stopのRED | 公開直前のclock callback中に同期stopしてもloadがresolveした。clock観測後にphaseを再検査し、同じ対照でclosed拒否・completed 0を確認 |

最初のABBAも全一致・全期限内（40,133／10,804／10,661／40,266ms）だったが、同期stop修正前の履歴として区別する。最終版は§3のABBAを再実行し、digestと19行を再確認した。期限・旧assert・負の対照は変更していない。

## 5 検証範囲・残課題

新unit26件は、同source／順序、未知ID、重複URL、namespace／factory混入、busy、import中取消、最終clock内stop、write／import前後の同期限、時計throw／逆行／NaN、I/O失敗後の再利用拒否、Proxy／getter／function／array hole、未完了seal、旧assert／意味診断の保存を確認する。関連回帰はbody-live-loader／body-live-migration／probe-body-live／probe-body-seed／probe-body-bundle／probe-body-bind-fields／probe-body-pin-returned-closedを対象とする。

| 最終検証 | 結果 |
|---|---|
| 合成・関連回帰 | 7file／785件成功・失敗0。新unit26、既存BL-A326を含む |
| 新旧実行・compiled保証 | §3の4child全成功、304case／385観測・case別digest・旧summary・意味診断19行・隔離結果が一致。子groupの終端も全確認 |
| strict型検査 | loader／driver／新test、ES2022／NodeNext／strict／noEmit、exit 0 |
| lint | 新test・loader／driver・別入口／比較器の5file、exit 0 |
| build | npm run build、exit 0 |
| 梱包dry-run | offline・ignore-scripts・一時cacheで441file、review-workerあり、src／tests／今回fixture混入0。archive生成なし、当該cacheはfinallyで除去 |
| 文書・scope | 設計／本記録のローカルリンク6件・表9個の列数・末尾改行／差分空白を確認。通常経路・旧fixture／script・BL-A kernel／oracle・runtime／設定は基準HEADと不変。index未登録 |

物理allocation・GC・OOM・診断必着・停止後のheap退役・実E／S／全体work capはUnknown。親supervisorのstdout超過・stdio保留・SIGKILL等の故障注入matrixは今回完了しておらず、BR09全完了とはしない。子出力は既存summary＋BL-B summaryの2JSONで、設計§5の群別の有限進行checkpointは未接続。通常並列のrepository全体回帰、安定3run／30秒目標の正式な受入、通常経路切替と旧経路の撤去判断はBL-C以降に残す。

正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・設定変更・Pushを行わない。source owner／実認証session／ReleasePermit・worker job・正式な証拠発行・body起動への接続は行っていない。

## 6 コミット対象だけの再検証（2026-11-14）

基準HEAD `967c7d8`に対し今回の8fileだけをindex登録し、indexの全追跡内容を新しい一時コピーへ展開した。登録対象8fileのbyte一致を確認し、未登録／未追跡の他変更はコピーしなかった。依存だけ既存node_modulesを参照し、導入／取得や設定変更は行っていない。Node v24.18.0／TypeScript 5.9.3を再確認した。

同コピーでbuild、関連7file／785件、strict型検査、追加5fileのlintが全てexit 0。新旧のABBA再実行は旧44,559ms→新11,754ms→新12,200ms→旧43,883ms（各childのcloseまで）で、全て60,000ms枠内、code 0／signal nullだった。全304case・385観測・case別digest・旧summary・意味拒否19行・隔離対照が一致し、全体digestは§3と同じ。stdout／stderrはdrain済み・truncated false／stderr 0、各所有groupの不在を2回確認し、終了signalは不要だった。

offline・ignore-scriptsの梱包dry-runは441file、review-workerあり、src／tests／今回fixture混入0、archive生成なし。一時cacheはfinallyで除去した。文書のローカルリンク6件／表9個・差分空白と、コミット対象だけのscopeを確認する。検証後の追加は本節の記録のみで、検証したコード／試験を変更せずにコミット対象を再確認する。通常経路未切替・正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、BL-Cの未確認事項を今回の成功で完了扱いしない。Pushは行わない。
