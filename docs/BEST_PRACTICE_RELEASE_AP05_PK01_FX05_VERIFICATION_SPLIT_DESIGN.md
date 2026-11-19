# AP05：PK01／FX05の旧試験・候補配布物の正対照／不在検査

Version: release-ap05-pk01-fx05-verification-split-draft-0.3 / Date: 2026-11-19。
Status: **試験分離の設計案。旧試験の移行・変更・撤去は未承認。** 静的基準HEADは`5f2a053`。[PK01の保証レビュー](BEST_PRACTICE_RELEASE_FRIEND_TEST_GUARANTEE_REVIEW.md)、[B-03のFX05](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)、[AP02の範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS03／05、K01／04を接続する。先行AP03の採用記録・未コミット差分は保持し、候補検査の基準に採るrevisionは別途固定する。PK02／03・FX03／04／06と旧ND単体UN62は対象外。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`7e6fdfe`（修正時のHEADは`7e6fdfe`）。draft-0.2の注記にあった「H／P／N／Dの各行」は、D区分をID付きの行ではなく§4の文章で扱う本書の構成と合わなかったため、「H／P／Nの各行と§4のD補完」に訂正した。§5の照合範囲・件数・各行・承認状態は変更しない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`06e8d34`（修正時のHEADは`84dac4e`）。他の設計文書と同じく、末尾に静的確認の記録（§5）を追加した。H／P／Nの各行と§4のD補完、旧assertion、承認状態は変更しない。B-03とfriend試験レビューにある本書への参照（draft-0.1）は作業中の変更と重なるため、今回は更新していない。

正式発行口・C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown・調査保留、元期限と既定並列度を維持する。MDのみ。旧試験の変更／skip・実装・撤去・再実行・build／梱包・混入操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 H：現行PK01と旧FX05を維持

| ID | 現行の直接検査・対象 | 維持境界と検査していないこと |
|---|---|---|
| PKF-H01 | [PK01](../tests/review/package-canonical-budget.mjs)はpack dry-runの一覧で、`review-canonical-budget`、`review-canonical-bootstrap-budget`、`review-composition-fake-io`の各JS／JS map／宣言／宣言mapを同梱必須とする。testsと`dist/review/abort-scope-evidence*`は非同梱 | 現行期待値を反転しない。これは一覧の観測であり、実tarball展開・候補物の依存解決・factoryの不在とは別 |
| PKF-H02 | 同scriptはリポジトリ`dist`のcanonical core／bootstrap budget／sessionを静的検査し、compiled canonical budget・canonical session・typed dispatch・private composition ackを起動 | 4本を保持。起動元はリポジトリ側の`dist`で、pack一覧に載った実物からの起動ではない。子起動箇所に明示timeoutは見当たらず、製品期限や既存60秒の監視枠を流用した実績にはしない |
| PKF-H03 | [FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)はper-user合成入力、親5列JSON→release Australia JSON、`synthetic_io`で旧実classのprepared処理を通す。直接assertは`prepared_only`／`fake_io=true`／ready世代1／cleanup=closed／reserved=0、family=Australia、発行disabled・dispatch unavailable、C=2／G=両body入力長の合計／P=0、指定5 own key（`source`／`permit`／`lease`／`accounting`／`token`）不在・JSONのPRIVATE文字列不在 | 元fixture・入力・期待値を保持。global fetchはthrowに置くが、呼出し回数の独立assertなし。総byte数と返値だけで全identity・同bytesの内容・reader／cleanup・Permit生存を直接assertした扱いにしない |

Hは旧revisionのソース・build・旧fixtureの組を記録する区分。将来候補Pで廃止した `synthetic_io` 分岐を旧FX05に使わせたり、候補Pに旧laneを復活させて旧試験を通したりしない。今回Hを移動・再実行せず、出力値だけを新しい検査のoracleにしない。[NS02のACK-01等](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)は別の元試験の保証で、FX05へ加算しない。

## 2 P：候補配布物の通常経路の正対照

候補は空の出力から作る同revisionの配布物。展開した同一rootから通常module・必要kernelを解決し、ソース／tsx／隣のdist／別loaderでの救済を禁止する。下表は既存の期待値を候補用の対照へ引き継ぐ案で、元fixtureの置換・起動契約・検証済みを意味しない。すべて合成I/O限定。

| ID | 維持する通常保証・参照元 | 候補側で独立に確認すること |
|---|---|---|
| PKF-P01 | [compiled canonical budget](../tests/review/fixtures/compiled-canonical-budget.mjs)とPK01の既存module検査 | canonical core／bootstrap budgetのJS／宣言／mapを残し、通常import成功と許可依存を確認。単一C/G/P、leaseの読取専用性、一次理由、final4予約と一度限りの受付・返却を元対照と同じ意味で確認 |
| PKF-P02 | [compiled canonical session](../tests/review/fixtures/compiled-canonical-session.mjs)の通常fetch注入・legacy GET、同fixture後半の省略時source結合 | 合成GETの旧C=1／G=2／P=6、公開観測差替えで元会計が変わらないこと、closeを保持。別入力の省略時はPromiseでない凍結summary、初期source／transport claim／同core接続、auth=false／ready=0、C/G/P=0、予約返却・固定close、dispatch unavailable／発行disabled。summary値だけで実結合を偽装しない |
| PKF-P03 | [compiled typed dispatch](../tests/review/fixtures/compiled-typed-dispatch.mjs)の注入対照と[通常source／Permit対照](../tests/review/source-release-binding.test.ts) | shape拒否C=0、dispatch後の同期throw／reject各C=1、同coreのG計上を別合成対照で保持。ただしこのfixture自体は通常ネットワーク経路ではない。通常の2引数source・親取得→release判断→同sourceのPermit／portと失効は別の正対照に残す |

## 3 P：配布物の不在と検査器の混入対照

先行AP03の採用記録を候補revisionに固定した後、正常候補で通常経路の正対照と不在検査が**両方成功**することを要求する。候補が旧HEADのままなら不在成功を期待しない。混入対照は正常物と別の隔離コピーで一つずつ比較し、各失敗理由を記録する。本文は対照の条件であり、混入方法の実装・実行指示ではない。

| ID／対応 | 正常候補の不在・拒否条件 | 混入対照で区別する失敗 |
|---|---|---|
| PKF-N01／NC04・EF3-N03 | `dist/servicenow/review-composition-fake-io`の`.js`／`.js.map`／`.d.ts`／`.d.ts.map`が実展開に1つもない。map内参照・埋込みsource、stale出力も確認 | 4種類を独立に対照とし、各1件の残留を該当のJS／宣言／map理由で検出する。実行参照がなくても残留を許さない |
| PKF-N02／NC03・EF3-N01／02／04 | 同梱JS・宣言・mapの到達辺から旧fake I/Oと開発Dを解決できない。static import、別名・再export、dynamic、型／mapの辺と休眠した受付本体を解決済み参照として調べる | 一辺ごとの残留／別名を、解決した行先または未解決の禁止辺として検出。元ファイル名のgrepだけや、package一覧に載らないことだけでは合格しない |
| PKF-N03／NC04・EF3-N05／06 | 残るsessionの通常importと同期summaryが成功。別入力のown synthetic_ioは値undefinedを含め同期invalid_input、旧Promise・fake pin・時計／provider・生成・dispatchへ進まない。専用moduleの解決失敗と残るmoduleの旧名前不在は別判定 | 旧受付が残る候補を受付条件／実行辺の違反として検出する。Dのunknown返値や同期／非同期の取り違えを合格にしない。元のAP03承認範囲に従う |
| PKF-N04／NC05・EF3-N07 | 必要canonical kernelと通常依存を同梱し、展開側の通常import／正対照が動く | 必要module欠落の場合は正対照の失敗。専用moduleの不在判定・混入検出成功とは区別し、起動不能／未実行・理由不明なら保留 |

## 4 D補完とAP05の切替条件

[開発bootstrapの既存対照](../tests/review/development-bootstrap.test.ts)には固定200の親／release、同coreのC/G/P、一時予約とsource受理がある。Dの別compiled成果物ではこの会計・ack・非実行の比較summaryを独立に確認する案を残す。Dの別brand・用意済み時刻／入力・unknown／mismatchedは、旧実classの登録ready・同bytesからのprivate ack→元source／Permit／owner→prepared・停止／診断保持を回復しない。FX05の旧保証はH、移行候補のD保証はD、Pの通常保証／入口不在はPと別集計する。

切替前に、対象revision・元assertion・候補manifestと正負試験・残差owner・AP01／04の判断・AP05の試験処遇と承認を同じ票に結ぶ。子processの終了・stdio／cleanup・固有の外側時間枠、梱包／設定の変更は別途承認を得る。Hの成功をPに足す、旧期待値を反転・skipする、未確認を完了にすることは不可。今回の受入条件・実施結果は未承認／未実施。

## 5 静的確認

基準`06e8d34`で、PK01のpack dry-runによる3module×4種の同梱必須とtests／`dist/review/abort-scope-evidence*`の非同梱、リポジトリ`dist`の静的検査と明示timeoutのない4本のchild起動（H01／02）、FX05の各直接assertionとfetch呼出し回数の未検査（H03）、compiled canonical sessionのC/G/P=1／2／6と省略時summary（P02）、compiled typed dispatchのshape拒否C=0・throw／reject C=1・G=2（P03）、NC03〜05・EF3-N01〜07の参照先を静的に照合した。本書のID10行（H3／P3／N4）、表3・ローカル参照11・明示anchor0、参照先・表列数・末尾改行・差分空白を確認し、変更は本書1件のみ、stage0、製品・試験・設定の差分はない。製品module import・試験再実行・build／pack・実展開は行っていない。
