# WF-B call区間／receiver busy：内部型・readonly private bridge・BP03診断写像

Date: 2026-11-11 / 基準HEAD: `3fc15ab` / 未コミット差分の合成検証。

対象は[call・receiver差分設計§13 draft-0.3](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)、[private pin親§16](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)、[bind親§18](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)。開始時はクリーンで、前半レビューの`ff866f9`と境界軸の文書訂正`3fc15ab`を維持する。正式発行口・既存C実行入口・body起動閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 実装した境界と固定停止

同package除外composition fixtureにcreateProbeBodyPinBridgeFake／wfb-body-pin-bridge-1を追加した。固定scriptだけを受け、prepare／check／checkLegacy／close／inspectの5methodを公開する。元root／source／start、任意object／callback・public summaryを採用する入口は作らない。開発moduleのexport期待値2箇所へ新factory名だけを追加し、facade／runtime export・配布設定は不変。

既存C-02前半の同constructor／同prepare・同active frameで、PC02最終検査後、旧固定停止より前に新modeだけを分岐する。前段の抽出や返却済みrootの再開は行わず、旧(B)／C-01／前半factoryのcheckpoint順・返答・期待値は維持する。新modeはbefore／checked／blockedでreadonlyな元関係・初期活動値・PC02条件を再確認し、pin_bridge_not_connected／construction_unconfirmed／ok=falseで止まる。

rootにcallActiveを含む7原始scalarと空reply参照、同startにentryBusy=falseを先行した。callActive／entryBusyにはinitializer以外のwriterがなく、両方falseのまま。constructorの固定modeは公開booleanではない。source22key／metadata9／進行13、receiver9参照・旧field契約は増やさず、新しいowner／frame／registry／friend・token／Pin objectは作らない。

module-private probeBodyPinRootAccessはroot static初期化で一度だけ凍結し、identity／activeのreadonly照合だけを持つ。rootはlexical thisから供給し、元issued=currentと同startを候補field読取りより先に比較する。receiverのbinding／cells／run link／duty／exit bundleの9関係を固定accessから確認するが、receiver entry／dispatchは呼ばない。active資格には元来歴・未停止／元firstなし・元frame・BP03 caller位置・厳密source値・calling組が必要で、現在の実ownerでは成立しない。

正常到達でもsourceはpinCallReached=false／claim unused、receiver試行false／pinStage empty／全9参照空、data／grant／duty消費／body／readyは0である。検査が済んだchecked=trueは呼出し資格の発行・capture・cleanup・実証拠ではない。

## 値契約・BP03の位置と所有者診断の区別

BodyPinIntervalはbefore／calling／returnedの4field strict値組。BodyPinFailurePositionはrootのphase／step／before又はafterと、sourceの粗いbefore／checked／call／afterを分けた4field値組である。BP02 preflightの4組、BP03 callの2組、BP03 returnedの1組を許し、存在しない軸の組合せを拒否する。

calling／returnedとBP03の正例は、原始値だけを渡す非実行oracleで確認した。実rootのcallActive／source pinCallReachedやreceiver busy・prefixをtrue／非空へして正例を作らず、call発生の証拠へ昇格させない。実ownerを通る今回の診断位置はBP02のみであり、実call／復帰位置への結合・active ownerのguard単独感度は未検証である。

新failBodyPinBridgeはrootの実保持位置を値写像へ渡し、初回のphase／step／root boundaryを保持する。source側の粗い境界はこの継続で最後に確認したPC02 checkedから、将来BP03ならcall／returnedに応じて写像する。元sourceのmetadata確認を失ってもroot側の既知位置は保持し、未確認sourceへfirst／failedを書かない。sourceを確認できる場合も元issuedだけに書き、既存非noneを上書きしない。

生成BP01／after・生成failureRecorded=falseとC-01準備診断、root共通first・pin first、元source firstは別軸。build.firstは共通root firstなので、それだけを生成失敗と読まない。失敗後closeはcacheより先に元sourceへの同期停止を行い、初回位置・先行理由・返答同一性とPC01予約を保持する。元slotや診断をclearせず、保持を解放確認にしない。

## RED／GREENと初回失敗

1. 新factoryを使う1件は未実装TypeErrorでRED。最小のreadonly橋・新modeと固定停止後、新1件＋旧前半49件が成功した。
2. checked位置のclose試験は固定script未受付のinput_rejectedでRED。有限point・close／fault／prior／reenter分岐を接続し、その後は新30件が成功。前半／C-01を含む3ファイル103件も成功した。
3. 新compiledの不正busy値対照は期待state_invalidに対しconstruction_unconfirmedで失敗した。内部getterが`=== true`で公開診断用に丸め、未知値をfalseとして通していたためである。内部は原値を返して`!== false`で厳密拒否し、公開projectionだけを`=== true`にした。truthy文字列に加え、0／空文字／nullも拒否した。
4. source条件を既存の厳密checkerへ集約した後、calling値へ元sourceのbooleanを渡したため、TS2345（booleanはtrue型へ割当不可）になった。strict単体検査と新compiledのbaseline検査が失敗し、最初の連続compiled実行中も旧source-issuer／storage-data-split／bind-fields／bundle／liveが同じbaseline理由で失敗した。元のsource値を読むcheckerとcalling入力を**同じ検査済みvalues view**へ結び付け、castや設定緩和をせず解消した。これは新fixtureの型エラーであり、期限不足や旧機能のruntime失敗と分類しない。
5. 旧C-01／前半のAST禁止は、新診断writerに必要なroot側6fieldだけをclass／method単位で明示許可した。receiver・source claim・payload・活動flagへの禁止は維持した。元のruntime対照や型拒否を削除して通したものではない。

型修正後はソースを変更せず、関連33ファイル・build・strict・全体lintと新旧compiledを改めて実行した。初回の途中版を混ぜた連続実行を最終合格として扱わない。期限・並列度・既存設定・旧期待値は緩めていない。

## 合成・compiled保証

新Vitest30件は公開5methodだけを使う。正常固定停止、3位置×fault／close／prior／reenter、foreign source／start・同値copy／Proxy、先行する生成／C-01／前半失敗、開始前close、敵対的入力と余分な引数を確認した。prefix期待値は実装表／builderをimportせず独立に作り、source claim unused・空receiver・開始／活動履歴・初回診断・返答cacheを別々に比較する。公開graphは凍結plain・500未満で、raw参照／Errorを出さない。

新compiledは同sourceを一時scratchへemitし、finallyで除去する。次の範囲を確認した。

| 対象 | 検査と保証範囲 |
|---|---|
| interval | 4state×boolean3軸の32組、missing／extra／不正field拒否。calling／returnedは値だけ |
| 診断位置 | 240組を独立条件式と比較し、許可7組の凍結結果と不正軸を確認 |
| receiver private関係 | 9参照を個別copyへ変更して最初のbinding_mismatchを確認。各節除去で理由又は最初の拒否位置が変わる対照 |
| busy・固定拒否 | 不正原値4種の厳密拒否。active checkerをtrueへ迂回するとcheckedでstate_invalidとなり、callは依然0 |
| 最後の再検査 | blockedで元source boundaryを変えると同位置で拒否 |
| 初回位置・未知source | 異なる位置での再fail／closeでも初回保持。metadata未確認でsource first不変、guard除去では書いてしまう対照 |
| projection | allowlist3／strict boolean5の未知値拒否と非echo。busyの公開値もstrict比較 |
| 先行・負の境界 | root7scalar／receiver busyのliteral初期値、module-private root accessの代入1回。callActive／entryBusy・試行／参照・source claim／call flagの直接書込み0 |
| writer | rootが位置写像のphase／step／rootBoundaryを使うことをASTで確認。BP03実ownerへの到達を証明するものではない |
| semantic compile-fail | private bridge／writerの外部呼出し、calling時false、不正root境界・source境界・returned前境界の7行を拒否 |

旧compiledのcaller書込み例外はfailBodyPinBridgeの6診断fieldだけ追加し、module全体を許可しない。静的代入箇所数を実費用に読み替えない。scratchでのprivate-slot変更は局所guard感度用で、任意改竄安全性を保証しない。call用checkerの全節・実receiver忙状態・finallyによる退役／格納prefixはcall未接続のため受入済みにしない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-pin-bridge | 30件成功、失敗0 |
| 関連33ファイル | 2,476件成功、失敗0 |
| 新compiled-probe-body-pin-bridge | exit 0。interval32／位置240・許可7／関係9・型拒否7等 |
| 型修正後の新旧compiled25本 | 全25本exit 0、失敗0。初回の連続実行は5本失敗であり、この最終結果とは区別する |
| composition＋新試験＋旧body8試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。今回のfixture／新試験／新compiledはerror・warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・今回のfixture混入0。archive生成／公開なし |
| 文書／差分 | 4文書のローカルリンク38件・表25件、設計13／16／18節とCR8／CE14の順序・改行／差分空白に異常なし |

関連33ファイルは前回32ファイルに新pin-bridgeを追加し、`bdo npx --no-install vitest run`へ明示した。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`にcompositionと新pin-bridge／旧pin-start／pin-contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed試験を明示した。全repositoryのVitest回帰は今回未実施。

compiledは新bridgeと旧pin-start／pin-contracts／source-issuer／storage-data-split／body-bind-fields／body-bundle／body-live／body-seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの24本。buildは`bdo npm run build`。lintはsrc／tests全体をJSON集計。packはbuild後に一時cacheの`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧だけを確認し、cacheはfinallyで除去した。依存取得・導入・設定変更はしていない。

## 未接続・Unknown

CR02の固定call・callActive=trueとcall到達flag、receiver entryBusy予約／finally・一度限り試行／issued/current捕捉、PC08復帰照合・C-03は未接続。新値契約は証拠発行・実call資格を作らない。source利用claim・payload borrow／bind・BC00・構築ready・body起動・Journal供給・正式発行・実予算更新も閉鎖する。

実E／S・unit係数・layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断必着はUnknown。正式発行口閉鎖・全体受付無効・調査保留を維持し、実接続・実通信・実機操作・設定変更・index登録・コミット・Pushは行っていない。今回の検証は未コミット作業内容であり、コミット対象だけを別コピーで検証したものではない。

差分は合成fixture・新30件・新compiled・旧compiled2本の限定AST更新・開発export期待値2箇所・CHANGELOG・設計3文書と本記録の12ファイル。src／manifest／lockfile／TypeScript／配布設定は基準HEADから変更しない。

## コミット対象だけの隔離再検証（2026-11-11）

上記は実装時の記録。本節はその後のコミット依頼に対する再検証で、基準HEADは同じ`3fc15ab`。今回の12ファイルだけを明示してindexへ登録し、全indexを一時フォルダへ展開した。全1,517ファイルのGit blob hashがindexと一致することを確認し、他の未登録変更は検証対象へ含めなかった。既存node_modulesへの参照だけを再利用し、依存取得・導入・設定変更はしていない。

隔離した内容だけでbuild・compositionと新旧9試験のstrict TypeScriptがexit 0、関連33ファイル2,476件成功・失敗0、新旧compiled全25本がexit 0だった。全体lintはerror 0／既存warning 374、今回のfixture／新試験／新compiledはerror・warning 0。build成功後のoffline・ignore-scripts梱包dry-runは441ファイルでsrc／tests・fixture混入0、archive生成・公開なし。更新4文書のリンク38・表25・設計13／16／18節とCR8／CE14・改行／空白にも異常なし。全repositoryのVitest回帰は今回も未実施。

ソース・試験は隔離検証済みのindexから変更せず、追加は本節の記録だけ。本記録も再登録して隔離フォルダへ反映し、最終の対象12ファイル・全内容一致と文書整合を確認対象とする。活動flagはfalse、固定call・試行／格納・body・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。
